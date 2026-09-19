# worker/tests/test_perf.py — the history-based angles YB does not show (added 2026-09-17)
import gzip, json, pathlib
from ggrstats import perf, stats, grid
from ggrstats.config import START_AT

FIX = pathlib.Path(__file__).parent / "fixtures"
T = 1789516800                                   # 2026-09-16 00:00:00 UTC

def fleet():
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    return {t["id"]: stats.sorted_fixes(t["moments"]) for t in teams}

def test_point_of_sail_from_model_wind_and_course_made_good():
    assert perf.point_of_sail(0, 180) == "running"       # wind FROM the north, boat making good south: wind astern
    assert perf.point_of_sail(0, 0) == "upwind"           # making good straight into it
    assert perf.point_of_sail(0, 90) == "reaching" and perf.point_of_sail(350, 100) == "reaching"
    assert perf.point_of_sail(10, 350) == "upwind"        # angles wrap through north

def leg(end_at, speed, lon=0.0, cmg=180.0):
    return {"end_at": end_at, "start_at": end_at - 14400, "speed_kn": speed, "cmg_deg": cmg, "lon": lon}

def test_speed_for_the_wind_uses_only_legs_in_8_to_25_knots_and_needs_ten_of_them():
    legs = [leg(i * 14400, 5.0) for i in range(1, 13)]
    wind = {l["end_at"]: (10.0, 0.0) for l in legs}
    wind[legs[0]["end_at"]] = (4.0, 0.0); wind[legs[1]["end_at"]] = (30.0, 0.0)      # too light, too strong: left out
    p = perf.wind_stats(legs, wind)
    assert p["wind_legs"] == 10 and abs(p["wind_ratio"] - 0.5) < 1e-9
    assert perf.wind_stats(legs[:9], wind)["wind_ratio"] is None                     # nine legs are not enough to say anything
    assert p["pos"]["running"]["share"] == 1.0 and p["pos"]["running"]["speed_kn"] == 5.0

def test_consistency_and_hours_parked_over_the_last_seven_days():
    legs = [leg(T - i * 14400, s) for i, s in enumerate([6, 6, 1, 1.5, 6, 6, 6, 6, 4, 4, 6, 6])]
    legs.append(leg(T - 8 * 86400, 0.5))                                             # older than seven days: ignored
    c = perf.consistency(legs, T)
    assert c["parked_h7"] == 8 and abs(c["share5_7"] - 8 / 12) < 1e-9 and c["sd7"] > 1.5

def test_night_against_day_uses_local_solar_time_from_the_longitude():
    noon_utc = 1789560000                                                             # 2026-09-16 12:00 UTC
    day = [leg(noon_utc + 2 * 3600 + i * 86400, 6.0, lon=0.0) for i in range(6)]      # leg midpoint 1200 local at Greenwich
    night = [leg(noon_utc + 2 * 3600 + i * 86400, 5.0, lon=180.0) for i in range(6)]  # the same UTC hour is midnight at 180°
    n = perf.night_day(day + night)
    assert n["n_day"] == 6 and n["n_night"] == 6 and abs(n["night_delta"] - (-1.0)) < 1e-9
    assert perf.night_day(day)["night_delta"] is None

def test_leverage_is_the_distance_and_compass_side_off_the_leaders_track():
    track = [{"lat": 10 - i, "lon": -20.0} for i in range(11)]                         # the leader sailed due south down 20°W
    d, side = perf.leverage(track, 5.0, -19.0)
    assert abs(d - 59.8) < 0.5 and side == "E"                                         # one degree of longitude at 5°N
    assert perf.leverage(track, 5.0, -21.0)[1] == "W" and perf.leverage(track, 5.0, -20.0) == (0.0, None)

def test_fleet_angles_on_the_golden_snapshot():
    snap = stats.compute_snapshot(json.load(open(FIX / "RaceSetup.20260916.json")), fleet(), T)
    by = {b["id"]: b for b in snap["boats"]}
    assert by[6]["gain24_nm"] is None and by[6]["lever_nm"] is None                   # the leader gains nothing on the leader
    assert by[16]["gain24_nm"] is None and by[16]["vs_near_nm"] is None               # Andrea missed the report: no false loss
    fx = fleet(); d = lambda tid, t: stats.at_or_before(fx[tid], t)["dtf"] / 1852.0
    want = (d(10, T - 86400) - d(6, T - 86400)) - (d(10, T) - d(6, T))                # Pat on Damien, fix to fix
    assert abs(by[10]["gain24_nm"] - want) < 0.01
    assert by[12]["vs_near_nm"] > 5                                                   # Henry sailed the fleet's longest run that day
    assert all(b["lever_dir"] in (None, "N", "NE", "E", "SE", "S", "SW", "W", "NW") for b in snap["boats"])
    assert 0 < by[10]["lever_nm"] < 120


def test_a_leg_the_boat_spent_moored_is_no_measure_of_her_speed_for_the_wind():
    """18 Sep 2026: Guy deBoer lay at Lanzarote from about 17:50 UTC. Every four hours after that added a leg of 0.07 kt in a real
    breeze, and those legs were counted like any other: they pulled his speed for the wind down for the rest of the race, put a
    moored boat's compass noise into his point-of-sail table, and sat in the fleet's median. A boat that is not moving is not
    sailing badly; she is not sailing. The owner's rule of 18 Sep, one level deeper than the daily board's average."""
    sailing = [leg(i * 14400, 5.0) for i in range(1, 13)]
    moored = [leg(i * 14400, 0.07, cmg=(i * 37) % 360) for i in range(13, 19)]       # six reports alongside, the compass wandering
    wind = {l["end_at"]: (10.0, 0.0) for l in sailing + moored}
    p = perf.wind_stats(sailing + moored, wind)
    assert p["wind_legs"] == 12 and abs(p["wind_ratio"] - 0.5) < 1e-9                # the twelve she sailed, not eighteen
    assert p["pos"]["running"]["legs"] == 12 and set(p["pos"]) == {"running"}        # and no band invented out of her wandering
    assert perf.wind_stats(sailing, wind)["wind_ratio"] == p["wind_ratio"]           # the same answer as if she had never stopped


def test_night_and_day_leave_out_the_hours_she_was_not_moving():
    sailing = [leg(i * 14400, 6.0) for i in range(1, 13)]
    moored = [leg(i * 14400, 0.07) for i in range(13, 25)]
    a, b = perf.night_day(sailing), perf.night_day(sailing + moored)
    assert a == b
