# worker/tests/fixtures/make_edition_samples.py — how the past-races fixtures were made.
"""Whole tracks of a few boats of 2018 and 2022 from YB's own public endpoints, for the tests of editions.py (task 5).
Needs the network: fetches YB's live RaceSetup, zegments and AllPositions3 for each race (the same addresses the live
worker reads every hour) and keeps only the sampled boats. Run once from worker/, with the worktree's environment active:

    cd worker && python tests/fixtures/make_edition_samples.py

All three of a race's fetches are made before anything is written, so a failed fetch never leaves a half-updated set
of files. The JSON we build is compact and deterministic (teams sorted by id, each boat's moments sorted by time),
and `.sample.json.gz` is written with `gzip.compress(..., mtime=0)` as raw bytes: no file name in the gzip header and
a fixed mtime, so the same JSON text always gzips to the same bytes (`gzip.open(path, "wt")` embeds the wall-clock
time and the path's basename instead, so it would not). Re-running the whole script reproduces the same bytes only
when YB's underlying data has not changed. zegments is kept exactly as YB serves it."""
import gzip, json, pathlib
from ggrstats import decode, yb

FIX = pathlib.Path(__file__).parent
KEEP = {"ggr2018": {8, 7, 68, 94}, "ggr2022": {11, 7, 4, 14, 1}}

def make(race, ids):
    raw_positions = yb.fetch(race, "AllPositions3")            # all three fetched before anything is written
    raw_setup = yb.fetch(race, "RaceSetup")
    raw_zeg = yb.fetch(race, "zegments")

    teams = sorted((t for t in decode.decode(raw_positions) if t["id"] in ids), key=lambda t: t["id"])
    for t in teams:
        t["moments"].sort(key=lambda m: m["at"])
    (FIX / f"{race}.sample.json.gz").write_bytes(gzip.compress(json.dumps(teams, separators=(",", ":")).encode("utf-8"), mtime=0))

    setup = json.loads(raw_setup)
    setup["teams"] = sorted((t for t in setup["teams"] if t["id"] in ids), key=lambda t: t["id"])
    (FIX / f"RaceSetup.{race}.json").write_text(json.dumps(setup, separators=(",", ":")))

    (FIX / f"zegments.{race}.json").write_text(raw_zeg.decode())
    print(race, sum(len(t["moments"]) for t in teams), "fixes:", {t["id"]: len(t["moments"]) for t in teams})

if __name__ == "__main__":
    for race, ids in KEEP.items():
        make(race, ids)
