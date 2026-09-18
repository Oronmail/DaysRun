# worker/ggrstats/backup.py
"""Raw snapshots live in the private Supabase Storage bucket `raw-snapshots` (the GitHub runner has no disk).
Needs SUPABASE_URL and SUPABASE_SERVICE_KEY (service role — worker only, never the site)."""
import os, pathlib, requests
from . import config

BUCKET = "raw-snapshots"

def _headers(key, content_type=None):
    h = {"Authorization": f"Bearer {key}", "apikey": key, "x-upsert": "true"}
    if content_type:
        h["Content-Type"] = content_type
    return h

def upload_files(paths, url=None, key=None, session=None, race=None):
    """Upload the given local gzip files as <race>/<filename>; existing objects are overwritten. Returns the count.
    race: the folder to write into, for the files of a past race; the live capture leaves it out and keeps config.RACE_KEY,
    so an import of 2018 can never land beside — or with x-upsert over — this year's snapshots."""
    url = url or os.environ["SUPABASE_URL"]
    key = key or os.environ["SUPABASE_SERVICE_KEY"]
    session = session or requests.Session()
    folder = race or config.RACE_KEY
    n = 0
    for p in map(pathlib.Path, paths):
        with open(p, "rb") as fh:
            r = session.post(f"{url}/storage/v1/object/{BUCKET}/{folder}/{p.name}", data=fh,
                             headers=_headers(key, "application/gzip"), timeout=120)
        r.raise_for_status()
        n += 1
    return n

def upload_new(directory=None, url=None, key=None, session=None):
    """One-off: upload every *.gz in a directory that the bucket does not have yet (used to migrate an existing
    archive of snapshots in Task 10 step 12). Default directory: <SNAPDIR>/<race>."""
    url = url or os.environ["SUPABASE_URL"]
    key = key or os.environ["SUPABASE_SERVICE_KEY"]
    session = session or requests.Session()
    base = pathlib.Path(directory) if directory else pathlib.Path(config.SNAPDIR) / config.RACE_KEY
    r = session.post(f"{url}/storage/v1/object/list/{BUCKET}", json={"prefix": config.RACE_KEY, "limit": 100000},
                     headers=_headers(key), timeout=60)
    have = {o["name"] for o in r.json()} if r.status_code == 200 else set()
    return upload_files([p for p in sorted(base.glob("*.gz")) if p.name not in have], url, key, session)

if __name__ == "__main__":
    import sys
    print("uploaded", upload_new(sys.argv[1] if len(sys.argv) > 1 else None))
