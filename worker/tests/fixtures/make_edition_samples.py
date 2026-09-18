# worker/tests/fixtures/make_edition_samples.py — how the past-races fixtures were made.
"""Whole tracks of a few boats of 2018 and 2022 from YB's own public endpoints, for the tests of editions.py (task 5).
Needs the network: fetches YB's live RaceSetup, zegments and AllPositions3 for each race (the same addresses the live
worker reads every hour) and keeps only the sampled boats. Run once from worker/, with the worktree's environment active:

    cd worker && python tests/fixtures/make_edition_samples.py

Re-running reproduces the same bytes when YB's underlying data has not changed: the JSON we build is compact and
deterministic (teams sorted by id, each boat's moments sorted by time). zegments is kept exactly as YB serves it."""
import gzip, json, pathlib
from ggrstats import decode, yb

FIX = pathlib.Path(__file__).parent
KEEP = {"ggr2018": {8, 7, 68, 94}, "ggr2022": {11, 7, 4, 14, 1}}

def make(race, ids):
    teams = sorted((t for t in decode.decode(yb.fetch(race, "AllPositions3")) if t["id"] in ids), key=lambda t: t["id"])
    for t in teams:
        t["moments"].sort(key=lambda m: m["at"])
    with gzip.open(FIX / f"{race}.sample.json.gz", "wt") as fh:
        json.dump(teams, fh, separators=(",", ":"))
    setup = json.loads(yb.fetch(race, "RaceSetup"))
    setup["teams"] = sorted((t for t in setup["teams"] if t["id"] in ids), key=lambda t: t["id"])
    (FIX / f"RaceSetup.{race}.json").write_text(json.dumps(setup, separators=(",", ":")))
    (FIX / f"zegments.{race}.json").write_text(yb.fetch(race, "zegments").decode())
    print(race, sum(len(t["moments"]) for t in teams), "fixes:", {t["id"]: len(t["moments"]) for t in teams})

if __name__ == "__main__":
    for race, ids in KEEP.items():
        make(race, ids)
