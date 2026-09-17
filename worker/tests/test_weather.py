# worker/tests/test_weather.py
import json, pathlib
from ggrstats import weather

FIX = pathlib.Path(__file__).parent / "fixtures"

class FakeSession:
    def get(self, url, timeout=None, headers=None, params=None):
        class R:
            status_code = 200
            def __init__(self, payload): self._p = payload
            def json(self): return self._p
            def raise_for_status(self): pass
        name = "openmeteo.marine.json" if "marine-api" in url else "openmeteo.forecast.json"
        return R(json.load(open(FIX / name)))

def test_fetch_conditions_parses_both_apis_and_converts_current():
    pts = [{"team_id": 6, "fix_at": 1789516800, "lat": 29.556, "lon": -13.665},
           {"team_id": 10, "fix_at": 1789516800, "lat": 30.483, "lon": -13.338}]
    rows = weather.fetch_conditions(pts, session=FakeSession(), now=1789520000)
    assert [r["team_id"] for r in rows] == [6, 10]
    r = rows[0]
    assert 0 <= r["wind_kn"] < 80 and r["gust_kn"] >= r["wind_kn"]
    assert 0 <= r["wind_dir_deg"] < 360 and 900 < r["mslp_hpa"] < 1100
    assert r["current_kn"] < 5 and r["wave_m"] >= 0 and r["fetched_at"] == 1789520000

def test_hour_index_picks_the_fix_hour():
    assert weather.hour_index(["2026-09-16T00:00", "2026-09-16T01:00"], 1789516800 + 3600) == 1
