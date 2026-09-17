# worker/tests/test_stats.py
import gzip, json, pathlib
from datetime import datetime, timezone
from ggrstats import stats, grid
from ggrstats.config import START_AT

FIX = pathlib.Path(__file__).parent / "fixtures"
T = 1789516800
GOLD = json.load(open(FIX / "golden.snap.json"))
GB = {b["id"]: b for b in GOLD["boats"]}

def fleet():
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    return {t["id"]: stats.sorted_fixes(t["moments"]) for t in teams}

def setup():
    return json.load(open(FIX / "RaceSetup.20260916.json"))

def hhmm(unix):
    return datetime.fromtimestamp(unix, timezone.utc).strftime("%H%M")

def test_restart_detected_only_for_par():
    fx = fleet()
    found = {tid: stats.detect_restart(fx[tid], START_AT) for tid in fx if tid < 900}
    assert [tid for tid, r in found.items() if r] == [9]
    r = found[9]
    assert hhmm(r["last_in_port_at"]) == "0000" and datetime.fromtimestamp(r["last_in_port_at"], timezone.utc).day == 9
    assert hhmm(r["first_out_at"]) == "2000" and datetime.fromtimestamp(r["first_out_at"], timezone.utc).day == 9

def test_ranking_and_gaps_match_golden():
    fx = fleet()
    racing = {tid: f for tid, f in fx.items() if tid < 900}
    ranks = stats.rank_at(racing, T)
    for tid, b in GB.items():
        assert ranks[tid] == b["rank"], tid
    order = sorted(ranks, key=ranks.get)
    assert order[:3] == [6, 10, 17]                       # Damien, Pat, Ertan

def test_rank_change_vs_24h_ago():
    fx = fleet()
    racing = {tid: f for tid, f in fx.items() if tid < 900}
    now, then = stats.rank_at(racing, T), stats.rank_at(racing, T - 86400)
    for tid, b in GB.items():
        assert then[tid] - now[tid] == b["chg"], tid

def test_position_text():
    assert stats.position_text(29.5567, -13.665) == "29°33.4′N 013°39.9′W"
    assert stats.position_text(29.99999, -13.999999) == "30°00.0′N 014°00.0′W"   # minutes never print as 60.0
    assert stats.position_text(-0.04, 0.0) == "00°02.4′S 000°00.0′E"

def test_personal_bests_match_audited_golden():
    """Values from the 2026-09-16 numbers audit (an independent recomputation): records never bridge, grid = nearest fix."""
    fx = fleet()
    for tid, best7_expected in ((6, 1037), (16, None), (12, None)):     # Damien, Andrea, Henry
        slots = grid.resample(fx[tid], START_AT)
        best4, best24, best7 = stats.personal_bests(slots, grid.slot_of(T), 0, START_AT)
        assert round(best4[0], 1) == GB[tid]["best4"]
        assert round(best24[0]) == GB[tid]["best24"]
        if best7_expected is None:
            assert best7[1] is None                          # no 7-day window without a missed report exists yet
        else:
            assert abs(best7[0] - best7_expected) <= 3
    slots = grid.resample(fx[3], START_AT)                   # Guido: the 156 nm window bridged a missed report
    assert round(stats.personal_bests(slots, grid.slot_of(T), 0, START_AT)[1][0]) == 150
