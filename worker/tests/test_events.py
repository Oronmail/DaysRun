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
    prev = [{"team_id": b["id"], "rank": b["rank"] - b["rank_change"], "best24_nm": b["best24_nm"] - (1 if b["pb24"] or b["fleet_best24"] else 0),
             "stale": False, "next_mark": b["next_mark"]} for b in s["boats"]]
    ev = events.derive(s, prev, [])
    kinds = {e["kind"] for e in ev}
    assert {"fleet_best24", "pb24", "moves", "missed_report", "next_mark"} <= kinds
    fb = next(e for e in ev if e["kind"] == "fleet_best24")
    assert fb["team_id"] == 12 and "Henry" in fb["title"] and "161" in fb["title"]
    mr = next(e for e in ev if e["kind"] == "missed_report")
    assert mr["team_id"] == 16 and "Andrea" in mr["title"]
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
    body = next(e for e in events.derive(snap(), [], []) if e["kind"] == "moves")["body"]
    assert body == "Up: Guido, Henry. Down: Guy, Isa."

def test_derive_is_safe_on_an_empty_snapshot_and_a_missing_gust():
    empty = {"as_of": T, "race_day": 0, "boats": [], "ghosts": {}, "fleet": None, "records": [], "sprints": []}
    assert events.derive(empty, [], []) == []
    g = [e for e in events.derive(snap(), [], [{"team_id": 9, "wind_kn": 36.0, "gust_kn": None}]) if e["kind"] == "gale"]
    assert len(g) == 1 and g[0]["title"] == "Pär is in gale-force wind: 36 kt"
