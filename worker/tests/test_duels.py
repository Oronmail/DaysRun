# worker/tests/test_duels.py — the private races inside the fleet (added 2026-09-17)
import gzip, json, pathlib
from ggrstats import duels, stats, events

FIX = pathlib.Path(__file__).parent / "fixtures"
T = 1789516800                                   # 2026-09-16 00:00:00 UTC
H4 = 14400

def fixes(dtf_at):
    """A boat that reports every 4 hours for 4 days up to T, with distance to finish (nm) given by dtf_at(hours before T)."""
    return [{"at": T - h * 3600, "lat": 30.0, "lon": -13.0, "dtf": dtf_at(h) * 1852.0} for h in range(96, -1, -4)]

def boat(id, dtf_nm, lat=30.0, lon=-13.0, stale=False):
    return {"id": id, "first": f"B{id}", "dtf_nm": dtf_nm, "lat": lat, "lon": lon, "stale": stale}

def test_a_duel_is_two_neighbours_in_the_ranking_within_15_miles_both_with_a_current_fix():
    fx = {1: fixes(lambda h: 1000 + 5 * h), 2: fixes(lambda h: 1008 + 5 * h), 3: fixes(lambda h: 1030 + 5 * h), 4: fixes(lambda h: 1033 + 5 * h)}
    found = duels.find([boat(1, 1000), boat(2, 1008), boat(3, 1030), boat(4, 1033, stale=True)], fx, T)
    assert [(d["ahead_id"], d["behind_id"]) for d in found] == [(1, 2)]            # 2–3 are 22 nm apart; 4 has no current fix
    d = found[0]
    assert abs(d["gap_nm"] - 8.0) < 1e-6 and abs(d["gap24_nm"] - 8.0) < 1e-6 and d["lead_changes"] == 0
    assert len(d["series"]) == 19 and d["series"][-1] == [T, 8.0]                  # three days of 4-hour reports, oldest first

def test_the_history_shows_a_chase_and_a_pass():
    # boat 2 was 30 nm behind three days ago, drew level 8 hours ago, and is 4 nm ahead now
    fx = {1: fixes(lambda h: 1000 + 5 * h), 2: fixes(lambda h: 1000 + 5 * h - 4 + 0.5 * h if h <= 8 else 1000 + 5 * h + (h - 8) * 30 / 64)}
    found = duels.find([boat(2, 996), boat(1, 1000, lat=30.2, lon=-13.0)], fx, T)
    d = found[0]
    assert (d["ahead_id"], d["behind_id"]) == (2, 1) and abs(d["gap_nm"] - 4.0) < 1e-6
    assert d["lead_changes"] == 1 and d["gap72_nm"] < -29                          # negative: three days ago today's leader of the pair was behind
    assert d["side"] == "N" and 11 < d["water_nm"] < 13                            # the boat behind lies 12 nm north of the boat ahead
    assert d["passed_at"] is not None and T - 8 * 3600 <= d["passed_at"] <= T

def test_duels_on_the_golden_snapshot():
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    snap = stats.compute_snapshot(json.load(open(FIX / "RaceSetup.20260916.json")), {t["id"]: stats.sorted_fixes(t["moments"]) for t in teams}, T)
    pairs = [(d["ahead_id"], d["behind_id"]) for d in snap["duels"]]
    assert pairs == [(17, 13), (13, 4), (3, 5), (5, 2), (11, 12), (12, 14)]        # Andrea (16) has no current fix, so Ertan's neighbour is Etienne
    assert all(0 <= d["gap_nm"] <= 15 for d in snap["duels"])

def test_a_pass_inside_a_duel_is_an_event_said_once():
    d = {"ahead_id": 12, "behind_id": 11, "gap_nm": 11.3, "gap24_nm": -3.0, "gap72_nm": -38.0, "lead_changes": 1, "passed_at": T - H4, "water_nm": 37.0, "side": "W", "series": []}
    snap = {"as_of": T, "boats": [{"id": 12, "first": "Henry", "rank": 10, "rank_change": 1, "stale": False, "w24": None, "fleet_best24": False, "pb24": False, "restart": None, "next_mark": "Lanzarote", "next_mark_nm": 500, "next_mark_eta": None},
                                  {"id": 11, "first": "Mara", "rank": 11, "rank_change": -1, "stale": False, "w24": None, "fleet_best24": False, "pb24": False, "restart": None, "next_mark": "Lanzarote", "next_mark_nm": 510, "next_mark_eta": None}],
            "fleet": {"stale_ids": []}, "duels": [d]}
    ev = [e for e in events.derive(snap, [], []) if e["kind"] == "pass"]
    assert len(ev) == 1 and ev[0]["title"] == "Henry passes Mara and leads by 11 nm, after trailing by 38 nm three days ago"
    assert ev[0]["dedupe_key"] == f"pass:12:11:{T - H4}"                            # keyed on the moment of the pass: the next report does not repeat it

def test_a_chase_that_closes_to_within_five_miles_is_said_once_a_day():
    d = {"ahead_id": 13, "behind_id": 4, "gap_nm": 1.0, "gap24_nm": 7.0, "gap72_nm": 16.0, "lead_changes": 0, "passed_at": None, "water_nm": 12.0, "side": "NW", "series": []}
    mk = lambda id, first, rank: {"id": id, "first": first, "rank": rank, "rank_change": 0, "stale": False, "w24": None, "fleet_best24": False, "pb24": False, "restart": None, "next_mark": "Trindade", "next_mark_nm": 2900, "next_mark_eta": None}
    snap = {"as_of": T, "boats": [mk(13, "Etienne", 4), mk(4, "Daniel", 5)], "fleet": {"stale_ids": []}, "duels": [d]}
    ev = [e for e in events.derive(snap, [], []) if e["kind"] == "duel"]
    assert len(ev) == 1 and ev[0]["title"] == "Daniel has closed to 1 nm behind Etienne, from 16 nm three days ago" and ev[0]["dedupe_key"] == "duel:13:4:2026-09-16"

def test_a_pass_needs_two_clear_miles_and_the_first_days_of_a_race_say_nothing():
    mk = lambda id, first, rank: {"id": id, "first": first, "rank": rank, "rank_change": 0, "stale": False, "w24": None, "fleet_best24": False, "pb24": False, "restart": None, "next_mark": "Trindade", "next_mark_nm": 2900, "next_mark_eta": None}
    d = {"ahead_id": 3, "behind_id": 5, "gap_nm": 0.4, "gap24_nm": -2.0, "gap72_nm": -6.0, "lead_changes": 1, "passed_at": T - H4, "water_nm": 20.0, "side": "E", "series": []}
    snap = {"as_of": T, "race_day": 10, "boats": [mk(3, "Guido", 7), mk(5, "Guy", 8)], "fleet": {"stale_ids": []}, "duels": [d]}
    assert [e for e in events.derive(snap, [], []) if e["kind"] == "pass"] == []                 # level, not a pass: inside the noise of two fixes
    d2 = dict(d, gap_nm=3.2, passed_at=T - 2 * H4)                                               # two reports later she is 3 nm clear: now it is said
    said = [e for e in events.derive(dict(snap, duels=[d2]), [], []) if e["kind"] == "pass"]
    assert len(said) == 1 and said[0]["title"] == "Guido passes Guy and leads by 3 nm, after trailing by 6 nm three days ago"
    early = dict(snap, race_day=1, duels=[d2])                                                   # day 1: the whole fleet is within a few miles
    assert [e for e in events.derive(early, [], []) if e["kind"] in ("pass", "duel")] == []
