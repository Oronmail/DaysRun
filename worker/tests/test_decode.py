# worker/tests/test_decode.py
import json, pathlib
from ggrstats.decode import decode

FIX = pathlib.Path(__file__).parent / "fixtures"

def test_decode_matches_reference_decoder():
    raw = (FIX / "AllPositions3.20260915T1600.bin").read_bytes()
    expected = json.load(open(FIX / "AllPositions3.20260915T1600.decyb.json"))
    got = decode(raw)
    assert [t["id"] for t in got] == [t["id"] for t in expected]
    for g, e in zip(got, expected):
        assert len(g["moments"]) == len(e["moments"]), g["id"]
        for gm, em in zip(g["moments"], e["moments"]):
            assert gm["at"] == em["at"]
            assert gm["dtf"] == em["dtf"]
            assert abs(gm["lat"] - em["lat"]) < 1e-5
            assert abs(gm["lon"] - em["lon"]) < 1e-5

def test_decode_newest_first_and_plausible():
    got = decode((FIX / "AllPositions3.20260915T1600.bin").read_bytes())
    boat = next(t for t in got if t["id"] == 6)               # Damien Guillou
    ats = [m["at"] for m in boat["moments"]]
    assert ats == sorted(ats, reverse=True)
    assert 25 < boat["moments"][0]["lat"] < 50 and -25 < boat["moments"][0]["lon"] < 5
