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
