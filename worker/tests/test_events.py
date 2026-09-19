# worker/tests/test_events.py
import gzip, json, pathlib
from ggrstats import stats, events

FIX = pathlib.Path(__file__).parent / "fixtures"
T = 1789516800

def snap():
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    return stats.compute_snapshot(setup, {t["id"]: stats.sorted_fixes(t["moments"]) for t in teams}, T)

def test_events_for_race_day_10():
    s = snap()
    prev = [{"team_id": b["id"], "rank": b["rank"] - (b["rank_change"] or 0),   # a blank change (no current fix at one end) counts as no change here "best24_nm": b["best24_nm"] - (1 if b["pb24"] or b["fleet_best24"] else 0),
             "stale": False, "next_mark": b["next_mark"]} for b in s["boats"]]
    ev = events.derive(s, prev, [])
    kinds = {e["kind"] for e in ev}
    assert {"fleet_best24", "pb24", "moves", "missed_report", "next_mark"} <= kinds
    fb = next(e for e in ev if e["kind"] == "fleet_best24")
    assert fb["team_id"] == 12 and "Henry" in fb["title"] and "161" in fb["title"]
    mr = next(e for e in ev if e["kind"] == "missed_report")
    assert mr["team_id"] == 16 and "Andrea" in mr["title"]
    assert mr["title"] == "Andrea’s tracker skipped the 00:00 report" and mr["body"] == "Last fix at 20:03 UTC."       # times read 20:03, never 2003
    assert all(e["dedupe_key"].startswith(e["kind"]) for e in ev)
    assert not any(w in (e["title"] + (e["body"] or "")).lower().split() for e in ev for w in ("he", "she", "his", "her"))

def test_gale_event_from_conditions():
    s = snap()
    cond = [{"team_id": 9, "wind_kn": 36.0, "gust_kn": 45.0}]
    ev = events.derive(s, [], cond)
    g = [e for e in ev if e["kind"] == "gale"]
    assert len(g) == 1 and g[0]["team_id"] == 9 and "Pär" in g[0]["title"]

def test_moves_ignore_a_place_gained_against_a_stale_boat():
    """Audit N6: Andrea's fix is 3.9 h old at T, so Ertan 'passing' Andrea is a staleness artefact, not a move.
    Guido/Guy and Henry/Isa are genuine swaps."""
    ev = next(e for e in events.derive(snap(), [], []) if e["kind"] == "moves")
    assert ev["title"] == "Places, last 24 hours: ▲1 Guido, Henry · ▼1 Guy, Isa"     # the feed shows titles: the title says who moved
    assert ev["dedupe_key"] == "moves:2026-09-16:▲1 Guido, Henry · ▼1 Guy, Isa"         # the same line is stored once a day, not every four hours

def test_derive_is_safe_on_an_empty_snapshot_and_a_missing_gust():
    empty = {"as_of": T, "race_day": 0, "boats": [], "ghosts": {}, "fleet": None, "records": [], "sprints": []}
    assert events.derive(empty, [], []) == []
    g = [e for e in events.derive(snap(), [], [{"team_id": 9, "wind_kn": 36.0, "gust_kn": None}]) if e["kind"] == "gale"]
    assert len(g) == 1 and g[0]["title"] == "Pär is in gale-force wind: 36 kt"

def test_best_run_events_fire_when_set_not_every_four_hours():
    """Someone always holds the fleet's longest run of the last 24 hours, and a boat on a good day keeps its personal best
    for several reports. The feed says so once: when the holder changes, and when a personal best is newly set."""
    s = snap()
    same = [{"team_id": b["id"], "rank": b["rank"], "best24_nm": b["best24_nm"], "stale": b["stale"], "next_mark": b["next_mark"],
             "fleet_best24": b["fleet_best24"], "pb24": b["pb24"]} for b in s["boats"]]
    kinds = [e["kind"] for e in events.derive(s, same, [])]
    assert "fleet_best24" not in kinds and "pb24" not in kinds
    other = [dict(p, fleet_best24=(p["team_id"] == 6), pb24=False) for p in same]           # yesterday Damien held it
    ev = events.derive(s, other, [])
    assert [e["team_id"] for e in ev if e["kind"] == "fleet_best24"] == [12]                 # Henry takes it: one event
    assert len([e for e in ev if e["kind"] == "pb24"]) == 5


def test_a_rounding_is_keyed_by_the_boat_and_the_mark_so_a_re_derive_never_says_it_twice():
    """18 Sep 2026: a re-derive of history said two Lanzarote roundings a second time (events 2334 and 2338, deleted by hand),
    because a rounding was keyed by boat and DATE — recompute it under a different rule and it can land on a report of another
    day, which is a new key and so a new event. A mark is rounded once: boat and mark are the key."""
    from ggrstats import events
    snap = {"as_of": 1789516800, "boats": [
        {"id": 12, "first": "Henry", "next_mark": "Trindade", "next_mark_nm": 2790.0, "next_mark_eta": None, "stale": False,
         "w24": {"dist_nm": 150.0}, "fleet_best24": False, "pb24": False, "best24_nm": 180.0, "restart": None, "gap_nm": 0}]}
    prev = [{"team_id": 12, "next_mark": "Lanzarote", "stale": False, "fleet_best24": False, "pb24": False, "restart_at": None}]
    out = events.derive(snap, prev, [])
    rounding = [e for e in out if e["kind"] == "next_mark" and "rounded" in e["title"].lower() or e["kind"] == "next_mark" and "Lanzarote" in e["title"]]
    assert len(rounding) == 1, out
    assert rounding[0]["dedupe_key"] == "next_mark:12:Lanzarote"

    later = dict(snap, as_of=1789516800 + 4 * 3600)                                   # the same rounding found one report later
    again = events.derive(later, prev, [])
    assert [e["dedupe_key"] for e in again if e["kind"] == "next_mark"] == ["next_mark:12:Lanzarote"]
