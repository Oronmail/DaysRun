# worker/tests/test_smoke.py
import gzip, json, pathlib

FIX = pathlib.Path(__file__).parent / "fixtures"

def test_fixtures_present():
    for name in ["AllPositions3.master.20260916T0230.json.gz", "AllPositions3.20260915T1600.bin",
                 "AllPositions3.20260915T1600.decyb.json", "RaceSetup.20260916.json",
                 "Leaderboard.20260915T2200.json", "zegments.20260915T2159.json", "golden.snap.json"]:
        assert (FIX / name).exists(), name

def test_master_track_shape():
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    assert len(teams) == 20
    ids = {t["id"] for t in teams}
    assert {940, 957, 978, 985} <= ids           # the four ghost replays
    assert sum(len(t["moments"]) for t in teams) >= 14000
