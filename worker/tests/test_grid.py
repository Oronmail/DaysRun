# worker/tests/test_grid.py
import gzip, json, pathlib
from ggrstats import grid
from ggrstats.config import START_AT

FIX = pathlib.Path(__file__).parent / "fixtures"
T = 1789516800                                   # 2026-09-16 00:00:00 UTC
KT = grid.slot_of(T)

def load(tid):
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    return sorted(next(t for t in teams if t["id"] == tid)["moments"], key=lambda m: m["at"])

def test_gc_and_bearing():
    assert abs(grid.gc_nm(0, 0, 0, 1) - 60.0) < 0.05           # one degree of longitude on the equator
    assert abs(grid.bearing_deg(0, 0, 1, 0) - 0.0) < 1e-6          # due north
    assert abs(grid.bearing_deg(0, 0, 0, 1) - 90.0) < 1e-6         # due east

def test_resample_drops_start_day_burst_and_keeps_six_per_day():
    slots = grid.resample(load(6), START_AT)                        # Damien
    day = [k for k in slots if 1789171200 <= grid.slot_time(k) < 1789257600]   # 12 Sep UTC
    assert len(day) == 6
    assert all(abs(slots[k]["at"] - grid.slot_time(k)) <= 1200 for k in slots)

def test_run24_matches_golden():
    golden = {b["id"]: b for b in json.load(open(FIX / "golden.snap.json"))["boats"]}
    for tid in (6, 10, 12, 2):                                      # Damien, Pat, Henry, Louis
        slots = grid.resample(load(tid), START_AT)
        w = grid.window(slots, KT, 6)
        assert round(w["dist_nm"]) == golden[tid]["run24"], tid

def test_window_bridges_a_missed_report_only_in_display_mode():
    slots = grid.resample(load(16), START_AT)                       # Andrea missed the 1600 and 0000 reports
    assert KT not in slots
    kl = max(k for k in slots if k <= KT)
    assert grid.slot_time(kl) == T - 4 * 3600
    w = grid.window(slots, kl, 6)
    assert round(w["dist_nm"]) == 124 and w["bridged"] is True
    assert grid.window(slots, kl, 6, strict=True) is None            # a record window may not bridge
    assert grid.window(slots, kl, 1) is not None and grid.window(slots, kl, 1, strict=True) is None   # an 8-hour "leg" is not a 4-hour leg

def test_legs_returns_one_entry_per_slot_with_gaps():
    slots = grid.resample(load(9), START_AT)                        # Pär: in port until 9 Sep
    L = grid.legs(slots, KT, n=42)
    assert len(L) == 42
    assert L[-1]["dist_nm"] is not None and L[0]["dist_nm"] is None
