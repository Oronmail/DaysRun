# worker/tests/test_editions.py — the fleets of past races. Every figure the page shows is checked twice: against the
# worker's own rules (grid.window, stats.personal_bests, perf.point_of_sail) and against YB's real 2018 and 2022 files.
import gzip, json, pathlib
from datetime import datetime, timezone
from ggrstats import config, course, db, editions, editions_data, perf, stats
from ggrstats.config import START_AT
from ggrstats.grid import SLOT_S, gc_nm, resample, slot_of, slot_time

FIX = pathlib.Path(__file__).parent / "fixtures"
U = lambda s: int(datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp())

def straight(start_at, nm_per_leg, n_legs, first_at=None, gap_at=()):
    """A boat sailing due south from 46.5N 1.79W at nm_per_leg every 4 hours, fixes stamped 7 s after the slot (as YB does);
    gap_at: slot indexes with no fix."""
    out = []
    for i in range(n_legs + 1):
        if i in gap_at: continue
        out.append({"at": (first_at or start_at) + i * SLOT_S + 7, "lat": 46.5 - i * nm_per_leg / 60.0, "lon": -1.79, "dtf": 1})
    return out

def three_hourly(start_at, kn, hours):
    """A boat reporting every three hours, as the whole 2018 fleet did from 4 to 9 July: the 4-hour grid meets it at 00:00 and 12:00 only."""
    return [{"at": start_at + i * 3 * 3600, "lat": 46.5 - kn * (i * 3.0) / 60.0, "lon": -1.79, "dtf": 1} for i in range(hours // 3 + 1)]

NODES = [{"lat": 46.5, "lon": -1.79}, {"lat": 0.0, "lon": -1.79}]            # a straight course due south, 2,790 nm
LINE = course.Line(NODES); COURSE_NM = LINE.total_nm
START = U("2026-09-06T12:00:00")                                            # a slot boundary, so legs fall on the grid
SETUP26 = json.load(open(FIX / "RaceSetup.20260916.json"))                  # this year's course; the retired yardstick's line
LINE26 = course.Line(SETUP26["course"]["nodes"])                            # read by `projected` alone: the retired yardstick
T26 = 1789516800                                                            # 2026-09-16 00:00 UTC, the golden report
SETUPS = {race: json.load(open(FIX / f"RaceSetup.{race}.json")) for race in ("ggr2018", "ggr2022")}
# Each past race's OWN course, as the page now measures it: the length is YB's own course sum (run._measure), and the plain line
# is read for one thing only — a fix YB gave no distance to finish (measure_missing). corners=() because the swept-bearing
# measure smooths this year's Trindade dog-leg, which is no corner of either past course.
COURSE_NM_OF = {race: SETUPS[race]["course"]["distance"] / 1.852 for race in SETUPS}
LINES = {race: course.Line(SETUPS[race]["course"]["nodes"], corners=()) for race in SETUPS}

def on_a_line(fx, line, ended_at=None):
    """The RETIRED common yardstick, kept here as a fixture builder: cut, fill the three-hourly gaps, then measure every fix on
    ONE course line (editions.on_line). The page no longer does this — every fleet keeps YB's own distance to finish on its own
    course — but the synthetic boats below have no YB behind them, so this is how they are given a distance to finish that means
    what YB's means: their own progress along their own synthetic course."""
    return editions.on_line(editions.fill_slots(editions.cut(sorted(fx, key=lambda f: f["at"]), ended_at)), line)

def P(fx, ended_at=None, ended_how=None):
    return editions.prepare(on_a_line(fx, LINE, ended_at), START, ended_at, ended_how)

def load_sample(race):
    teams = json.load(gzip.open(FIX / f"{race}.sample.json.gz", "rt"))
    return {t["id"]: sorted(t["moments"], key=lambda m: m["at"]) for t in teams}

_PREPARED = {}
def prepared(race):
    """Every sampled boat of a past race as the PAGE prepares her: cut at her documented end, her three-hourly gaps filled, and on
    YB's own distance to finish for her own race — with the race's own course line behind it for the fixes YB gave no distance at
    all (measure_missing), which is exactly what run.cmd_editions hands compute. Computed once for the whole file."""
    if race not in _PREPARED:
        start, sample = editions_data.EDITIONS[race]["start"], load_sample(race)
        _PREPARED[race] = {r["id"]: editions.prepare(sample[r["id"]], start, r["ended_at"], r["ended_how"], fill=True, line=LINES[race])
                           for r in editions_data.TEAMS[race] if r["id"] in sample}
    return _PREPARED[race]

_PROJECTED = {}
def projected(race):
    """The same boats under the retired common yardstick, every fix measured on the 2026 line. Only the tests that record WHY that
    measure was abandoned read this; nothing the page publishes comes from it."""
    if race not in _PROJECTED:
        start, sample = editions_data.EDITIONS[race]["start"], load_sample(race)
        _PROJECTED[race] = {r["id"]: editions.prepare(on_a_line(sample[r["id"]], LINE26, r["ended_at"]), start, r["ended_at"], r["ended_how"])
                            for r in editions_data.TEAMS[race] if r["id"] in sample}
    return _PROJECTED[race]

def zeg_stop(race, name, index):
    z = json.load(open(FIX / f"zegments.{race}.json")); cid = next(c["id"] for c in z["course"] if c["index"] == index)
    t = next(t for tg in z["tags"] for t in tg["teams"] if t["name"] == name)
    return t["segments"][f"1-{cid}"]["stop"] // 1000

def hhmm(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M")

# ---------------------------------------------------------------- the race day, the line, the end

def test_race_day_is_a_utc_date_difference():
    assert START % SLOT_S == 0                                              # the helper's legs only fall on the grid if it is
    assert editions.race_day_of(START + 11 * 86400 + 12 * 3600, START) == 12
    assert editions.day_zero(START) == U("2026-09-06T00:00:00")

def test_on_line_measures_a_fix_on_this_course_and_keeps_the_finish():
    fx = editions.on_line([{"at": START, "lat": 46.5, "lon": -1.79, "dtf": 0}, {"at": START + 100, "lat": 0.0, "lon": -1.79, "dtf": 0}], LINE)
    assert abs(fx[0]["dtf"] / 1852 - COURSE_NM) < 0.5 and fx[1]["dtf"] == 1

def test_the_forward_search_widens_after_a_long_silence():
    """A course of half-mile legs: 40 legs ahead reach 20 nm. A boat silent for four days may be 30 nm on, and the search
    must be widened by the silence (amendment 7) or the distance to finish falls by far less than the boat sailed."""
    nodes = [{"lat": 46.5 - i * 0.5 / 60.0, "lon": -1.79} for i in range(201)]
    line = course.Line(nodes)
    far = {"at": START + 96 * 3600, "lat": 46.5 - 30.0 / 60.0, "lon": -1.79, "dtf": 1}
    near = dict(far, at=START + SLOT_S)
    fell = lambda fx: (fx[0]["dtf"] - fx[1]["dtf"]) / 1852.0
    assert abs(fell(editions.on_line([{"at": START, "lat": 46.5, "lon": -1.79, "dtf": 1}, far], line)) - 30.0) < 0.5
    assert fell(editions.on_line([{"at": START, "lat": 46.5, "lon": -1.79, "dtf": 1}, near], line)) < 25.0   # the window cannot reach

def test_distance_to_finish_outruns_the_boat_only_at_a_bend_or_where_2018_cut_this_years_trindade_corner():
    """THE RETIRED COMMON YARDSTICK, and the record of why it was retired: this measures the PROJECTION of both past fleets onto
    the 2026 course line (`projected`), which no page reads any more. Nothing here describes a figure the site publishes; it is
    kept with course.Line and course.CORNERS because the numbers below are the argument that one yardstick could not be had.

    Amendment 7's invariant, on every fix of both real samples: the distance to finish must not fall by more than the boat
    sailed between the two fixes, plus 5 nm. This test is the alarm for the Trindade measure, and it has rung once.

    THE TWO BIG ONES WERE REMOVED BY THE SWEPT-BEARING MEASURE ON 19 SEP 2026 (course.CORNERS, test_trindade.py). They were
    Jean-Luc Van Den Heede's 1,173.2 nm and Are Wiig's 984.7 nm, each a single four-hour leap across the corner's bisector where
    the nearest point of the polyline flips from one arm of the Trindade dog-leg to the other. Before the rule, 77 of 11,252 pairs
    broke the invariant, the median excess 16.4 nm; after it, 219 do, the median excess 10.3 nm and the largest 80.1 nm.

    THE COUNT ROSE AND THAT IS THE RULE WORKING, NOT FAILING. 2022 is untouched, the same 47 pairs as before — every boat of that
    fleet left Trindade to port as NOR C.1.3 requires, which puts her on the convex side of the corner, where the rule does not
    reach. Every one of the 142 new pairs belongs to Jean-Luc Van Den Heede (77), Are Wiig (64) and Mark Slats (1), and to nobody
    else: they are the sample's boats that sailed INSIDE this year's dog-leg, 865, 795 and 45 nm east of it. Across that corner
    they now make good about 200 nm a day against about 140 sailed, for a fortnight. The rule invents no miles — it REDISTRIBUTES
    the plain measure's own total across the sweep, because both edges of the wedge are pinned to the plain measure and every
    finisher still ends where she ended. It is what cutting a corner means: the 2018 route down the eastern Atlantic really was
    shorter than this year's, and straight_pct reads under 100 % for those boats over those days.

    WHAT IS LEFT, AND IS DELIBERATE. The largest fall over 100 nm is now Are Wiig's 168.5 nm across a 26.3-hour silence in which
    she sailed 118.8 — a long gap, not a step. The largest excess in the samples is Kirsten Neuschäfer's 80.1 nm at the Storm Bay
    gate, a 1-hour leg where the course doubles back on itself, identical under both measures. On the WHOLE 2018 fleet (which
    these samples do not carry) the largest remaining anomaly is 243.2 nm — Istvan Kopar, 18 Dec 2018, 52°15'S 111°42'W, the same
    disease at a different concave bend in the South Pacific. It is NOT fixed here and that is on purpose: node 343 needs a range
    bound, and every range bound measured introduced a worse discontinuity of its own. Pin the numbers, never soften them."""
    bad = []
    for race in ("ggr2018", "ggr2022"):
        for tid, b in projected(race).items():
            for p, q in zip(b["fixes"], b["fixes"][1:]):
                fell, ran = (p["dtf"] - q["dtf"]) / 1852.0, gc_nm(p["lat"], p["lon"], q["lat"], q["lon"])
                if fell > ran + 5.0:
                    bad.append((race, tid, hhmm(q["at"]), round(fell, 1), round(ran, 1)))
    assert [b[:3] for b in bad if b[3] > 100] == [("ggr2018", 7, "2018-08-13 22:17")], bad     # a 26.3-hour silence, not a jump
    assert len(bad) == 219, [b for b in bad if b[3] <= 100]
    assert [sum(1 for b in bad if b[0] == race) for race in ("ggr2018", "ggr2022")] == [172, 47]   # 2022 unchanged, to the pair
    assert sorted((tid, sum(1 for b in bad if b[:2] == ("ggr2018", tid))) for tid in (7, 8, 68, 94)) == [(7, 68), (8, 90), (68, 14), (94, 0)]
    assert round(max(b[3] - b[4] for b in bad), 1) == 80.1                                     # Storm Bay, and the same today

# ---------------------------------------------------------------- one boat's day

def test_boat_day_takes_the_fix_nearest_the_report_and_a_true_24_hour_run():
    b = P(straight(START, 20.0, 12))                                        # 12 legs of 20 nm: 240 nm in 48 h
    T = START + 12 * SLOT_S                                                 # the report two days after the gun
    r = editions.boat_day(b, START, T, COURSE_NM)
    assert r["fresh"] and r["racing"] and not r["finished"]
    assert r["fix_at"] == T + 7                                             # stamped 7 s after the hour: still the report's fix, never the one before
    assert round(r["run24_nm"]) == 120 and round(r["sailed_nm"]) == 240 and round(r["mg_nm"]) == 240

def test_a_silent_report_inside_the_window_means_no_run_and_a_missed_report_means_not_fresh():
    T = START + 12 * SLOT_S
    r = editions.boat_day(P(straight(START, 20.0, 12, gap_at=(9,))), START, T, COURSE_NM)
    assert r["fresh"] and r["run24_nm"] is None                             # six legs or nothing
    r2 = editions.boat_day(P(straight(START, 20.0, 12, gap_at=(12,))), START, T, COURSE_NM)
    assert not r2["fresh"] and r2["mg_nm"] is None and r2["lat"] is not None   # keeps her last position, nothing else

def test_miles_sailed_bridge_a_missing_slot_instead_of_skipping_it():
    """stats.compute_snapshot sums between consecutive PRESENT slots: the straight line across a missed report is a lower
    bound on what the boat sailed, and dropping the leg entirely would lose 40 miles here."""
    T = START + 12 * SLOT_S
    r = editions.boat_day(P(straight(START, 20.0, 12, gap_at=(9,))), START, T, COURSE_NM)
    assert round(r["sailed_nm"]) == 240

def test_an_impossible_leg_makes_no_run():
    fx = straight(START, 20.0, 12); fx[10]["lat"] -= 1.0                     # one leg of 80 nm in four hours: 20 kt, a tracker on a ship
    r = editions.boat_day(P(fx), START, START + 12 * SLOT_S, COURSE_NM)
    assert r["fresh"] and r["run24_nm"] is None

def test_a_fresh_row_carries_the_worker_s_own_formatted_position():
    """The site prints position_text as it stands, never reformatting a lat/lon itself (the handoff's rounding bug:
    a position printing as 29°60.0′N). The worker formats it once, with stats.position_text, on the fresh path. Pinned to a
    literal, not to stats.position_text(r['lat'], r['lon']): that calls the very function under test on the row's own numbers
    and would pass even if boat_day stopped calling it at all."""
    b = P(straight(START, 20.0, 12))                                       # 12 legs of 20 nm south from 46.5N: the fresh fix is 4.0 deg south
    r = editions.boat_day(b, START, START + 12 * SLOT_S, COURSE_NM)
    assert r["fresh"] and r["position_text"] == "42°30.0′N 001°47.4′W"
    import re
    assert re.fullmatch(r"\d{2}°\d{2}\.\d′[NS] \d{3}°\d{2}\.\d′[EW]", r["position_text"])

def test_a_pinned_position_from_a_real_2022_boat():
    """Simon Curwen (team 11), 2022, race day 5: pinned so a rounding regression shows up as a diff, not a shape check."""
    start = editions_data.EDITIONS["ggr2022"]["start"]
    row = next(r for r in editions_data.TEAMS["ggr2022"] if r["id"] == 11)
    b = editions.prepare(load_sample("ggr2022")[11], start, row["ended_at"], row["ended_how"], fill=True)
    T = editions.day_zero(start) + 5 * 86400
    r = editions.boat_day(b, start, T, COURSE_NM_OF["ggr2022"])
    assert r["fresh"] and (round(r["lat"], 5), round(r["lon"], 5)) == (43.56741, -8.36454)
    assert r["position_text"] == "43°34.0′N 008°21.9′W"

def test_a_not_fresh_row_still_carries_her_last_position_as_text():
    """Pinned to a literal, as above: calling stats.position_text on the row's own lat/lon proves only that the two numbers
    were forwarded, not that they were formatted at all."""
    r2 = editions.boat_day(P(straight(START, 20.0, 12, gap_at=(12,))), START, START + 12 * SLOT_S, COURSE_NM)
    assert not r2["fresh"] and r2["lat"] is not None
    assert r2["position_text"] == "42°50.0′N 001°47.4′W"                   # her last real fix, eleven legs south of the start

def test_a_boat_silent_since_before_the_gun_shows_no_position():
    """resample drops a fix before the start; the last-position lookup must too, or a boat whose tracker died on the quay would
    lie on the page at the spot she was moored."""
    fx = [{"at": START - (i + 1) * SLOT_S, "lat": 46.5, "lon": -1.79, "dtf": 1} for i in range(4)]
    r = editions.boat_day(P(fx), START, START + 3 * SLOT_S, COURSE_NM)
    assert r["racing"] and not r["fresh"] and r["lat"] is None and r["fix_at"] is None and r["position_text"] is None

def test_the_race_ends_at_the_documented_date_not_the_last_fix():
    ended = START + 12 * SLOT_S + 3600                                       # the race ended on day 2 (retired); the tracker goes on for five days
    r = editions.boat_day(P(straight(START, 20.0, 30), ended_at=ended, ended_how="retired"), START, START + 20 * SLOT_S, COURSE_NM)
    assert not r["racing"] and not r["fresh"] and not r["finished"]
    f = editions.boat_day(P(straight(START, 20.0, 30), ended_at=START + 12 * SLOT_S, ended_how="finished"), START, START + 20 * SLOT_S, COURSE_NM)
    assert f["finished"] and f["mg_nm"] == COURSE_NM and f["togo_nm"] == 0.0   # a finisher stays at the course's length

# ---------------------------------------------------------------- the run rule, used twice

def test_run_at_is_grid_window_with_the_worker_s_own_limits():
    b = P(straight(START, 20.0, 12))
    k = slot_of(START + 12 * SLOT_S)
    assert round(editions.run_at(b["slots"], k)) == 120
    assert editions.run_at(b["slots"], slot_of(START + 5 * SLOT_S)) is None   # five legs is not a day
    assert editions.run_at(P(straight(START, 45.0, 12))["slots"], k) is None  # 270 nm in 24 hours: above stats.RUN24_LIMIT_NM

def test_the_best_run_so_far_is_the_largest_run_of_any_day_and_keeps_its_own_time():
    """The best so far is the largest run over ANY 24 hours up to the report, as the Records page counts a best — never only the day's run."""
    fx = [{"at": START + i * SLOT_S + 7, "lat": 46.5 - (min(i, 6) * 20.0 + max(0, i - 6) * 30.0) / 60.0, "lon": -1.79, "dtf": 1} for i in range(19)]
    b = P(fx)                                                                # six legs of 20 nm, then twelve of 30
    k8, k18 = slot_of(START + 8 * SLOT_S), slot_of(START + 18 * SLOT_S)
    assert round(editions.best_so_far(b, k8)[0]) == 140 and editions.best_so_far(b, k8)[1] == START + 8 * SLOT_S + 7
    assert round(editions.run_at(b["slots"], k18)) == 180 and round(editions.best_so_far(b, k18)[0]) == 180

def test_the_best_run_so_far_is_the_workers_own_record_rule():
    """The standing cross-check: boat by boat on the 2026 fixture, the page's best run so far must be stats.personal_bests'
    best 24-hour run — same restart, same start, same report. A difference is a finding, never a tolerance."""
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz", "rt"))
    k, diffs = slot_of(T26), []
    for t in teams:
        if t["id"] in config.GHOSTS: continue
        b = editions.prepare(t["moments"], START_AT)
        mine = editions.best_so_far(b, k)
        theirs = stats.personal_bests(b["slots"], k, editions.t0_at(b, T26), START_AT)[1]
        mine = mine if mine[0] else (None, None)
        theirs = theirs if theirs[1] else (None, None)
        if mine[1] != theirs[1] or (mine[0] is None) != (theirs[0] is None) or (mine[0] is not None and abs(mine[0] - theirs[0]) > 0.01):
            diffs.append((t["id"], mine, theirs))
    assert not diffs, diffs

# ---------------------------------------------------------------- the three-hourly week

def test_the_three_hourly_week_has_no_run_until_the_slots_are_filled():
    fx, T = three_hourly(START, 5.0, 48), START + 12 * SLOT_S
    assert editions.run_at(resample(fx, START), slot_of(T)) is None                            # the grid meets a 3-hourly tracker twice a day
    r = editions.boat_day(P(fx), START, T, COURSE_NM)
    assert r["fresh"] and abs(r["run24_nm"] - 120.0) < 0.6                                    # 120 nm in 24 hours, within 0.5%

def test_a_five_hour_silence_gets_no_added_fix_and_no_run_across_it():
    hole = slot_time(slot_of(START + 8 * SLOT_S))                                             # 20:00 on the second day
    b = P([f for f in three_hourly(START, 5.0, 48) if f["at"] != hole + 3600])                 # the 21:00 report never came: six hours of silence
    assert slot_of(hole) not in b["slots"] and editions.run_at(b["slots"], slot_of(hole) + 1) is None

def test_an_added_fix_sits_on_the_line_between_its_neighbours_in_time():
    k = slot_of(START + 5 * SLOT_S)
    out = editions.fill_slots([{"at": slot_time(k) - 3600, "lat": 10.0, "lon": -20.0}, {"at": slot_time(k) + 2 * 3600, "lat": 13.0, "lon": -20.0}])
    add = [f for f in out if f.get("interp")]
    assert len(out) == 3 and len(add) == 1
    assert add[0]["at"] == slot_time(k) and abs(add[0]["lat"] - 11.0) < 1e-9 and add[0]["lon"] == -20.0

def test_an_added_fix_crosses_the_antimeridian_the_short_way():
    k = slot_of(START + 40 * SLOT_S)
    add = next(f for f in editions.fill_slots([{"at": slot_time(k) - 2 * 3600, "lat": -48.0, "lon": 179.0},
                                               {"at": slot_time(k) + 3600, "lat": -48.0, "lon": -179.0}]) if f.get("interp"))
    assert abs(add["lon"] + 179.66667) < 1e-4                                                 # two thirds across 180, never back through Greenwich

def three_hourly_off_the_slot(n):
    """A boat reporting every three hours from an hour past a slot: every third slot then holds a real fix and the two between
    it are filled — the shape that makes a report interpolated."""
    return [{"at": START + 3600 + i * 3 * 3600, "lat": 46.5 - 5.0 * (i * 3.0) / 60.0, "lon": -1.79, "dtf": 1} for i in range(n)]

def test_an_interpolated_report_is_never_a_fresh_one():
    """An added fix serves the run, the wind legs and the miles sailed; it is never a position. When the report's own slot was
    filled rather than reported, the row is the not-fresh row — her last REAL position and nothing else — exactly as for a boat
    that missed the report, so that 'fresh' means here what it means on the live site."""
    b, T = P(three_hourly_off_the_slot(25)), START + 12 * SLOT_S
    assert b["slots"][slot_of(T)]["interp"] and editions.run_at(b["slots"], slot_of(T)) is not None   # the fill still gives her a run
    r = editions.boat_day(b, START, T, COURSE_NM)
    assert r["racing"] and not r["fresh"] and r["mg_nm"] is None and r["run24_nm"] is None
    assert r["fix_at"] == START + 3600 + 15 * 3 * 3600 and abs(r["lat"] - 42.75) < 1e-9               # her last reported position, not a computed one

def test_van_den_heede_has_a_day_s_run_inside_the_three_hourly_week_of_2018():
    start = editions_data.EDITIONS["ggr2018"]["start"]
    b = prepared("ggr2018")[8]
    T = editions.day_zero(start) + 6 * 86400                                                  # 7 Jul 2018 00:00 UTC
    r = editions.boat_day(b, start, T, COURSE_NM_OF["ggr2018"])
    assert r["fresh"] and r["run24_nm"] is not None and 60 < r["run24_nm"] < 200, r["run24_nm"]
    raw = resample(load_sample("ggr2018")[8], start)
    assert editions.run_at(raw, slot_of(T)) is None                                           # unfilled, the 4-hour grid finds nothing

def test_an_added_fix_carries_a_distance_between_its_neighbours_and_none_when_a_neighbour_has_none():
    """grid.resample drops a fix without a distance to finish, so a filled slot carrying none would be thrown straight back out
    and the three-hourly week would have no run after all: the distance is interpolated exactly as the position is, and rounded
    to whole metres because fix.dtf_m is an integer column. Both neighbours must carry one — beside a neighbour that has none the
    added fix carries none and resample drops it again: blank, never guessed."""
    k = slot_time(slot_of(START + 5 * SLOT_S))
    pair = lambda q_dtf: [{"at": k - 3600, "lat": 10.0, "lon": -20.0, "dtf": 4_000_000},
                          dict({"at": k + 2 * 3600, "lat": 13.0, "lon": -20.0}, **({"dtf": q_dtf} if q_dtf else {}))]
    add = next(f for f in editions.fill_slots(pair(1_000_000)) if f.get("interp"))
    assert add["dtf"] == 3_000_000 and isinstance(add["dtf"], int)                            # a third of the way between 4,000 and 1,000 km
    blank = editions.fill_slots(pair(None))
    add2 = next(f for f in blank if f.get("interp"))
    assert "dtf" not in add2 and resample(blank, START) == {}                                 # no figure, and so no slot at all

# ---------------------------------------------------------------- the fixes YB gave no distance to finish

def test_a_past_boat_whose_tracker_stopped_giving_a_distance_is_measured_on_her_own_races_line():
    """YB's 2018 record gives Mark Slats a distance to finish of nought for every fix from 1 Jan 2019 04:10 UTC (race day 183.8,
    3°S 28°W, about 1,900 nm from home) to the finish on race day 214.6 — 589 reports of real mid-ocean sailing that
    grid.resample drops as in-port noise, because nought is how a tracker on a quay reads. A PAST fleet therefore measures those
    fixes, and only those, on THAT RACE'S OWN course line, never on another year's: the projection across years is what this page
    retired. Without this the second boat of the 2018 race is blank for the last month of it — the run-in to Les Sables beside
    Jean-Luc Van Den Heede, the most-watched boat-days of that race."""
    start = editions_data.EDITIONS["ggr2018"]["start"]
    row = next(r for r in editions_data.TEAMS["ggr2018"] if r["id"] == 68)
    raw = load_sample("ggr2018")[68]
    bare = editions.prepare(raw, start, row["ended_at"], row["ended_how"], fill=True)
    b = editions.prepare(raw, start, row["ended_at"], row["ended_how"], fill=True, line=LINES["ggr2018"])
    assert (bare["measured"], b["measured"]) == (0, 589)
    assert (len(bare["slots"]), len(b["slots"])) == (1097, 1276)                              # 179 slots of race days 184 to 214, back
    T = editions.day_zero(start) + 200 * 86400
    r = editions.boat_day(b, start, T, COURSE_NM_OF["ggr2018"])
    assert r["fresh"] and r["run24_nm"] is not None and r["mg_nm"] is not None and r["sailed_nm"] is not None
    assert not editions.boat_day(bare, start, T, COURSE_NM_OF["ggr2018"])["fresh"]            # and blank without the line
    yb_own = {f["at"]: f["dtf"] for f in raw if f.get("dtf")}
    assert all(f["dtf"] == yb_own[f["at"]] for f in b["fixes"] if f["at"] in yb_own)          # every figure YB did give is untouched
    assert sum(1 for f in b["fixes"] if f.get("measured")) == 589

def test_slats_is_in_the_2018_fleets_own_figures_for_the_month_yb_gave_no_distance():
    """Not the one row alone: the place, and the fleet's middle, over the days the dropped fixes would have emptied. On race day
    200 the 2018 sample is down to Mark Slats and Jean-Luc Van Den Heede, so a fleet row missing one of them has a median equal
    to the leader's and no second place at all. The order is the one the race had: Van Den Heede led the run-in and finished on
    29 January, Mark Slats on 31 January, and this is where a measure of ours is read beside YB's own for the same fleet on the
    same day — Van Den Heede 1,554.3 nm of YB's to go, Mark Slats 1,572.4 measured here, 18 nm apart. The plain nearest point of
    the polyline, with no floor, gave Mark Slats 1,514.3 and the lead of a race he never led."""
    start = editions_data.EDITIONS["ggr2018"]["start"]
    T = editions.day_zero(start) + 200 * 86400
    rows = {tid: editions.boat_day(b, start, T, COURSE_NM_OF["ggr2018"]) for tid, b in prepared("ggr2018").items()}
    editions.assign_places(rows)
    assert (rows[8]["place"], rows[68]["place"]) == (1, 2)
    assert (round(rows[8]["togo_nm"], 1), round(rows[68]["togo_nm"], 1)) == (1554.3, 1572.4)
    d = editions.fleet_day(rows, T, start, None)
    assert d["fresh"] == 2 and d["median_mg_nm"] is not None and d["median_mg_nm"] < d["leader_mg_nm"]

def test_the_measure_reproduces_ybs_own_figures_where_yb_gave_them():
    """The only check there can be on a figure YB never gave: run measure_missing's own rule over every fix of both samples that
    DOES carry YB's distance to finish, and read the error against YB. It says two things.

    First, the plain nearest point of the polyline is NOT good enough on the run home. Jean-Luc Van Den Heede came up the
    Atlantic about 900 nm west of the 2018 course line, and the foot of the perpendicular slides a boat that far off the line up
    the course without her having sailed there: the plain measure reads up to 319.2 nm LESS than YB for him, 682.9 for Simon
    Curwen and 326.0 for Kirsten Neuschäfer. Second, the great circle to the finish is a floor no route can be shorter than, and
    it costs nothing to apply: it cuts Van Den Heede's 95th percentile from 194.9 to 70.0 nm and moves no boat of either sample
    one metre further from YB.

    What is left is real and is the price of measuring a fix YB left blank: the worst residuals are at the corners of the course,
    where a polyline's nearest point is discontinuous (course.py). Mark Slats's own missing stretch is the Atlantic run home,
    where the floor is what answers and the floor agrees with YB to about 2 nm."""
    plain, floored = {}, {}
    for race in ("ggr2018", "ggr2022"):
        line, fin = LINES[race], LINES[race].nodes[-1]
        for r in editions_data.TEAMS[race]:
            if r["id"] not in load_sample(race):
                continue
            i0, prev, ep, ef = 0, None, [], []
            for f in editions.cut(sorted(load_sample(race)[r["id"]], key=lambda f: f["at"]), r["ended_at"]):
                togo, i0 = line.togo(f["lat"], f["lon"], i0, ahead=40 + (int((f["at"] - prev) // (4 * 3600)) if prev is not None else 0))
                prev = f["at"]
                if not f.get("dtf"):
                    continue
                yb, g = f["dtf"] / 1852.0, gc_nm(f["lat"], f["lon"], fin["lat"], fin["lon"])
                ep.append(abs(togo - yb)); ef.append(abs(max(togo, g) - yb))
            if ep:
                plain[(race, r["id"])], floored[(race, r["id"])] = ep, ef
    p95 = lambda e: round(sorted(e)[int(0.95 * len(e))], 1)
    assert all(round(max(floored[k]), 1) <= round(max(plain[k]), 1) for k in plain)             # the floor never moves a figure away from YB
    assert (p95(plain[("ggr2018", 8)]), round(max(plain[("ggr2018", 8)]), 1)) == (194.9, 319.2)
    assert (p95(floored[("ggr2018", 8)]), round(max(floored[("ggr2018", 8)]), 1)) == (70.0, 178.1)
    assert round(max(plain[("ggr2022", 11)]), 1) == 682.9 and round(max(plain[("ggr2022", 7)]), 1) == 326.0

def test_this_years_fleet_is_never_measured_on_a_line():
    """This year's figures must equal YB's own, as every other page of the site shows them, so prepare measures nothing for a
    fleet whose grid is the live site's (fill=False) even when a line is at hand: a 2026 fix with no distance to finish is
    in-port tracker noise, and it stays dropped."""
    fx = [{"at": START + i * SLOT_S + 7, "lat": 46.5 - i * 20.0 / 60.0, "lon": -1.79, "dtf": 1 if i < 6 else 0} for i in range(13)]
    b = editions.prepare(fx, START, fill=False, line=LINE)
    assert b["measured"] == 0 and max(b["slots"]) == slot_of(START + 5 * SLOT_S)
    assert editions.prepare(fx, START, fill=True, line=LINE)["measured"] == 7                 # a PAST fleet would measure those seven

# ---------------------------------------------------------------- the restart

def test_the_restart_is_read_off_what_the_tracker_sent_not_off_a_filled_slot():
    """Amendment 4: the restart is what the tracker reported. Fed the filled list instead, the boat leaves again at the slot time
    (a moment nothing was ever sent from), and every figure that counts from the restart moves with it."""
    k = slot_of(START + 4 * SLOT_S)                                                           # 2026-09-07 04:00 UTC, sixteen hours after the gun
    home = {"lat": config.LES_SABLES[0], "lon": config.LES_SABLES[1]}
    fx = ([{"at": START + i * SLOT_S + 7, "lat": 46.5 - i * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(3)]
          + [{"at": slot_time(k) - 5400, **home, "dtf": 1}, {"at": slot_time(k) - 1800, **home, "dtf": 1}]
          + [{"at": slot_time(k) + 1800 + i * SLOT_S, "lat": 46.6 + i * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(6)])
    b = P(fx)
    assert b["slots"][k]["interp"]                                                            # the hour itself was filled, not reported
    assert b["restart"]["first_out_at"] == slot_time(k) + 1800                                # 04:30, the fix she really sent

def test_a_restarted_boat_counts_from_the_restart():
    """NOR C.1.2: the boat may come back and go again, and her race time is not reset — but her miles sailed and her runs
    are counted from the restart, as the live site does (stats.detect_restart)."""
    home = {"lat": config.LES_SABLES[0], "lon": config.LES_SABLES[1]}
    fx = ([{"at": START + i * SLOT_S + 7, "lat": 46.5 - i * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(4)]
          + [{"at": START + (4 + i) * SLOT_S + 7, **home, "dtf": 1} for i in range(3)]
          + [{"at": START + (7 + i) * SLOT_S + 7, "lat": 46.5 - (i + 1) * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(18)])
    b, T = P(fx), START + 24 * SLOT_S
    assert b["restart"] and b["restart"]["first_out_at"] == START + 7 * SLOT_S + 7
    r = editions.boat_day(b, START, T, COURSE_NM)
    assert r["restarted"] and round(r["sailed_nm"]) == 340 and round(r["mg_nm"]) == 360        # seventeen legs since she left again, not twenty-four
    assert round(r["run24_nm"]) == 120
    assert editions.best_so_far(b, slot_of(T))[1] >= b["restart"]["first_out_at"]
    assert editions.fleet_day({1: r}, T, START, None)["straight_pct"] is None                  # miles since the restart over miles made good since the gun

# ---------------------------------------------------------------- the fleet's day

def test_the_record_resets_at_the_report_the_restart_counts_from():
    """t0_at keys on the report's own time, so the running best must key on the same. Keyed on the fix that carries the slot
    instead, a report in the twenty minutes before the restart would show figures counted from the gun beside a best run already
    wiped for a restart that had not happened yet."""
    home = {"lat": config.LES_SABLES[0], "lon": config.LES_SABLES[1]}
    fx = ([{"at": START + i * SLOT_S + 7, "lat": 46.5 - i * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(7)]
          + [{"at": START + (7 + i) * SLOT_S + 7, "lat": 44.5 + (i + 1) * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(5)]
          + [{"at": START + (12 + i) * SLOT_S + 7, **home, "dtf": 1} for i in range(3)]
          + [{"at": START + (15 + i) * SLOT_S + 300, "lat": 46.6 + i * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(6)])
    b = P(fx)
    assert b["restart"]["first_out_at"] == START + 15 * SLOT_S + 300                          # five minutes past the hour
    assert editions.t0_at(b, START + 15 * SLOT_S) == 0                                        # the report is before it: figures count from the gun
    assert round(editions.best_so_far(b, slot_of(START + 15 * SLOT_S))[0]) == 120             # ... and so does the record
    assert editions.best_so_far(b, slot_of(START + 16 * SLOT_S)) == (None, None)              # the next report is after it: the count starts again

def test_no_finisher_is_read_as_a_restart():
    """NOR C.1.2 gives a boat seven days from the gun to come back and start again; the worker's own detect_restart says so, and
    the 2022 race held Damien Guillou to it. Beyond that window a fix outside the marina after a fix inside it is an arrival, not
    a restart, and must not be read as one."""
    for race, ids in (("ggr2018", (8, 68)), ("ggr2022", (11, 7))):
        for tid in ids:
            assert prepared(race)[tid]["restart"] is None, (race, tid)

def test_a_finishers_arrival_does_not_take_away_the_record_she_set():
    """One fix 1.8 nm seaward two minutes before Kirsten Neuschäfer's finish makes the bare rule fire: the last fix inside the
    mile becomes a 'return' and the seaward one a 'restart'. Every row from that instant would then lose its best run, and the
    fleet row would hand the race's record to another boat on every later day. The seven-day window stops it."""
    start = editions_data.EDITIONS["ggr2022"]["start"]
    row = next(r for r in editions_data.TEAMS["ggr2022"] if r["id"] == 7)
    seaward = {"at": row["ended_at"] - 120, "lat": 46.4964, "lon": -1.8383, "dtf": 100}       # 1.8 nm west of the marina
    forced = editions.cut(load_sample("ggr2022")[7], row["ended_at"]) + [seaward]
    assert stats.detect_restart(sorted(forced, key=lambda f: f["at"]), start) is not None     # the bare rule does fire
    b = editions.prepare(forced, start, row["ended_at"], row["ended_how"], fill=True)
    assert b["restart"] is None                                                               # 236 days after the gun: an arrival
    assert editions.best_so_far(b, slot_of(row["ended_at"]))[0] is not None                   # her record stands

def test_damien_guillous_restart_is_inside_the_window_and_still_stands():
    b = prepared("ggr2022")[4]; start = editions_data.EDITIONS["ggr2022"]["start"]
    assert U("2022-09-10T16:00:00") <= b["restart"]["first_out_at"] < U("2022-09-10T16:05:00")   # six days after the gun, inside NOR C.1.2
    assert editions.boat_day(b, start, editions.day_zero(start) + 12 * 86400, COURSE_NM_OF["ggr2022"])["restarted"]

def test_places_and_the_fleet_row():
    T = START + 12 * SLOT_S
    boats = {1: P(straight(START, 25.0, 12)), 2: P(straight(START, 20.0, 12)), 3: P(straight(START, 15.0, 12, gap_at=(12,)))}
    rows = {tid: editions.boat_day(b, START, T, COURSE_NM) for tid, b in boats.items()}
    editions.assign_places(rows)
    assert rows[1]["place"] == 1 and rows[2]["place"] == 2 and rows[3]["place"] is None       # the stale boat has no place today
    d = editions.fleet_day(rows, T, START, wind=None)
    assert d["racing"] == 3 and d["fresh"] == 2 and d["leader_team_id"] == 1
    assert round(d["leader_mg_nm"]) == 300 and round(d["median_mg_nm"]) == 270 and d["best_run_team_id"] == 1
    assert round(d["mean_run_nm"]) == 135 and d["runs_n"] == 2
    assert round(d["best_sofar_nm"]) == 150 and d["best_sofar_team_id"] == 1

def test_a_finisher_leads_the_boats_still_at_sea_and_keeps_the_order_she_finished_in():
    """The fleet row puts a finisher at the course's length, ahead of everyone; her place must say the same, or the leader of
    the day would have no place 1 at all."""
    T = START + 20 * SLOT_S
    rows = {1: editions.boat_day(P(straight(START, 25.0, 30), ended_at=START + 12 * SLOT_S, ended_how="finished"), START, T, COURSE_NM),
            2: editions.boat_day(P(straight(START, 25.0, 30), ended_at=START + 14 * SLOT_S, ended_how="finished"), START, T, COURSE_NM),
            3: editions.boat_day(P(straight(START, 20.0, 30)), START, T, COURSE_NM)}
    editions.assign_places(rows)
    assert [rows[t]["place"] for t in (1, 2, 3)] == [1, 2, 3]
    d = editions.fleet_day(rows, T, START, None)
    assert d["finished"] == 2 and d["racing"] == 1 and d["leader_team_id"] == 1

def test_a_stopped_boat_is_not_in_the_mean_run():
    """A boat back in port is still racing by the record, but a leg she did not sail is not sailing: on the worker's own
    rule (perf.STOPPED_KN, perf.sailing — not a threshold of editions' own), she stays on her own row and out of the
    fleet's mean, best and count for the report where her last 4-hour leg reads under it."""
    T = START + 12 * SLOT_S
    moored = [{"at": START + i * SLOT_S + 7, "lat": 40.0, "lon": -1.79, "dtf": 1} for i in range(13)]
    rows = {1: editions.boat_day(P(straight(START, 25.0, 12)), START, T, COURSE_NM),
            2: editions.boat_day(P(straight(START, 20.0, 12)), START, T, COURSE_NM),
            3: editions.boat_day(P(moored), START, T, COURSE_NM)}
    assert rows[3]["racing"] and rows[3]["fresh"] and rows[3]["run24_nm"] == 0.0 and rows[3]["stopped"]
    d = editions.fleet_day(rows, T, START, None)
    assert d["racing"] == 3 and d["runs_n"] == 2 and round(d["mean_run_nm"]) == 135 and d["best_run_team_id"] == 1

def test_a_boat_just_above_the_threshold_is_not_stopped():
    """The line is perf.STOPPED_KN (0.2 kt), not a round number editions invents: 0.25 kt over a 4-hour leg (1.0 nm) is IN."""
    T = START + 12 * SLOT_S
    moving = [{"at": START + i * SLOT_S + 7, "lat": 40.0 - i * 1.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(13)]   # 0.25 kt = 1.0 nm per 4-hour leg
    rows = {1: editions.boat_day(P(straight(START, 25.0, 12)), START, T, COURSE_NM),
            2: editions.boat_day(P(moving), START, T, COURSE_NM)}
    assert not rows[2]["stopped"]
    d = editions.fleet_day(rows, T, START, None)
    assert d["runs_n"] == 2

def test_a_stopped_boat_counts_again_the_moment_she_sails_not_for_the_rest_of_the_race():
    """The owner's rule: left out for as long as she lies there, back in the moment she moves — never for the rest of
    the race. A boat moored for the first twelve legs, then sailing, is out on day 2 and back in on day 3."""
    stop_then_go = ([{"at": START + i * SLOT_S + 7, "lat": 40.0, "lon": -1.79, "dtf": 1} for i in range(13)]
                     + [{"at": START + (13 + i) * SLOT_S + 7, "lat": 40.0 - (i + 1) * 20.0 / 60.0, "lon": -1.79, "dtf": 1} for i in range(6)])
    b = P(stop_then_go)
    day2 = editions.boat_day(b, START, START + 12 * SLOT_S, COURSE_NM)
    day3 = editions.boat_day(b, START, START + 18 * SLOT_S, COURSE_NM)
    assert day2["stopped"] and not day3["stopped"]
    rows2 = {1: editions.boat_day(P(straight(START, 25.0, 12)), START, START + 12 * SLOT_S, COURSE_NM), 2: day2}
    rows3 = {1: editions.boat_day(P(straight(START, 25.0, 18)), START, START + 18 * SLOT_S, COURSE_NM), 2: day3}
    assert editions.fleet_day(rows2, START + 12 * SLOT_S, START, None)["runs_n"] == 1
    assert editions.fleet_day(rows3, START + 18 * SLOT_S, START, None)["runs_n"] == 2

def test_a_stopped_boat_is_not_the_fleet_s_best_run_so_far_while_she_lies_there():
    """best_sofar_* is the fleet's headline, not just a lookup of whoever's personal best is largest: a boat currently
    stopped is left out of it too, on the same report-by-report rule as mean_run_nm and best_run_nm."""
    T = START + 12 * SLOT_S
    moored = [{"at": START + i * SLOT_S + 7, "lat": 40.0, "lon": -1.79, "dtf": 1} for i in range(13)]
    holder = P(moored)
    other = P(straight(START, 20.0, 12))
    # Give the moored boat a real personal best set earlier, before she stopped, larger than the other boat's.
    holder["best"] = [(999.0, START + 7)] * len(holder["best"])
    rows = {1: editions.boat_day(other, START, T, COURSE_NM), 2: editions.boat_day(holder, START, T, COURSE_NM)}
    assert rows[2]["best24_nm"] == 999.0 and rows[2]["stopped"]                    # her own record is untouched
    d = editions.fleet_day(rows, T, START, None)
    assert d["best_sofar_team_id"] == 1                                           # but she does not hold the fleet's headline while stopped

def test_a_not_fresh_boat_can_hold_the_fleet_s_best_run_so_far():
    """Finding 4: boat_day's default row (no leg to test — here, a report she missed entirely) reads stopped=False, a documented
    choice, not an oversight. fleet_day's best_sofar_* iterates every row, not only the fresh ones, so a boat gone silent keeps
    holding the fleet's headline on her last confirmed record until she reports again — never hidden, only unconfirmed."""
    T = START + 12 * SLOT_S
    other = P(straight(START, 20.0, 12))
    silent = P(straight(START, 20.0, 12, gap_at=(12,)))                    # missed the report at T: the default, not-fresh row
    silent["best"] = [(999.0, START + 7)] * len(silent["best"])            # a real record she set earlier, before falling silent
    rows = {1: editions.boat_day(other, START, T, COURSE_NM), 2: editions.boat_day(silent, START, T, COURSE_NM)}
    assert not rows[2]["fresh"] and rows[2]["best24_nm"] == 999.0 and rows[2]["stopped"] is False
    d = editions.fleet_day(rows, T, START, None)
    assert d["best_sofar_team_id"] == 2 and d["best_sofar_nm"] == 999.0

def test_a_stopped_leg_is_not_classed_in_the_wind_bands_while_the_fleets_moving_legs_still_are():
    """The one the plain 24-hour-run rule got wrong: a leg the boat spent not moving is a course made good between two
    pieces of tracker noise, and must not be classed upwind/reaching/running (perf.sailing, as perf.wind_stats applies it)."""
    T = START + 12 * SLOT_S
    moored = [{"at": START + i * SLOT_S + 7, "lat": 40.0, "lon": -1.79, "dtf": 1} for i in range(13)]
    legs_by_team = {1: editions.day_legs(P(straight(START, 20.0, 12))["slots"], T), 2: editions.day_legs(P(moored)["slots"], T)}
    assert len(legs_by_team[1]) == 6 and len(legs_by_team[2]) == 6                 # both boats have six legs to class
    winds = {tid: {l["end_at"]: (12.0, 90.0) for l in legs} for tid, legs in legs_by_team.items()}
    w = editions.wind_day(legs_by_team, winds)
    assert w["wind_legs"] == 6 and w["legs_upwind"] + w["legs_reaching"] + w["legs_running"] == 6   # only boat 1's legs counted

def test_a_leg_the_performance_page_would_drop_is_not_classed_for_the_wind():
    """Two consecutive slots can stand 3 h 20 min to 4 h 40 min apart, since each fix may be 20 minutes either side of its hour.
    perf.all_legs calls a leg a leg only between 3.5 and 4.5 hours, and the wind bands must use the same gate, or a leg would
    count on this page and not on the Performance page."""
    fx = straight(START, 20.0, 12)
    for i, off in ((8, 1200), (9, -1200), (10, 1200)):                                        # each fix still inside its own slot's 20 minutes
        fx[i]["at"] = slot_time(slot_of(fx[i]["at"])) + off
    legs = editions.day_legs(P(fx)["slots"], START + 12 * SLOT_S)
    assert [l["end_at"] for l in legs] == [START + j * SLOT_S for j in (7, 8, 11, 12)]         # the 3 h 20 leg and the 4 h 40 leg are both gone

def test_wind_is_classed_with_the_sites_own_bands():
    b = P(straight(START, 20.0, 12))                                                          # course made good 180 (south)
    T = START + 12 * SLOT_S
    legs = editions.day_legs(b["slots"], T)
    assert len(legs) == 6 and all(abs(l["cmg_deg"] - 180) < 0.5 for l in legs)
    winds = {1: {l["end_at"]: (12.0, 180.0 if i < 2 else 90.0 if i < 5 else 0.0) for i, l in enumerate(legs)}}
    w = editions.wind_day({1: legs}, winds)
    assert (w["legs_upwind"], w["legs_reaching"], w["legs_running"], w["wind_legs"]) == (2, 3, 1, 6) and w["wind_kt"] == 12.0

# ---------------------------------------------------------------- the crossings

def test_a_crossing_is_interpolated_between_the_two_fixes():
    fx = on_a_line(straight(START, 60.0, 4), LINE)                                            # one degree of latitude a leg
    x = editions.crossings(fx, START, None, None, {}, [("Forty-five", "lat", 45.0, lambda la, lo: True)])
    assert abs(x["Forty-five"] - (START + 1.5 * SLOT_S + 7)) < 60                             # half way through the second leg

def test_a_latitude_is_crossed_southbound_and_the_return_months_later_does_not_count():
    fx = ([{"at": START + i * SLOT_S, "lat": 1.0 - i, "lon": -20.0, "dtf": 1} for i in range(3)]
          + [{"at": START + (100 + i) * SLOT_S, "lat": -1.0 + i, "lon": -20.0, "dtf": 1} for i in range(3)])
    x = editions.crossings(fx, START, None, None, {}, editions_data.MILESTONES)
    assert x["Equator"] == START + SLOT_S                                                     # the southbound one, on the way out

def test_the_first_eastbound_crossing_stands_even_when_the_boat_turns_back():
    lons = [16.0, 20.0, 16.0, 20.0]                                                           # east past the cape, back to Cape Town, east again
    fx = [{"at": START + i * SLOT_S, "lat": -35.0, "lon": lon, "dtf": 1} for i, lon in enumerate(lons)]
    x = editions.crossings(fx, START, None, None, {}, editions_data.MILESTONES)
    assert abs(x["Cape of Good Hope"] - (START + (18.4731 - 16.0) / 4.0 * SLOT_S)) < 1

def test_crossing_the_antimeridian_westbound_is_not_an_eastbound_crossing_of_anything():
    """Read without care, a pair from 179°W to 179°E reads as a boat going east past every meridian between them, the Cape of Good
    Hope's among them. It is two degrees WEST. The rule must measure the short way round, so that it does not depend on the true
    crossing happening to come first and end the search."""
    lons = [-179.0, 179.0, 16.0, 20.0]                                                        # west across 180, then east past the cape
    fx = [{"at": START + i * SLOT_S, "lat": -35.0, "lon": lon, "dtf": 1} for i, lon in enumerate(lons)]
    x = editions.crossings(fx, START, None, None, {}, editions_data.MILESTONES)
    assert abs(x["Cape of Good Hope"] - (START + 2 * SLOT_S + (18.4731 - 16.0) / 4.0 * SLOT_S)) < 1

def test_nothing_after_the_pages_own_clock():
    fx = [{"at": START + i * 1200, "lat": 46.0 - i * 0.5, "lon": -1.79, "dtf": 1} for i in range(6)]   # 45.0 crossed at START + 2400
    ms = [("Forty-five", "lat", 45.0, lambda la, lo: True)]
    assert editions.crossings(fx, START, None, None, {}, ms, until=START + 2399) == {}
    assert editions.crossings(fx, START, None, None, {}, ms, until=START + 2400)["Forty-five"] == START + 2400
    assert editions.crossings(fx, START, None, None, {}, ms)["Forty-five"] == START + 2400
    gate = [("Gate", "split", 620, None)]                                                     # the page's own clock holds a gate back too
    assert editions.crossings(fx, START, None, None, {620: START + 2400}, gate, until=START + 2399) == {}
    assert editions.crossings(fx, START, None, None, {620: START + 2400}, gate, until=START + 2400) == {"Gate": START + 2400}

# ---------------------------------------------------------------- the gates: each race's own YB split

# YB's own checkpoints, by YB's checkpoint index in its zegments file — the same number for the same gate in all three races (620
# the Canary gate off Lanzarote, 2411 the Hobart gate), while the checkpoint IDS are numbered per race and neither is an offset
# into a course's nodes. Which race holds which is a fact about YB's own files, read from the tracked fixtures and pinned by
# test_which_split_indices_each_race_holds_and_that_900_is_never_read.
SPLITS = (("ggr2022", 11, "Simon Curwen", 2411, "Hobart"), ("ggr2018", 8, "Jean-Luc Van Den Heede", 2411, "Hobart"),
          ("ggr2022", 11, "Simon Curwen", 620, "Lanzarote"), ("ggr2022", 14, "Guy deBoer", 620, "Lanzarote"))

def race_splits(race):
    """{team_id: {YB's checkpoint index: stop time}} out of the fixture, the shape db.load_splits builds from the `split` table."""
    z = json.load(open(FIX / f"zegments.{race}.json"))
    idx = {c["id"]: c.get("index") for c in z["course"]}
    out = {}
    for tag in z["tags"]:
        for t in tag.get("teams", []):
            for seg in t.get("segments", {}).values():
                out.setdefault(t["markerNo"], {})[idx[seg["courseNodeId"]]] = seg["stop"] // 1000
    return out

def past_crossings(race, tid):
    row = next(r for r in editions_data.TEAMS[race] if r["id"] == tid)
    return editions.crossings(prepared(race)[tid]["fixes"], editions_data.EDITIONS[race]["start"], row["ended_how"], row["ended_at"],
                              race_splits(race).get(tid, {}), editions_data.MILESTONES)

# Every crossing of every sampled boat of both past fleets, pinned to the second. The three geographic ones and the finish are the
# SAME SECONDS as under the retired common yardstick — they never depended on a course at all — and only the two gates moved, from
# a threshold on a projected distance to YB's own split for that race. 2018 has no Lanzarote row anywhere in YB's record although
# the race had the gate, so the 2018 fleet is blank there: a missing report gives no figure, never a guessed one.
THE_FULL_TABLE = {
    ("ggr2018", 8): {"Equator": 1532822787, "Cape of Good Hope": 1535058794, "Hobart": 1538765956,
                      "Cape Horn": 1543000027, "Finish": 1548753120},
    ("ggr2018", 68): {"Equator": 1532731716, "Cape of Good Hope": 1535361896, "Hobart": 1540075474,
                       "Cape Horn": 1543730183, "Finish": 1548973080},
    ("ggr2018", 94): {},
    ("ggr2018", 7): {"Equator": 1533097834},
    ("ggr2022", 11): {"Lanzarote": 1663350825, "Equator": 1664998685, "Cape of Good Hope": 1667791944, "Hobart": 1671835492,
                       "Cape Horn": 1677362858, "Finish": 1682589600},
    ("ggr2022", 7): {"Lanzarote": 1663446908, "Equator": 1665159139, "Cape of Good Hope": 1668287514, "Hobart": 1671943905,
                      "Cape Horn": 1676492014, "Finish": 1682624627},
    ("ggr2022", 14): {"Lanzarote": 1663446284},
    ("ggr2022", 4): {"Lanzarote": 1663817428, "Equator": 1665368642, "Cape of Good Hope": 1668162934},
    ("ggr2022", 1): {"Lanzarote": 1663364209, "Equator": 1665168548, "Cape of Good Hope": 1668254623},
}

def test_the_full_past_fleet_milestone_table():
    """Every milestone of every sampled boat of both past fleets, pinned to the second against THE_FULL_TABLE: a table, not a
    shape check, so that a change anywhere in the cut, the fill, the gates or the curated ends shows up as a diff and never as a
    plausible new number."""
    seen = {(race, tid): {k: round(v) for k, v in past_crossings(race, tid).items()}
            for race in ("ggr2018", "ggr2022") for tid in prepared(race)}
    assert seen == THE_FULL_TABLE
    assert sum(len(v) for v in seen.values()) == 30

def test_the_geographic_crossings_did_not_move_when_the_measure_changed():
    """The equator, the Cape of Good Hope and Cape Horn are latitudes and longitudes: they never touched a course line, so
    retiring the projection must leave every one of them at the identical second. Pinned against the table captured under the old
    measure, so that a change to the fill or the cut shows up here as a diff and not as a plausible new number."""
    was = {("ggr2018", 8): {"Equator": 1532822787, "Cape of Good Hope": 1535058794, "Cape Horn": 1543000027},
           ("ggr2018", 68): {"Equator": 1532731716, "Cape of Good Hope": 1535361896, "Cape Horn": 1543730183},
           ("ggr2018", 7): {"Equator": 1533097834},
           ("ggr2022", 11): {"Equator": 1664998685, "Cape of Good Hope": 1667791944, "Cape Horn": 1677362858},
           ("ggr2022", 7): {"Equator": 1665159139, "Cape of Good Hope": 1668287514, "Cape Horn": 1676492014},
           ("ggr2022", 4): {"Equator": 1665368642, "Cape of Good Hope": 1668162934},
           ("ggr2022", 1): {"Equator": 1665168548, "Cape of Good Hope": 1668254623}}
    for (race, tid), want in was.items():
        x = past_crossings(race, tid)
        assert {k: round(v) for k, v in x.items() if k in want} == want, (race, tid)

def test_which_split_indices_each_race_holds_and_that_900_is_never_read():
    """The fact the gates rest on, in YB's own files: 620 (Lanzarote) exists for 2022 and NOT for 2018; 2411 (Hobart) for both.
    Index 900 is DIFFERENT WATER in different years — 15°S in 2018, Trindade in 2022 — and must never be compared across races,
    so no milestone may name it."""
    have = {race: {i for t in race_splits(race).values() for i in t} for race in ("ggr2018", "ggr2022")}
    assert 620 not in have["ggr2018"] and 620 in have["ggr2022"]
    assert 2411 in have["ggr2018"] and 2411 in have["ggr2022"]
    assert 900 in have["ggr2018"] and 900 in have["ggr2022"]                                  # present in both, and still unusable
    gates = {name: value for name, kind, value, _ in editions_data.MILESTONES if kind == "split"}
    assert gates == {"Lanzarote": 620, "Hobart": 2411}                                        # these two are gates, and 900 is not one

def test_a_gate_is_ybs_own_split_to_the_second():
    """Not "within six hours of" YB any more: the gate IS YB's own split time for that boat in that race, so the page and YB's own
    record cannot drift apart. Before this rule Hobart was read from a distance measured on another year's course and landed 9 to
    10 hours late for both finishers."""
    for race, tid, name, index, ms in SPLITS:
        row = next(r for r in editions_data.TEAMS[race] if r["id"] == tid)
        assert past_crossings(race, tid)[ms] == zeg_stop(race, name, index), (race, tid, ms)
        if row["ended_how"] == "finished":
            assert past_crossings(race, tid)["Finish"] == row["ended_at"]                     # the finish stays the curated date

def test_the_2018_fleet_has_no_lanzarote_although_the_race_had_the_gate():
    """YB's 2018 record holds no 620 row for anybody, so every boat of 2018 is blank at Lanzarote. That absence belongs in the
    page's words; it must never be filled in from a distance measured on another year's course."""
    for tid in prepared("ggr2018"):
        assert "Lanzarote" not in past_crossings("ggr2018", tid), tid
    assert any("Lanzarote" in past_crossings("ggr2022", tid) for tid in prepared("ggr2022"))

def test_guy_deboer_2022_rounded_lanzarote_the_evening_before_he_went_aground():
    """Guy deBoer did the film drop at Marina Rubicón on the evening of 17 September and was on the rocks of Fuerteventura at
    04:45 the next morning. YB timed the boat through the Canary gate at 17 Sep 19:04 UTC, and that is the page's figure."""
    row = next(r for r in editions_data.TEAMS["ggr2022"] if r["id"] == 14)
    x = past_crossings("ggr2022", 14)
    assert x["Lanzarote"] == zeg_stop("ggr2022", "Guy deBoer", 620)
    assert U("2022-09-17T12:00:00") < x["Lanzarote"] < U("2022-09-18T04:45:00"), hhmm(x["Lanzarote"])
    assert x["Lanzarote"] <= row["ended_at"] and "Equator" not in x

def test_a_gate_the_tracker_passed_after_the_boats_race_ended_is_not_hers():
    """A boat's race ends at the documented date, and her tracker does not: Gregor McGuckin was dismasted on 21 Sep 2018 and that
    boat's tracker went through YB's 1903 gate three weeks later, under tow. A split after the end is not a crossing she made."""
    ended = START + 12 * 86400
    assert editions.crossings([], START, "retired", ended, {620: ended - 3600}, editions_data.MILESTONES) == {"Lanzarote": ended - 3600}
    assert editions.crossings([], START, "retired", ended, {620: ended + 3600}, editions_data.MILESTONES) == {}
    assert editions.crossings([], START, "retired", ended, {620: START - 3600}, editions_data.MILESTONES) == {}   # nor one before the gun

def test_curwen_2022_lying_at_puerto_montt_leaves_the_fleet_s_figures_only_for_the_days_she_lies_there():
    """Real data, not a synthetic fleet: Simon Curwen (team 11) lay in the channel by Puerto Montt from race day 164 to
    166 — measured, her reports' own 4-hour legs read 0.004, 0.002 and 0.001 kt, all under perf.STOPPED_KN — moving again
    by day 167 (5.1 kt). Combined with a steadily sailing boat (a different course scale: fleet_day aggregates already-
    computed nm figures, so mixing scales is fine), she is out of the count on the three still days and in on the days
    either side; her own run is never zeroed."""
    start = editions_data.EDITIONS["ggr2022"]["start"]
    row = next(r for r in editions_data.TEAMS["ggr2022"] if r["id"] == 11)
    curwen = editions.prepare(load_sample("ggr2022")[11], start, row["ended_at"], row["ended_how"], fill=True)
    sailor = P(straight(START, 25.0, 60))
    stopped_days = {163: False, 164: True, 165: True, 166: True, 167: False}
    for d, expect_stopped in stopped_days.items():
        T = editions.day_zero(start) + d * 86400
        curwen_row = editions.boat_day(curwen, start, T, COURSE_NM_OF["ggr2022"])
        assert curwen_row["stopped"] == expect_stopped, (d, curwen_row["run24_nm"])
        assert curwen_row["run24_nm"] is not None                                  # her own row keeps her run regardless
        rows = {11: curwen_row, 2: editions.boat_day(sailor, START, START + 12 * SLOT_S, COURSE_NM)}
        d_row = editions.fleet_day(rows, T, start, None)
        assert d_row["runs_n"] == (1 if expect_stopped else 2), (d, d_row["runs_n"])
    # The wind bands the same way: all six legs of day 163 sail, none of day 165's do.
    legs163 = editions.day_legs(curwen["slots"], editions.day_zero(start) + 163 * 86400)
    legs165 = editions.day_legs(curwen["slots"], editions.day_zero(start) + 165 * 86400)
    assert len(perf.sailing(legs163)) == 6 and len(perf.sailing(legs165)) == 0

def test_deboer_2022_is_racing_at_the_report_before_the_grounding_and_gone_after_it():
    """Amendment 9: the boat went aground at 04:45 UTC on race day 14, so the 00:00 report of day 14 still counts her racing."""
    start = editions_data.EDITIONS["ggr2022"]["start"]
    b = prepared("ggr2022")[14]
    day14 = editions.boat_day(b, start, editions.day_zero(start) + 14 * 86400, COURSE_NM_OF["ggr2022"])
    day20 = editions.boat_day(b, start, editions.day_zero(start) + 20 * 86400, COURSE_NM_OF["ggr2022"])
    assert day14["racing"] and day14["fresh"]
    assert not day20["racing"] and not day20["fresh"]

# ---------------------------------------------------------------- the whole race

def test_compute_returns_the_three_tables_for_a_small_fleet():
    boats = {1: straight(START, 25.0, 30), 2: straight(START, 20.0, 30)}
    ends = {1: {"ended_at": None, "ended_how": None}, 2: {"ended_at": START + 20 * SLOT_S, "ended_how": "retired"}}
    out = editions.compute(boats, ends, START, COURSE_NM, days=[1, 2, 3, 4, 5], winds={}, fill=True,
                           splits={}, milestones=[("Forty-five", "lat", 45.0, lambda la, lo: True)])
    assert [d["race_day"] for d in out["days"]] == [1, 2, 3, 4, 5]
    assert out["days"][4]["racing"] == 1 and out["days"][1]["racing"] == 2
    assert len(out["boat_days"]) == 10 and all(set(db.BOAT_DAY_COLS) <= set(r) for r in out["boat_days"])
    assert all(set(db.DAY_COLS) <= set(d) for d in out["days"])
    assert all(set(db.MILESTONE_COLS) <= set(m) for m in out["milestones"]) and len(out["milestones"]) == 2
    assert out["notes"] == {"filled_slots": 0, "stopped_legs": 0, "interp_reports": 0, "measured_fixes": {}}
    assert {r["team_id"] for r in out["boat_days"]} == {1, 2}

def test_compute_counts_what_it_added_and_what_it_left_out():
    boats = {1: three_hourly(START, 5.0, 96), 2: [{"at": START + i * SLOT_S + 7, "lat": 40.0, "lon": -1.79, "dtf": 1} for i in range(25)]}
    out = editions.compute(boats, {}, START, COURSE_NM, days=[1, 2, 3], winds={}, fill=True)
    assert out["notes"]["filled_slots"] > 0 and out["notes"]["stopped_legs"] > 0
    assert out["notes"]["interp_reports"] == 0                                                # 00:00 lies on the 3-hour rhythm and on the grid alike
    assert editions.compute(boats, {}, START, COURSE_NM, days=[1], winds={}, fill=False)["notes"]["filled_slots"] == 0

def test_compute_counts_the_fixes_it_measured_itself_boat_by_boat():
    """The run's log must name which boats carry a figure of OURS rather than YB's, and how many, so that the page's "Read with
    care" can say it. A boat YB gave a distance for on every fix is not in the count at all."""
    fx = straight(START, 20.0, 12)
    for f in fx[7:]:
        f["dtf"] = 0                                                                          # six reports YB gave no distance to finish
    out = editions.compute({1: fx, 2: straight(START, 25.0, 12)}, {}, START, COURSE_NM, days=[1, 2], winds={}, fill=True, line=LINE)
    assert out["notes"]["measured_fixes"] == {1: 6}
    assert editions.compute({1: fx}, {}, START, COURSE_NM, days=[1], winds={}, fill=False, line=LINE)["notes"]["measured_fixes"] == {}

def test_compute_stands_up_to_an_empty_fleet_an_empty_day_list_and_a_boat_with_no_fix():
    empty = editions.compute({}, {}, START, COURSE_NM, days=[1], winds={}, fill=True)
    assert len(empty["days"]) == 1 and empty["days"][0]["racing"] == 0 and empty["days"][0]["leader_team_id"] is None
    assert empty["boat_days"] == [] and empty["notes"] == {"filled_slots": 0, "stopped_legs": 0, "interp_reports": 0, "measured_fixes": {}}
    assert set(db.DAY_COLS) <= set(empty["days"][0])
    none = editions.compute({1: straight(START, 20.0, 12)}, {}, START, COURSE_NM, days=[], winds={}, fill=True)
    assert none["days"] == [] and none["boat_days"] == []
    silent = editions.compute({1: []}, {}, START, COURSE_NM, days=[1, 2], winds={}, fill=True, splits={})
    assert len(silent["boat_days"]) == 2 and all(r["racing"] and not r["fresh"] and r["lat"] is None for r in silent["boat_days"])
    assert silent["milestones"] == [] and silent["days"][0]["median_mg_nm"] is None

def test_a_retired_boat_has_no_finish_milestone():
    fx = P(straight(START, 60.0, 4))["fixes"]
    assert "Finish" not in editions.crossings(fx, START, "retired", START + 2 * SLOT_S, {}, editions_data.MILESTONES)
    assert editions.crossings(fx, START, "finished", START + 2 * SLOT_S, {}, editions_data.MILESTONES)["Finish"] == START + 2 * SLOT_S

def test_the_fill_boundary_is_grids_own_twenty_minutes():
    t = slot_time(slot_of(START + 6 * SLOT_S))
    at = lambda a, b: [{"at": t + a, "lat": 10.0, "lon": -20.0}, {"at": t + b, "lat": 11.0, "lon": -20.0}]
    assert not any(f.get("interp") for f in editions.fill_slots(at(-1200, 2400)))             # 20 minutes out, so the fix still holds the slot
    assert sum(1 for f in editions.fill_slots(at(-1201, 2399)) if f.get("interp")) == 1       # one second further and the slot is empty: fill it

def test_compute_counts_the_reports_that_were_filled_rather_than_reported():
    out = editions.compute({1: three_hourly_off_the_slot(25)}, {}, START, COURSE_NM, days=[1, 2], winds={}, fill=True)
    assert out["notes"]["interp_reports"] == 2 and not any(r["fresh"] for r in out["boat_days"])
    assert all(r["racing"] and r["lat"] is not None and r["mg_nm"] is None for r in out["boat_days"])
