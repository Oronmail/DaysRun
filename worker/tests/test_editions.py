# worker/tests/test_editions.py — the fleets of past races. Every figure the page shows is checked twice: against the
# worker's own rules (grid.window, stats.personal_bests, perf.point_of_sail) and against YB's real 2018 and 2022 files.
import gzip, json, pathlib
from datetime import datetime, timezone
from ggrstats import config, course, db, editions, editions_data, stats
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
SETUP26 = json.load(open(FIX / "RaceSetup.20260916.json"))                  # the course every fleet is measured on
LINE26 = course.Line(SETUP26["course"]["nodes"]); COURSE26_NM = LINE26.total_nm
TOGO26 = course.mark_togo(SETUP26["course"]["nodes"], config.MARKS)
T26 = 1789516800                                                            # 2026-09-16 00:00 UTC, the golden report

P = lambda fx, **kw: editions.prepare(fx, START, line=LINE, **kw)

def load_sample(race):
    teams = json.load(gzip.open(FIX / f"{race}.sample.json.gz", "rt"))
    return {t["id"]: sorted(t["moments"], key=lambda m: m["at"]) for t in teams}

_PREPARED = {}
def prepared(race):
    """Every sampled boat of a past race, cut at its documented end and measured on the 2026 line — computed once for the whole file."""
    if race not in _PREPARED:
        start, sample = editions_data.EDITIONS[race]["start"], load_sample(race)
        _PREPARED[race] = {r["id"]: editions.prepare(sample[r["id"]], start, r["ended_at"], r["ended_how"], LINE26)
                           for r in editions_data.TEAMS[race] if r["id"] in sample}
    return _PREPARED[race]

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

def test_distance_to_finish_falls_no_faster_than_the_boat_sails_except_where_the_course_turns():
    """Amendment 7's invariant, on every fix of both real samples: the distance to finish must not fall by more than the boat
    sailed between the two fixes, plus 5 nm. Measured, 77 of 11,252 pairs break it, and every one sits where the 2026 course line
    turns and the boat cuts the bend — the hairpin round Lanzarote, the way into and out of Storm Bay, the corner waypoints of the
    Southern Ocean, Cape Horn — where advancing along the line honestly outruns the great circle (the effect
    course.MARGIN_COMPUTED_NM exists for); the median excess is 16 nm. Two are of another kind: Jean-Luc Van Den Heede and Are
    Wiig sailed down the African side in 2018 and went nowhere near the 2026 course's dog-leg out to Trindade, so each rejoins the
    line a thousand miles further on in one step (their miles made good jump that day and are right again afterwards). A narrower
    search window does not mend that: measured with 4 legs ahead instead of 40, the same jump arrives in twelve smaller ones. The
    counts are pinned so that any change in the measurement is seen."""
    bad = []
    for race in ("ggr2018", "ggr2022"):
        for tid, b in prepared(race).items():
            for p, q in zip(b["fixes"], b["fixes"][1:]):
                fell, ran = (p["dtf"] - q["dtf"]) / 1852.0, gc_nm(p["lat"], p["lon"], q["lat"], q["lon"])
                if fell > ran + 5.0:
                    bad.append((race, tid, hhmm(q["at"]), round(fell, 1), round(ran, 1)))
    assert [b[:3] for b in bad if b[3] > 100] == [("ggr2018", 8, "2018-08-04 04:00"), ("ggr2018", 7, "2018-08-07 20:00")], bad
    assert len(bad) == 77, [b for b in bad if b[3] <= 100]

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
    assert editions.run_at(resample(editions.on_line(fx, LINE), START), slot_of(T)) is None   # the grid meets a 3-hourly tracker twice a day
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

def test_van_den_heede_has_a_day_s_run_inside_the_three_hourly_week_of_2018():
    start = editions_data.EDITIONS["ggr2018"]["start"]
    b = prepared("ggr2018")[8]
    T = editions.day_zero(start) + 6 * 86400                                                  # 7 Jul 2018 00:00 UTC
    r = editions.boat_day(b, start, T, COURSE26_NM)
    assert r["fresh"] and r["run24_nm"] is not None and 60 < r["run24_nm"] < 200, r["run24_nm"]
    raw = resample(editions.on_line(load_sample("ggr2018")[8], LINE26), start)
    assert editions.run_at(raw, slot_of(T)) is None                                           # unfilled, the 4-hour grid finds nothing

# ---------------------------------------------------------------- the restart

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

def test_a_moored_boat_is_not_in_the_mean_run():
    """A boat back in port is still racing by the record, but a run of nought is not sailing: it stays on her own row and
    out of the fleet's mean, best and count (amendment 3)."""
    T = START + 12 * SLOT_S
    moored = [{"at": START + i * SLOT_S + 7, "lat": 40.0, "lon": -1.79, "dtf": 1} for i in range(13)]
    rows = {1: editions.boat_day(P(straight(START, 25.0, 12)), START, T, COURSE_NM),
            2: editions.boat_day(P(straight(START, 20.0, 12)), START, T, COURSE_NM),
            3: editions.boat_day(P(moored), START, T, COURSE_NM)}
    assert rows[3]["racing"] and rows[3]["fresh"] and rows[3]["run24_nm"] == 0.0 and rows[3]["best24_nm"] is None
    d = editions.fleet_day(rows, T, START, None)
    assert d["racing"] == 3 and d["runs_n"] == 2 and round(d["mean_run_nm"]) == 135 and d["best_run_team_id"] == 1

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
    fx = editions.on_line(straight(START, 60.0, 4), LINE)                                     # one degree of latitude a leg
    x = editions.crossings(fx, START, None, None, {}, [("Forty-five", "lat", 45.0, lambda la, lo: True)])
    assert abs(x["Forty-five"] - (START + 1.5 * SLOT_S + 7)) < 60                             # half way through the second leg

def test_a_latitude_is_crossed_southbound_and_the_return_months_later_does_not_count():
    fx = ([{"at": START + i * SLOT_S, "lat": 1.0 - i, "lon": -20.0, "dtf": 1} for i in range(3)]
          + [{"at": START + (100 + i) * SLOT_S, "lat": -1.0 + i, "lon": -20.0, "dtf": 1} for i in range(3)])
    x = editions.crossings(fx, START, None, None, TOGO26, editions_data.MILESTONES)
    assert x["Equator"] == START + SLOT_S                                                     # the southbound one, on the way out

def test_the_first_eastbound_crossing_stands_even_when_the_boat_turns_back():
    lons = [16.0, 20.0, 16.0, 20.0]                                                           # east past the cape, back to Cape Town, east again
    fx = [{"at": START + i * SLOT_S, "lat": -35.0, "lon": lon, "dtf": 1} for i, lon in enumerate(lons)]
    x = editions.crossings(fx, START, None, None, TOGO26, editions_data.MILESTONES)
    assert abs(x["Cape of Good Hope"] - (START + (18.4731 - 16.0) / 4.0 * SLOT_S)) < 1

def test_nothing_after_the_pages_own_clock():
    fx = [{"at": START + i * 1200, "lat": 46.0 - i * 0.5, "lon": -1.79, "dtf": 1} for i in range(6)]   # 45.0 crossed at START + 2400
    ms = [("Forty-five", "lat", 45.0, lambda la, lo: True)]
    assert editions.crossings(fx, START, None, None, {}, ms, until=START + 2399) == {}
    assert editions.crossings(fx, START, None, None, {}, ms, until=START + 2400)["Forty-five"] == START + 2400
    assert editions.crossings(fx, START, None, None, {}, ms)["Forty-five"] == START + 2400

SPLITS = (("ggr2022", 11, "Simon Curwen", 2411, "Hobart", 12), ("ggr2022", 7, "Kirsten Neuschafer", 4200, "Cape Horn", 6),
          ("ggr2018", 8, "Jean-Luc Van Den Heede", 4200, "Cape Horn", 6), ("ggr2018", 8, "Jean-Luc Van Den Heede", 2411, "Hobart", 12))

def test_2018_and_2022_milestones_agree_with_yb_splits():
    """A longitude crossing is the same instant for YB and for us: Cape Horn falls 1.3 and 1.6 hours before YB's split. A MARK is
    not the same instant at all, and Hobart shows why: the 2026 course's gate is said passed only 12 nm beyond it
    (course.MARGIN_COMPUTED_NM, so that the site never calls a mark passed early), YB's 2018 and 2022 checkpoint node stands some
    12 nm north of the 2026 gate, and a boat crosses Storm Bay at 5 knots — measured, both boats land 9 to 10 hours after YB. The
    next test shows the margin is the whole of it; the tolerance here is 12 hours for a mark and stays 6 for a longitude."""
    for race, tid, name, index, ms, hours in SPLITS:
        row = next(r for r in editions_data.TEAMS[race] if r["id"] == tid); start = editions_data.EDITIONS[race]["start"]
        x = editions.crossings(prepared(race)[tid]["fixes"], start, row["ended_how"], row["ended_at"], TOGO26, editions_data.MILESTONES)
        split = zeg_stop(race, name, index)
        assert abs(x[ms] - split) < hours * 3600, (race, ms, "ours " + hhmm(x[ms]), "YB " + hhmm(split), round((x[ms] - split) / 3600.0, 2))
        assert x["Finish"] == row["ended_at"]

def test_most_of_the_hobart_gap_is_the_marks_own_margin():
    """The same crossing read at the gate's own distance to finish, with no margin (the mark's togo raised by the margin cancels
    it): Simon Curwen then lands 0.9 hours after YB's split instead of 9.2, Jean-Luc Van Den Heede 3.0 instead of 10.0. So 8.3
    and 7.0 hours of the gap are the rule by which the site says a mark is passed, not the measurement: at the gate itself the
    distance to finish is the gate's own, and no bend is being cut. What is left is YB's 2018 and 2022 checkpoint standing north
    of the 2026 gate — a different gate on a different course, which no margin can reconcile."""
    togo = dict(TOGO26, **{"Hobart Gate": TOGO26["Hobart Gate"] + course.MARGIN_COMPUTED_NM})
    for race, tid, name, index, ms, _ in SPLITS:
        if ms != "Hobart": continue
        row = next(r for r in editions_data.TEAMS[race] if r["id"] == tid)
        x = editions.crossings(prepared(race)[tid]["fixes"], editions_data.EDITIONS[race]["start"], row["ended_how"], row["ended_at"], togo, editions_data.MILESTONES)
        split = zeg_stop(race, name, index)
        assert abs(x[ms] - split) < 4 * 3600, (race, "ours " + hhmm(x[ms]), "YB " + hhmm(split), round((x[ms] - split) / 3600.0, 2))

def test_deboer_2022_is_racing_at_the_report_before_the_grounding_and_gone_after_it():
    """Amendment 9: the boat went aground at 04:45 UTC on race day 14, so the 00:00 report of day 14 still counts her racing."""
    start = editions_data.EDITIONS["ggr2022"]["start"]
    b = prepared("ggr2022")[14]
    day14 = editions.boat_day(b, start, editions.day_zero(start) + 14 * 86400, COURSE26_NM)
    day20 = editions.boat_day(b, start, editions.day_zero(start) + 20 * 86400, COURSE26_NM)
    assert day14["racing"] and day14["fresh"]
    assert not day20["racing"] and not day20["fresh"]

# ---------------------------------------------------------------- the whole race

def test_compute_returns_the_three_tables_for_a_small_fleet():
    boats = {1: straight(START, 25.0, 30), 2: straight(START, 20.0, 30)}
    ends = {1: {"ended_at": None, "ended_how": None}, 2: {"ended_at": START + 20 * SLOT_S, "ended_how": "retired"}}
    out = editions.compute(boats, ends, START, LINE, COURSE_NM, days=[1, 2, 3, 4, 5], winds={}, on_this_line=True,
                           togo_marks={}, milestones=[("Forty-five", "lat", 45.0, lambda la, lo: True)])
    assert [d["race_day"] for d in out["days"]] == [1, 2, 3, 4, 5]
    assert out["days"][4]["racing"] == 1 and out["days"][1]["racing"] == 2
    assert len(out["boat_days"]) == 10 and all(set(db.BOAT_DAY_COLS) <= set(r) for r in out["boat_days"])
    assert all(set(db.DAY_COLS) <= set(d) for d in out["days"])
    assert all(set(db.MILESTONE_COLS) <= set(m) for m in out["milestones"]) and len(out["milestones"]) == 2
    assert out["notes"] == {"filled_slots": 0, "moored_runs": 0}
    assert {r["team_id"] for r in out["boat_days"]} == {1, 2}

def test_compute_counts_what_it_added_and_what_it_left_out():
    boats = {1: three_hourly(START, 5.0, 96), 2: [{"at": START + i * SLOT_S + 7, "lat": 40.0, "lon": -1.79, "dtf": 1} for i in range(25)]}
    out = editions.compute(boats, {}, START, LINE, COURSE_NM, days=[1, 2, 3], winds={}, on_this_line=True)
    assert out["notes"]["filled_slots"] > 0 and out["notes"]["moored_runs"] > 0
    assert editions.compute(boats, {}, START, LINE, COURSE_NM, days=[1], winds={}, on_this_line=False)["notes"]["filled_slots"] == 0
