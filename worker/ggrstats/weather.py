# worker/ggrstats/weather.py
"""Model conditions at each boat's latest fix, from Open-Meteo (CC BY 4.0; free tier is non-commercial, < 10,000 calls/day).
Two calls per run: one forecast call and one marine call, each with every boat's coordinates."""
import time
from datetime import datetime, timezone
import requests
from . import config

FORECAST = "https://api.open-meteo.com/v1/forecast"
MARINE = "https://marine-api.open-meteo.com/v1/marine"

def hour_index(times, fix_at):
    want = datetime.fromtimestamp(fix_at, timezone.utc).strftime("%Y-%m-%dT%H:00")
    return times.index(want)

def _get(session, url, params):
    r = session.get(url, params=params, timeout=30, headers={"User-Agent": config.USER_AGENT})
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else [data]

def fetch_conditions(points, session=None, now=None):
    if not points:
        return []
    session = session or requests.Session()
    now = int(now if now is not None else time.time())
    lats = ",".join(f"{p['lat']:.3f}" for p in points)
    lons = ",".join(f"{p['lon']:.3f}" for p in points)
    day0 = datetime.fromtimestamp(min(p["fix_at"] for p in points), timezone.utc).strftime("%Y-%m-%d")
    day1 = datetime.fromtimestamp(max(p["fix_at"] for p in points), timezone.utc).strftime("%Y-%m-%d")
    fc = _get(session, FORECAST, {"latitude": lats, "longitude": lons, "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl",
                                  "wind_speed_unit": "kn", "start_date": day0, "end_date": day1, "timezone": "UTC"})
    ma = _get(session, MARINE, {"latitude": lats, "longitude": lons, "hourly": "wave_height,swell_wave_height,swell_wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature",
                                "start_date": day0, "end_date": day1, "timezone": "UTC"})
    rows = []
    for p, f, m in zip(points, fc, ma):
        i, j = hour_index(f["hourly"]["time"], p["fix_at"]), hour_index(m["hourly"]["time"], p["fix_at"])
        fh, mh = f["hourly"], m["hourly"]
        cur_kmh = mh["ocean_current_velocity"][j]
        rows.append({"team_id": p["team_id"], "fix_at": p["fix_at"], "lat": p["lat"], "lon": p["lon"],
                     "wind_kn": fh["wind_speed_10m"][i], "gust_kn": fh["wind_gusts_10m"][i], "wind_dir_deg": fh["wind_direction_10m"][i],
                     "mslp_hpa": fh["pressure_msl"][i], "wave_m": mh["wave_height"][j], "swell_m": mh["swell_wave_height"][j],
                     "swell_period_s": mh["swell_wave_period"][j], "current_kn": None if cur_kmh is None else cur_kmh / 1.852,
                     "current_dir_deg": mh["ocean_current_direction"][j], "sst_c": mh["sea_surface_temperature"][j], "fetched_at": now})
    return rows

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

class RetryableWeatherError(RuntimeError):
    """Open-Meteo's archive fails in ways worth waiting out, not raising for hours: HTTP 429 or 5xx, a dropped connection
    or timeout, a 200 whose body isn't JSON (seen 18 Sep 2026: 'Unexpected error while streaming data: timeoutReached'),
    or Open-Meteo's own {"error": true, "reason": ...} shape inside a 200. Any other 4xx is left as raise_for_status()
    makes it: a programming error must not be retried for hours."""

def _archive_get(session, params):
    try:
        r = session.get(ARCHIVE, params=params, timeout=45, headers={"User-Agent": config.USER_AGENT})
    except requests.RequestException as e:
        raise RetryableWeatherError(f"archive request failed: {e}") from e
    if r.status_code == 429 or r.status_code >= 500:
        raise RetryableWeatherError(f"archive returned HTTP {r.status_code}")
    r.raise_for_status()
    try:
        data = r.json()
    except ValueError as e:
        raise RetryableWeatherError(f"archive body was not JSON: {e}") from e
    if isinstance(data, dict) and data.get("error"):
        raise RetryableWeatherError(f"archive error: {data.get('reason')}")
    rows = data if isinstance(data, list) else [data]
    want = len(params["latitude"].split(","))
    if len(rows) != want:          # never zip a short or long answer onto the wrong boats
        raise RetryableWeatherError(f"archive answered {len(rows)} locations for {want} asked")
    return rows

def fetch_archive_wind(points, session=None, model="ecmwf_ifs", batch=20):
    """Model wind at the end of past 4-hour legs, for the Past races page: Open-Meteo's ARCHIVE with one named model
    pinned (default ecmwf_ifs) so every past fix comes from the same product and 'best match' can never silently mix
    models — checked 18 Sep 2026, the archive answers for ocean positions of July 2018, January 2019 and 2022 with that
    model. One call per UTC date; points go out in chunks of at most `batch` locations, `batch` at least 1 (the free
    tier hangs or 429s on big multi-location calls). A null in the model's answer for a point's hour is still returned
    as a row, with wind_kt/wind_dir_deg of None, so that slot is stored and never re-asked.

    ONE CALL IS ALL-OR-NOTHING: on any failure — a chunk's RetryableWeatherError, an HTTPError, a location-count
    mismatch, an hour missing from the answer — this raises and returns no rows at all, even the rows of chunks that
    had already succeeded; a caller that resumes after that would re-request them, spending an allowance that is
    counted per location per day. A caller that must keep partial progress across a failure passes at most `batch`
    points per call itself and stores each batch's rows before asking for the next; the internal chunking above is
    only for a caller that does not need that, and rows always come back in the order of `points` within one call."""
    if batch < 1:
        raise ValueError("batch must be at least 1")
    if not points:
        return []
    days = {datetime.fromtimestamp(p["slot_at"], timezone.utc).strftime("%Y-%m-%d") for p in points}
    if len(days) != 1:
        raise ValueError(f"fetch_archive_wind: one call is one UTC date, got {sorted(days)}")
    day = days.pop(); session = session or requests.Session()
    rows = []
    for i in range(0, len(points), batch):
        chunk = points[i:i + batch]
        res = _archive_get(session, {"latitude": ",".join(f"{p['lat']:.3f}" for p in chunk), "longitude": ",".join(f"{p['lon']:.3f}" for p in chunk),
                                     "hourly": "wind_speed_10m,wind_direction_10m", "wind_speed_unit": "kn", "models": model,
                                     "start_date": day, "end_date": day, "timezone": "UTC"})
        for p, r in zip(chunk, res):
            try:
                j = hour_index(r["hourly"]["time"], p["slot_at"])
            except ValueError as e:
                raise RetryableWeatherError(f"archive missing the hour for slot_at {p['slot_at']}: {e}") from e
            rows.append({"team_id": p["team_id"], "slot_at": p["slot_at"], "wind_kt": r["hourly"]["wind_speed_10m"][j],
                         "wind_dir_deg": r["hourly"]["wind_direction_10m"][j], "model": model})
    return rows
