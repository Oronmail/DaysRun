# worker/tests/test_course_line.py — every fix of a race measured on one course line: the 2026 fixture is the answer key (YB's own dtf).
import gzip, json, pathlib, statistics
from ggrstats import course
FIX = pathlib.Path(__file__).parent / "fixtures"

def test_line_reproduces_yb_distance_to_finish_for_2026():
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    line = course.Line(setup["course"]["nodes"])
    assert abs(line.total_nm - setup["course"]["distance"] / 1.852) < 0.2
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    errs = []
    for t in teams:
        if t["id"] in (978, 940, 957, 985): continue                                  # the replays are not on this course's timeline
        i0 = 0
        for m in sorted(t["moments"], key=lambda m: m["at"])[::5]:
            if not m.get("dtf"): continue
            togo, i0 = line.togo(m["lat"], m["lon"], i0)
            errs.append(togo - m["dtf"] / 1852.0)
    assert len(errs) > 500
    assert abs(statistics.median(errs)) < 0.5                                        # measured 18 Sep 2026: median +0.08 nm over 4,336 fixes
    assert sorted(abs(e) for e in errs)[int(len(errs) * 0.95)] < 8.0                   # 95% within 6.4 nm

def test_forward_only_search_stays_on_the_earlier_leg_even_when_a_later_leg_is_geometrically_nearer():
    # A course that runs out and doubles back close to itself: a point near the start of leg 0 sits nearer to leg 2 (which
    # runs back the other way, 0.05 deg to the north) than to leg 0 or leg 1. Searched with i0 on leg 0 and a window that
    # excludes leg 2 but still offers a choice (leg 0 and leg 1 both visible), the nearer-but-out-of-window leg 2 must not
    # win — that is what "forward-only" has to mean, not merely "the only leg available".
    nodes = [{"lat": 0.0, "lon": 0.0}, {"lat": 0.0, "lon": 1.0}, {"lat": 0.05, "lon": 1.0}, {"lat": 0.05, "lon": 0.0}]
    line = course.Line(nodes)
    togo, i = line.togo(0.04, 0.01, 0, back=0, ahead=2)             # window [0, 2): legs 0 and 1 visible, leg 2 is not
    assert i == 0                                                   # leg 0 (0.04 away) correctly beats leg 1 (nearly a degree away)
    togo_wide, j = line.togo(0.04, 0.01, 0, back=0, ahead=3)        # window [0, 3): leg 2 is now visible, and nearer (0.01 away)
    assert j == 2 and togo_wide < togo                              # the jump the forward-only search exists to prevent

def test_finish_is_zero_and_start_is_the_whole_course():
    # Start and finish are the same water (Les Sables-d'Olonne), so at that position leg 0 (t=0) and leg 1 (t=1) tie exactly;
    # the tie-break (shared with mark_togo: the earlier leg wins) must not be allowed to pull the finish query back to leg 0.
    # On the real, 511-node course `back=3` never reaches that far, so here the second call states its own `back=0`, which is
    # what "the boat is now on the last leg" means for a course this short — not the toy course accidentally exercising a
    # tie that the production defaults, sized for hundreds of legs, would never create.
    nodes = [{"lat": 46.5, "lon": -1.8}, {"lat": 44.0, "lon": -9.0}, {"lat": 46.5, "lon": -1.8}]
    line = course.Line(nodes)
    assert line.togo(46.5, -1.8, 0)[0] > line.total_nm - 0.01
    assert line.togo(46.5, -1.8, 1, back=0)[0] < 0.01
