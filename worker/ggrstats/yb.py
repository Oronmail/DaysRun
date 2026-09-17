# worker/ggrstats/yb.py
"""Fetch the four YB endpoints for a race and keep a timestamped gzip of each on disk.

YB thins its own archive within days, so the raw snapshot is the only permanent record.
All four endpoints answer with CORS * and cache-control max-age 3-5 s (data source map §1).
"""
import gzip, pathlib, time
from datetime import datetime, timezone
import requests
from . import config

HOSTS = ("https://cf.yb.tl", "https://yb.tl")
ENDPOINTS = {
    "RaceSetup": "JSON/{race}/RaceSetup",
    "leaderboard": "JSON/{race}/leaderboard",
    "zegments": "JSON/{race}/zegments",
    "AllPositions3": "BIN/{race}/AllPositions3",
}

class FetchError(RuntimeError):
    pass

def fetch(race, name, session=None, timeout=30, attempts=3, backoff=5.0):
    """Return the raw bytes of one endpoint, trying both hosts and retrying with backoff."""
    session = session or requests.Session()
    path = ENDPOINTS[name].format(race=race)
    last = None
    for attempt in range(attempts):
        for host in HOSTS:
            try:
                r = session.get(f"{host}/{path}", timeout=timeout, headers={"User-Agent": config.USER_AGENT})
                if r.status_code == 200 and r.content:
                    return r.content
                last = f"HTTP {r.status_code} from {host}"
            except requests.RequestException as e:      # network error: try the next host
                last = f"{type(e).__name__} from {host}"
        if attempt < attempts - 1:
            time.sleep(backoff * (attempt + 1))
    raise FetchError(f"{name}: {last}")

def snapshot(race, snapdir, session=None, now=None):
    """Fetch every endpoint and write <snapdir>/<race>/<name>.<YYYYMMDDTHHMM>.gz. Returns {name: (bytes, path)}."""
    now = int(now if now is not None else time.time())
    stamp = datetime.fromtimestamp(now, timezone.utc).strftime("%Y%m%dT%H%M")
    d = pathlib.Path(snapdir) / race
    d.mkdir(parents=True, exist_ok=True)
    out = {}
    for name in ENDPOINTS:
        data = fetch(race, name, session=session)
        p = d / f"{name}.{stamp}.gz"
        with gzip.open(p, "wb") as fh:
            fh.write(data)
        out[name] = (data, p)
    return out
