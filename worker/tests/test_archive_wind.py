# worker/tests/test_archive_wind.py
import json
import pytest
import requests
from ggrstats import weather

class FakeSession:
    """A session whose archive answer is built from the request's own params, so one class serves a single point, a
    two-point call and the 45-point batching case: n>1 locations get a list back, one location gets a bare object, as
    the real API does."""
    def __init__(self):
        self.calls = []
        self.timeouts = []
    def get(self, url, params=None, timeout=None, headers=None):
        self.calls.append((url, params))
        self.timeouts.append(timeout)
        n = len(params["latitude"].split(","))
        date = params["start_date"]
        def one():
            return {"latitude": 30.0, "longitude": -14.0,
                    "hourly": {"time": [f"{date}T{h:02d}:00" for h in range(24)],
                               "wind_speed_10m": [float(h) for h in range(24)],
                               "wind_direction_10m": [10.0 * h for h in range(24)]}}
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self): return [one() for _ in range(n)] if n > 1 else one()
        return R()

def test_archive_wind_is_read_at_the_slot_hour_with_the_model_pinned():
    s = FakeSession()
    rows = weather.fetch_archive_wind([{"team_id": 11, "slot_at": 1663329600, "lat": 30.0, "lon": -14.0},      # 2022-09-16 12:00 UTC
                                       {"team_id": 7, "slot_at": 1663344000, "lat": 31.0, "lon": -14.5}], session=s)   # 16:00
    url, params = s.calls[0]
    assert url == weather.ARCHIVE and params["models"] == "ecmwf_ifs" and params["wind_speed_unit"] == "kn"
    assert params["start_date"] == "2022-09-16" and params["end_date"] == "2022-09-16" and params["timezone"] == "UTC"
    assert rows[0] == {"team_id": 11, "slot_at": 1663329600, "wind_kt": 12.0, "wind_dir_deg": 120.0, "model": "ecmwf_ifs"}
    assert rows[1]["wind_kt"] == 16.0 and rows[1]["wind_dir_deg"] == 160.0

def test_points_must_share_one_date():
    with pytest.raises(ValueError):
        weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 0, "lon": 0},
                                    {"team_id": 1, "slot_at": 1663329600 + 86400, "lat": 0, "lon": 0}], session=FakeSession())

def test_a_one_location_call_gets_a_bare_object_back_not_a_list():
    rows = weather.fetch_archive_wind([{"team_id": 3, "slot_at": 1663329600, "lat": 30.0, "lon": -14.0}], session=FakeSession())
    assert len(rows) == 1 and rows[0] == {"team_id": 3, "slot_at": 1663329600, "wind_kt": 12.0, "wind_dir_deg": 120.0, "model": "ecmwf_ifs"}

def test_45_points_on_one_date_go_out_in_batches_of_20_20_and_5_and_come_back_in_order():
    base = 1677628800  # 2023-03-01 00:00:00 UTC
    points = [{"team_id": i, "slot_at": base + (i % 24) * 3600, "lat": 30.0, "lon": -14.0} for i in range(45)]
    s = FakeSession()
    rows = weather.fetch_archive_wind(points, session=s)
    assert [len(params["latitude"].split(",")) for _, params in s.calls] == [20, 20, 5]
    assert len(rows) == 45
    assert [r["team_id"] for r in rows] == list(range(45))
    assert all(rows[i]["wind_kt"] == float(i % 24) for i in range(45))

def test_a_plain_text_body_inside_a_200_is_retryable():
    class R:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): raise json.JSONDecodeError("Expecting value", "Unexpected error while streaming data: timeoutReached", 0)
    class S:
        def get(self, url, params=None, timeout=None, headers=None): return R()
    with pytest.raises(weather.RetryableWeatherError):
        weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 0, "lon": 0}], session=S())

def test_a_429_is_retryable():
    class R:
        status_code = 429
        def raise_for_status(self): raise requests.exceptions.HTTPError("429 Too Many Requests")
        def json(self): return {}
    class S:
        def get(self, url, params=None, timeout=None, headers=None): return R()
    with pytest.raises(weather.RetryableWeatherError):
        weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 0, "lon": 0}], session=S())

def test_a_400_is_not_retryable_but_stays_an_http_error():
    class R:
        status_code = 400
        def raise_for_status(self): raise requests.exceptions.HTTPError("400 Client Error")
        def json(self): return {}
    class S:
        def get(self, url, params=None, timeout=None, headers=None): return R()
    with pytest.raises(requests.exceptions.HTTPError):
        weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 0, "lon": 0}], session=S())

def test_open_meteos_own_error_shape_inside_a_200_is_retryable():
    class R:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {"error": True, "reason": "Parameter 'models' is invalid"}
    class S:
        def get(self, url, params=None, timeout=None, headers=None): return R()
    with pytest.raises(weather.RetryableWeatherError):
        weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 0, "lon": 0}], session=S())

def test_a_dropped_connection_or_timeout_is_retryable():
    class S:
        def get(self, url, params=None, timeout=None, headers=None): raise requests.exceptions.Timeout("timed out")
    with pytest.raises(weather.RetryableWeatherError):
        weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 0, "lon": 0}], session=S())

def test_a_null_in_the_models_answer_gives_a_row_with_none_not_a_missing_row():
    class R:
        status_code = 200
        def raise_for_status(self): pass
        def json(self):
            return {"latitude": 30.0, "longitude": -14.0,
                    "hourly": {"time": [f"2022-09-16T{h:02d}:00" for h in range(24)],
                               "wind_speed_10m": [None if h == 12 else float(h) for h in range(24)],
                               "wind_direction_10m": [None if h == 12 else 10.0 * h for h in range(24)]}}
    class S:
        def get(self, url, params=None, timeout=None, headers=None): return R()
    rows = weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 30.0, "lon": -14.0}], session=S())
    assert rows == [{"team_id": 1, "slot_at": 1663329600, "wind_kt": None, "wind_dir_deg": None, "model": "ecmwf_ifs"}]

def test_the_archive_call_uses_a_45_second_timeout():
    s = FakeSession()
    weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 30.0, "lon": -14.0}], session=s)
    assert s.timeouts == [45]

def test_a_location_count_mismatch_is_retryable_and_names_both_counts():
    class R:                          # asked for 4 locations, the service answers for 3 — must never be zipped onto the wrong boats
        status_code = 200
        def raise_for_status(self): pass
        def json(self):
            return [{"latitude": 30.0, "longitude": -14.0, "hourly": {"time": [f"2022-09-16T{h:02d}:00" for h in range(24)],
                     "wind_speed_10m": [float(h) for h in range(24)], "wind_direction_10m": [10.0 * h for h in range(24)]}} for _ in range(3)]
    class S:
        def get(self, url, params=None, timeout=None, headers=None): return R()
    points = [{"team_id": i, "slot_at": 1663329600, "lat": 30.0, "lon": -14.0} for i in range(4)]
    with pytest.raises(weather.RetryableWeatherError) as exc:
        weather.fetch_archive_wind(points, session=S())
    assert "4" in str(exc.value) and "3" in str(exc.value)

def test_a_missing_hour_in_the_archives_answer_is_retryable_not_a_bare_value_error():
    class R:
        status_code = 200
        def raise_for_status(self): pass
        def json(self):
            return {"latitude": 30.0, "longitude": -14.0,          # only hours 0-11; the slot below wants 12:00
                    "hourly": {"time": [f"2022-09-16T{h:02d}:00" for h in range(12)],
                               "wind_speed_10m": [float(h) for h in range(12)], "wind_direction_10m": [10.0 * h for h in range(12)]}}
    class S:
        def get(self, url, params=None, timeout=None, headers=None): return R()
    with pytest.raises(weather.RetryableWeatherError):
        weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 30.0, "lon": -14.0}], session=S())  # 12:00 UTC

def test_batch_must_be_at_least_1_and_is_checked_before_any_request():
    for bad in (0, -1):
        with pytest.raises(ValueError):
            weather.fetch_archive_wind([{"team_id": 1, "slot_at": 1663329600, "lat": 0, "lon": 0}], batch=bad)  # no session: a real
            # request would blow up differently if the check came too late — proves the check precedes any call

def test_a_failure_partway_through_batching_discards_the_earlier_batches_rows_too():
    """The all-or-nothing contract: batching bounds one HTTP call's size, it is not a partial-progress safety net."""
    good = FakeSession()
    class S:
        def __init__(self): self.n = 0
        def get(self, url, params=None, timeout=None, headers=None):
            self.n += 1
            if self.n == 2:
                class Bad:
                    status_code = 500
                    def raise_for_status(self): pass
                    def json(self): return {}
                return Bad()
            return good.get(url, params=params, timeout=timeout, headers=headers)
    points = [{"team_id": i, "slot_at": 1663329600, "lat": 30.0, "lon": -14.0} for i in range(25)]  # batch=20 -> two calls, second fails
    with pytest.raises(weather.RetryableWeatherError):
        weather.fetch_archive_wind(points, session=S(), batch=20)
