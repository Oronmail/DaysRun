# worker/tests/test_stats.py
import gzip, json, pathlib
import pytest
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

def test_a_place_change_counts_only_boats_with_a_current_fix_at_both_ends():
    """18 Sep 2026, 12:00: Andrea showed +6 and six boats -1 each, and nobody had moved. Her tracker had been silent 24 hours
    earlier, so rank_at() placed her frozen position 9th. A change of place is counted among the boats that have a current
    fix now AND had one 24 hours ago; for any other boat it is blank."""
    H = 3600; day = 86400
    def fx(*pairs): return [{"at": at, "dtf": dtf * 1852.0, "lat": 0.0, "lon": 0.0} for at, dtf in pairs]
    now = 10 * day
    fleet = {1: fx((now - day, 1000), (now, 850)),                       # the leader, then and now
             2: fx((now - day - 20 * H, 1100), (now, 900)),              # silent 24 h ago (last fix 20 h older): on paper she was last then
             3: fx((now - day, 1050), (now, 950)),                       # lost a place to nobody
             4: fx((now - day, 1060), (now, 940)),                       # really passed boat 3
             5: fx((now - day, 1200), (now - 5 * H, 1100))}              # silent now
    assert stats.place_changes(fleet, now) == {1: 0, 2: None, 3: -1, 4: 1, 5: None}
    assert stats.place_changes(fleet, 12 * H) == {1: None, 2: None, 3: None, 4: None, 5: None}   # nothing to compare with before the fleet existed

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

# worker/tests/test_stats.py (append)
# Corrections from the 2026-09-16 numbers audit (an independent recomputation) that supersede golden.snap.json:
BEST24_OVERRIDE = {3: 150}                                        # Guido: the 156 nm window bridged a missed report
BEST7_OVERRIDE = {6: 1037, 3: None, 4: None, 11: None, 12: None, 13: None, 16: None}   # nearest-grid; no clean window
VS_VDH_DAYS = {17: -0.50, 16: -0.52, 13: -0.62, 4: -0.69, 3: -0.84, 5: -0.88, 2: -0.93, 11: -1.46, 12: -1.49, 14: -1.56,
               1: -1.80, 15: -1.97, 8: -3.52, 9: -3.74}          # time rule, boats behind Van Den Heede; 6 and 10 are ahead
VS_KIRSTEN_DAYS = {8: -0.91, 9: -1.06}                           # behind Neuschäfer; the other 14 are ahead
NO_4H_LEG = {16, 4}                                                # Andrea and Daniel: the latest 4-hour leg spans a missed report
PLACE_CHANGE_OVERRIDE = {17: 0, 16: None}                           # audit N6 at its source: Andrea missed the 00:00 report, so her -1 and Ertan's +1 were never a move
RUN_PB_OVERRIDE = {3: True}                                        # Guido: his clean best (150 nm) ENDS at T, so today's run is his personal best (follows from audit N3; the audit's count of 5 predates it)

def test_snapshot_matches_golden():
    snap = stats.compute_snapshot(setup(), fleet(), T)
    assert snap["race_day"] == 10
    by = {b["id"]: b for b in snap["boats"]}
    for tid, g in GB.items():
        b = by[tid]
        assert b["rank"] == g["rank"] and b["rank_change"] == PLACE_CHANGE_OVERRIDE.get(tid, g["chg"]), tid
        assert round(b["dtf_nm"]) == round(g["dtf"]) and b["gap_nm"] == g["gap"], tid
        assert hhmm(b["last_fix_at"]) == g["fix"], tid
        assert round(b["w24"]["dist_nm"]) == g["run24"], tid
        assert (b["w4"] is None) == (tid in NO_4H_LEG), tid
        assert round(b["best24_nm"]) == BEST24_OVERRIDE.get(tid, g["best24"]), tid
        assert round(b["best4_kn"], 1) == g["best4"], tid
        want7 = BEST7_OVERRIDE.get(tid, g["best7"])
        assert (b["best7_nm"] is None) == (want7 is None) and (want7 is None or abs(b["best7_nm"] - want7) <= 3), tid
        if tid in VS_VDH_DAYS: assert abs(b["vs_vdh_days"] - VS_VDH_DAYS[tid]) < 0.15, tid
        else: assert b["vs_vdh_days"] > 0, tid
        if tid in VS_KIRSTEN_DAYS: assert abs(b["vs_kirsten_days"] - VS_KIRSTEN_DAYS[tid]) < 0.15, tid
        else: assert b["vs_kirsten_days"] > 0, tid
        assert round(b["next_mark_nm"]) == g["to_canary"], tid
        eta = datetime.fromtimestamp(b["next_mark_eta"], timezone.utc).strftime("%d %b %H%M")
        assert eta[:6] == g["eta_canary"][:6] and abs(int(eta[-4:]) - int(g["eta_canary"][-4:])) <= 12, tid   # ±12 min
        assert b["pb24"] == RUN_PB_OVERRIDE.get(tid, g["run_pb"]) and b["fleet_best24"] == g["run_fleet_best"], tid
        assert (b["restart"] is not None) == (g["restart"] is not None), tid
    assert by[16]["stale"] is True and by[6]["stale"] is False
    f = snap["fleet"]
    assert f["spread_nm"] == GOLD["spread"] and f["ahead_vdh"] == GOLD["ahead_vdh"] and f["ahead_kirsten"] == GOLD["ahead_kirsten"]
    assert f["stale_ids"] == [16]
    assert f["best_run24_nm"] == GOLD["best_run"] and f["best_run24_team_id"] == 12
    assert round(snap["ghosts"][978]["dtf_nm"]) == round(GOLD["ghosts"]["978"]["dtf"])
    assert round(snap["ghosts"][940]["dtf_nm"]) == round(GOLD["ghosts"]["940"]["dtf"])

def test_records_and_sprints():
    snap = stats.compute_snapshot(setup(), fleet(), T)
    race24 = [r for r in snap["records"] if r["kind"] == "best24" and r["win"] == "race"]
    assert race24[0]["team_id"] == 16 and round(race24[0]["value"]) == 171      # Andrea, window ending 12 Sep 0804
    assert all(r["team_id"] != 3 or round(r["value"]) != 156 for r in race24)   # Guido's bridged 156 is not a record
    assert len([s for s in snap["sprints"] if s["sprint"] == "45°N–40°N"]) == 14   # capped at T: 14 through, not 16
    race4 = [r for r in snap["records"] if r["kind"] == "best4" and r["win"] == "race"]
    assert race4[0]["team_id"] == 6 and round(race4[0]["value"], 1) == 7.6
    biscay = sorted([s for s in snap["sprints"] if s["sprint"] == "45°N–40°N"], key=lambda s: s["hours"])
    assert biscay[0]["team_id"] == 11 and abs(biscay[0]["hours"] - 59.1) < 0.1          # Mara
    portugal = sorted([s for s in snap["sprints"] if s["sprint"] == "40°N–35°N"], key=lambda s: s["hours"])
    assert portugal[0]["team_id"] == 6 and abs(portugal[0]["hours"] - 48.5) < 0.1        # Damien
    assert len([s for s in snap["sprints"] if s["sprint"] == "35°N–30°N"]) == 1

def test_snapshot_survives_the_first_hours_of_the_race():
    """The backfill derives every 4-hour slot from the gun. In the first hours some boats have no usable grid fix yet
    (in-port fixes with distance-to-finish 0 are dropped), so windows, records and the fleet's best run can all be empty."""
    fx, st = fleet(), setup()
    for k in range(grid.slot_of(START_AT), grid.slot_of(START_AT) + 8):
        snap = stats.compute_snapshot(st, fx, grid.slot_time(k))
        assert snap["as_of"] == grid.slot_time(k)
        for b in snap["boats"]:
            assert b["speed_log"] is not None and b["rank"] >= 1
    first = stats.compute_snapshot(st, fx, grid.slot_time(grid.slot_of(START_AT) + 1))     # 6 Sep 1600, the backfill's first slot
    assert first["fleet"]["racing"] == len(first["boats"]) and first["race_day"] == 0
    assert stats.compute_snapshot(st, fx, START_AT - 30 * 86400)["boats"] == []             # before any fix (trackers ran in port for days before the gun): empty, not a crash

def test_a_slot_nobody_has_reported_for_is_not_a_fleet_of_missed_reports():
    """If the worker runs before YB has published a report (or from an archive that ends earlier), every boat looks stale.
    That is missing data, not sixteen missed reports: the slot is skipped and derived by a later run."""
    fx, st = fleet(), setup()
    assert stats.unreported(stats.compute_snapshot(st, fx, T)) is False            # 15 of 16 reported at T
    assert stats.unreported(stats.compute_snapshot(st, fx, T + 24 * 3600)) is True # the fixture's last fix is 16 Sep 1205: nobody has
    assert stats.unreported({"boats": []}) is True


def test_the_race_start_survives_a_tag_yb_adds_later():
    """18 Sep 2026: YB added a Chichester Class tag to ggr2026 in the middle of the race, and a leaderboard tag without a `teams`
    key stopped the worker dead. The race start was read as min(t["start"] for t in setup["tags"]) in three places, so a tag added
    without a `start` would have stopped every derive the same way. A tag we cannot read is ignored; the boats answer instead."""
    from ggrstats import config
    tags = [{"id": 84200, "name": "All Boats", "start": 1788697800}, {"id": 84707, "name": "Chichester Class", "start": 1788697800}]
    teams = [{"id": 1, "start": 1788697800}, {"id": 978, "start": 1757000000}]
    assert config.race_start({"tags": tags, "teams": teams}) == 1788697800
    assert config.race_start({"tags": [*tags, {"id": 9, "name": "New"}], "teams": teams}) == 1788697800   # the new tag has no start
    assert config.race_start({"tags": [{"id": 9, "name": "New"}], "teams": teams}) == 1757000000          # no tag has one: the earliest boat
    assert config.race_start({"tags": [], "teams": [{"id": 1, "start": 1788697800}]}) == 1788697800
    with pytest.raises(ValueError):
        config.race_start({"tags": [{"id": 9}], "teams": [{"id": 1}]})                                    # nothing to read: say so plainly


def test_a_boat_that_is_not_moving_is_no_part_of_her_neighbours_median():
    """"Against the boats nearby" sets a boat's 24-hour run against the median run of the boats within 150 nm, which sail much the
    same weather. A boat lying in a marina sails no weather at all, and one motionless boat in the middle of a small median moves
    it a long way: on 18 Sep 2026 Guy deBoer lay at Lanzarote among five boats rounding the mark. She keeps her own figure — the
    miles she covered are a fact — but she is no measure for her neighbours. The owner's rule of 18 Sep."""
    from ggrstats import stats
    def boat(tid, run, leg_kn, lat=28.0):
        return {"id": tid, "first": f"B{tid}", "lat": lat, "lon": -14.0, "stale": False,
                "w24": {"dist_nm": run}, "w4": {"speed_kn": leg_kn}}
    boats = [boat(1, 150, 6.0), boat(2, 140, 5.5), boat(3, 130, 5.0), boat(4, 120, 4.5), boat(5, 40, 0.07)]
    stats.against_the_nearby(boats)
    by = {b["id"]: b for b in boats}
    assert by[1]["near_n"] == 3 and abs(by[1]["vs_near_nm"] - (150 - 130)) < 1e-9      # the median of 140, 130, 120 — not of 40
    assert abs(by[5]["vs_near_nm"] - (40 - 135)) < 1e-9                                # she keeps her own figure, against the four sailing
    far = [boat(1, 150, 6.0), boat(2, 140, 5.5, lat=40.0), boat(3, 130, 5.0, lat=41.0)]
    stats.against_the_nearby(far)
    assert far[0]["vs_near_nm"] is None and far[0]["near_n"] == 0                      # nobody within 150 nm: nothing to say


def test_a_report_takes_the_fix_nearest_the_hour_not_the_latest_one_after_it():
    """The grid (grid.resample) has always taken the fix NEAREST each report hour, but a boat's own place, distance to finish and
    position came from a rule that took the LATEST fix up to twenty minutes AFTER the hour. With four-hourly reports the two pick
    the same fix; with a fast tracker they do not. YB stamps a report 1 to 179 seconds after the hour, and a boat set to report
    every ten or fifteen minutes near a landfall (Andrea at Lanzarote, Guy moored there on 18 Sep) then had her 00:20 fix used
    against her neighbours' 00:00 ones — about two miles of head start, enough to invent a pass. One rule now: nearest wins."""
    from ggrstats import stats
    T = 1789516800                                                           # a report hour
    f = lambda at: {"at": at, "dtf": 1000.0, "lat": 0.0, "lon": 0.0}
    take = lambda fixes: stats.fix_at(fixes, T)["at"] - T

    assert take([f(T + 179)]) == 179                                         # the ordinary case: YB stamps the report seconds late
    assert take([f(T + 3)]) == 3
    assert take([f(T - 60 * 60), f(T + 3), f(T + 20 * 60)]) == 3             # a ten-minute tracker: the fix ON the hour, not the latest
    assert take([f(T - 600), f(T + 900)]) == -600                            # nearest, whichever side of the hour it falls
    assert take([f(T - 600), f(T + 600)]) == -600                            # a dead heat goes to the earlier: the report is at or before
    assert take([f(T - 4 * 3600), f(T + 1201)]) == -4 * 3600                 # past the tolerance: the fix after the hour is not this report's
    assert take([f(T - 5 * 3600)]) == -5 * 3600                              # a silent boat still has her last position: she must not vanish
    assert stats.fix_at([], T) is None
    assert stats.fix_at([f(T + 1201)], T) is None                            # nothing at or before, and nothing near: nothing to say
