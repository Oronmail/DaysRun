# worker/tests/test_backfill.py
import pathlib
from ggrstats import backfill

def test_snapshot_stamp_parses_filename():
    assert backfill.snapshot_stamp(pathlib.Path("AllPositions3.20260915T1600.gz")) == 1789488000

def test_slots_between():
    slots = backfill.slots_between(1788697800, 1788780000)          # gun → 7 Sep 11:20
    assert slots[0] == 1788710400 and slots[-1] == 1788768000 and len(slots) == 5   # 6 Sep 16:00 … 7 Sep 08:00
