# worker/tests/test_db.py
import gzip, json, os, pathlib
import pytest
from datetime import datetime, timezone

FIX = pathlib.Path(__file__).parent / "fixtures"
URL = os.getenv("DATABASE_URL_TEST")
pytestmark = pytest.mark.skipif(not URL, reason="set DATABASE_URL_TEST to run (createdb ggrstats_test; postgresql://localhost:5432/ggrstats_test)")

@pytest.fixture
def conn():
    from ggrstats import db
    assert "supabase" not in URL, "never point DATABASE_URL_TEST at Supabase: this fixture truncates every table"
    c = db.connect(URL)
    for m in sorted((pathlib.Path(__file__).parents[2] / "db/migrations").glob("*.sql")):     # every migration, in order
        c.execute(m.read_text())
    c.execute("truncate edition_wind, edition_milestone, edition_boat_day, edition_day, duel, boat_perf, race, team, fix, leaderboard_snap, split, restart, leg, boat_stat, fleet_stat, record_board, sprint_result, conditions, event cascade")
    c.commit()
    yield c
    c.close()

def test_race_teams_fixes_roundtrip(conn):
    from ggrstats import db
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    db.upsert_race(conn, "ggr2026", setup)
    db.upsert_teams(conn, "ggr2026", setup)
    n = db.insert_fixes(conn, "ggr2026", teams)
    conn.commit()
    assert n == sum(len(t["moments"]) for t in teams)
    assert db.insert_fixes(conn, "ggr2026", teams) == 0            # idempotent
    fixes = db.load_fixes(conn, "ggr2026")
    assert len(fixes[6]) == len(next(t for t in teams if t["id"] == 6)["moments"])
    assert fixes[6][0]["at"] < fixes[6][-1]["at"]                      # sorted ascending
    row = conn.execute("select first_name, design_class, yacht, is_ghost from team where race_key='ggr2026' and id=9").fetchone()
    assert row == ("Pär", "Rustler 36", "Lazy Otter", False)
    assert conn.execute("select name, model from team where race_key='ggr2026' and id=13").fetchone() == ("Etienne Messikommer", "Tradewind 35")
    assert conn.execute("select is_ghost from team where race_key='ggr2026' and id=978").fetchone()[0] is True
    assert conn.execute("select name from team where race_key='ggr2026' and id=940").fetchone()[0] == "Kirsten Neuschäfer"   # YB strips the umlaut from the ghost's name too

def test_snapshot_write_roundtrip_is_idempotent(conn):
    """The derive path end to end against a real Postgres: compute → replace_snapshot → events → conditions, twice.
    Catches a wrong column count or order in any insert, which the unit tests on plain dicts cannot see."""
    from ggrstats import db, stats, events
    T = 1789516800
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    db.upsert_race(conn, "ggr2026", setup); db.upsert_teams(conn, "ggr2026", setup); db.insert_fixes(conn, "ggr2026", teams)
    fixes = db.load_fixes(conn, "ggr2026")
    from ggrstats import perf
    for t in (T - 4 * 3600, T, T):                                   # the slot before, the slot, and the slot again
        snap = stats.compute_snapshot(setup, fixes, t)
        for b in snap["boats"]:
            b["perf"] = perf.compute(fixes[b["id"]], 1788697800, b["restart"]["first_out_at"] if b["restart"] else 0, t, {})
        prev = db.previous_boat_stats(conn, "ggr2026", t)
        db.replace_snapshot(conn, "ggr2026", t, snap)
        db.insert_events(conn, "ggr2026", events.derive(snap, prev, []))
        conn.commit()
    one = lambda q: conn.execute(q, (db.ts(T),)).fetchone()[0]
    assert one("select count(*) from boat_stat where as_of=%s") == 16
    assert one("select count(*) from fleet_stat where as_of=%s") == 1
    assert one("select count(*) from boat_perf where as_of=%s") == 16
    assert one("select count(*) from duel where as_of=%s") == len(snap["duels"]) == 6
    assert conn.execute("select jsonb_array_length(series_json) > 10 from duel where ahead_id=13 and behind_id=4 and as_of=%s", (db.ts(T),)).fetchone()[0] is True
    assert conn.execute("select gain24_nm is null, lever_dir from boat_stat where team_id=6 and as_of=%s", (db.ts(T),)).fetchone() == (True, None)   # the leader
    assert conn.execute("select gain24_nm is not null and lever_nm > 0 from boat_stat where team_id=10 and as_of=%s", (db.ts(T),)).fetchone()[0] is True
    assert conn.execute("select count(*) from daily_place where as_of=%s", (db.ts(T),)).fetchone()[0] == 16                                 # T is a 0000 UTC snapshot
    assert one("select count(*) from record_board where as_of=%s") == len(snap["records"])
    assert one("select count(*) from sprint_result where as_of=%s") == len(snap["sprints"])
    assert conn.execute("select rank, round(run24_nm), jsonb_array_length(speed_log_json) from boat_stat where team_id=6 and as_of=%s", (db.ts(T),)).fetchone() == (1, 115, 42)
    assert conn.execute("select count(*) from leg where team_id=6").fetchone()[0] >= 42
    assert len(db.previous_boat_stats(conn, "ggr2026", T)) == 16       # the slot before is readable as "previous"
    n_events = conn.execute("select count(*) from event").fetchone()[0]
    db.insert_events(conn, "ggr2026", events.derive(snap, prev, [])); conn.commit()
    assert conn.execute("select count(*) from event").fetchone()[0] == n_events   # dedupe keys hold
    db.insert_conditions(conn, "ggr2026", [{"team_id": 6, "fix_at": T, "lat": 29.5, "lon": -13.6, "wind_kn": 12.0, "gust_kn": 18.0, "wind_dir_deg": 30.0,
        "mslp_hpa": 1018.0, "wave_m": 1.2, "swell_m": 1.0, "swell_period_s": 9.0, "current_kn": 0.4, "current_dir_deg": 200.0, "sst_c": 24.0, "fetched_at": T + 60}] * 2)
    conn.commit()
    assert conn.execute("select count(*) from conditions").fetchone()[0] == 1

def test_verify_knows_the_audited_values(conn, capsys):
    """verify compares with golden.snap.json EXCEPT where the 2026-09-16 audit corrected it; a healthy system prints 0."""
    from ggrstats import db, run
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    db.upsert_race(conn, "ggr2026", setup); db.upsert_teams(conn, "ggr2026", setup); db.insert_fixes(conn, "ggr2026", teams); conn.commit()
    assert run.cmd_verify(conn, "ggr2026", 1789516800, str(FIX / "golden.snap.json")) == 0
    out = capsys.readouterr().out
    assert "mismatches: 0" in out and "audited" in out


def test_a_leaderboard_tag_without_teams_is_skipped_and_the_rest_stored(conn):
    """18 Sep 2026, 21:20 UTC: YB added a third tag to ggr2026's leaderboard that carries no `teams` key at all, and every worker
    run died on it (KeyError: 'teams') at the capture step, so the site stopped taking new positions. A tag we cannot read is
    skipped; the boats in the tags we can read are stored."""
    from ggrstats import db
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    db.upsert_race(conn, "ggr2026", setup); db.upsert_teams(conn, "ggr2026", setup); conn.commit()
    lb = json.load(open(FIX / "Leaderboard.20260915T2200.json"))
    tags = lb["tags"]
    lb["tags"] = [tags[0], {"id": 99, "type": "x"}, *tags[1:]]                       # the shape YB served that evening
    db.insert_leaderboard(conn, "ggr2026", 1789513200, lb)
    conn.commit()
    stored = conn.execute("select count(*) from leaderboard_snap where race_key='ggr2026'").fetchone()[0]
    assert stored == sum(len(t["teams"]) for t in tags)
    db.insert_leaderboard(conn, "ggr2026", 1789513200, {"tags": [{"id": 1, "type": "x"}]})       # nothing readable at all: no row, no error
    conn.commit()
    assert conn.execute("select count(*) from leaderboard_snap where race_key='ggr2026'").fetchone()[0] == stored


def test_a_zegments_tag_without_teams_is_skipped(conn):
    """The same shape in the splits feed, which is read in the same breath by `capture`."""
    from ggrstats import db
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    db.upsert_race(conn, "ggr2026", setup); db.upsert_teams(conn, "ggr2026", setup); conn.commit()
    zeg = json.load(open(FIX / "zegments.20260915T2159.json"))
    before = sum(len(t.get("segments", {})) for tag in zeg["tags"] for t in tag["teams"])
    zeg["tags"] = [*zeg["tags"], {"id": 99, "type": "x"}]
    db.upsert_splits(conn, "ggr2026", zeg)
    conn.commit()
    assert conn.execute("select count(*) from split where race_key='ggr2026'").fetchone()[0] == before
def test_past_teams_and_edition_tables_roundtrip(conn):
    from ggrstats import db
    setup = {"title": "Golden Globe Race 2018", "course": {"distance": 46484.9, "nodes": []},
             "tags": [], "teams": [{"id": 8, "name": "Jean-Luc Van Den Heede", "start": 1530439200}]}
    from ggrstats import config
    assert config.race_start(setup) == 1530439200            # 2018's RaceSetup has no start on its tags: the earliest boat's
    db.upsert_race(conn, "ggr2018", setup)
    db.upsert_past_teams(conn, "ggr2018", [{"id": 8, "name": "Jean-Luc Van Den Heede", "first_name": None, "model": "Rustler 36", "yacht": "Matmut",
        "design_class": "Rustler 36", "status": "finished", "start_at": 1530439200, "ended_at": 1548753120, "ended_how": "finished",
        "ended_where": "Les Sables-d’Olonne", "class_note": None, "source": "https://goldengloberace.com/"}])
    db.replace_edition_boat_days(conn, "ggr2018", [{"team_id": 8, "race_day": 12, "as_of": 1531440000, "racing": True, "finished": False, "fresh": True,
        "fix_at": 1531440001, "lat": 27.9, "lon": -14.7, "position_text": "27°54.0′N 014°42.0′W", "togo_nm": 24380.0, "mg_nm": 1374.5, "sailed_nm": 1470.0, "run24_nm": 153.0,
        "best24_nm": 163.0, "best24_at": 1531440000, "place": 2}])
    db.replace_edition_days(conn, "ggr2018", [{"race_day": 12, "as_of": 1531440000, "racing": 16, "finished": 0, "fresh": 16, "leader_team_id": 85,
        "leader_mg_nm": 1388.0, "median_mg_nm": 1210.0, "last_mg_nm": 1014.0, "best_run_nm": 163.0, "best_run_team_id": 85,
        "best_sofar_nm": 172.0, "best_sofar_team_id": 85, "best_sofar_at": 1530600000, "mean_run_nm": 137.0, "runs_n": 15,
        "wind_kt": 10.9, "wind_legs": 90, "legs_upwind": 22, "legs_reaching": 16, "legs_running": 52, "straight_pct": 105.0}])
    db.replace_edition_milestones(conn, "ggr2018", [{"team_id": 8, "milestone": "Cape Horn", "passed_at": 1543005600, "race_day": 145}])
    conn.commit()
    ends = db.team_ends(conn, "ggr2018")
    assert ends[8] == {"ended_at": 1548753120, "ended_how": "finished"}
    assert conn.execute("select mg_nm from edition_boat_day where race_key='ggr2018' and team_id=8 and race_day=12").fetchone()[0] == 1374.5
    assert conn.execute("select position_text from edition_boat_day where race_key='ggr2018' and team_id=8 and race_day=12").fetchone()[0] == "27°54.0′N 014°42.0′W"
    assert conn.execute("select round(best24_nm), extract(epoch from best24_at)::bigint from edition_boat_day where race_key='ggr2018' and team_id=8 and race_day=12").fetchone() == (163, 1531440000)
    assert conn.execute("select median_mg_nm from edition_day where race_key='ggr2018' and race_day=12").fetchone()[0] == 1210.0
    assert conn.execute("select best_sofar_team_id, extract(epoch from best_sofar_at)::bigint from edition_day where race_key='ggr2018' and race_day=12").fetchone() == (85, 1530600000)
    assert conn.execute("select best_sofar_nm from edition_day where race_key='ggr2018' and race_day=12").fetchone()[0] == 172.0
    assert conn.execute("select race_day from edition_milestone where race_key='ggr2018' and team_id=8").fetchone()[0] == 145
    db.replace_edition_days(conn, "ggr2018", [{"race_day": 12, "as_of": 1531440000, "racing": 16, "finished": 0, "fresh": 15, "leader_team_id": 85,
        "leader_mg_nm": 1388.0, "median_mg_nm": 1211.0, "last_mg_nm": 1014.0, "best_run_nm": 163.0, "best_run_team_id": 85, "mean_run_nm": 137.0, "runs_n": 15,
        "wind_kt": None, "wind_legs": 0, "legs_upwind": 0, "legs_reaching": 0, "legs_running": 0, "straight_pct": None}])
    conn.commit()
    assert conn.execute("select count(*), max(median_mg_nm) from edition_day where race_key='ggr2018'").fetchone() == (1, 1211.0)   # replaced, not duplicated
    assert conn.execute("select best_sofar_nm from edition_day where race_key='ggr2018' and race_day=12").fetchone()[0] is None     # this call omitted it: NULL, not stale

def test_replace_with_empty_rows_touches_nothing(conn):
    """A day with nothing to write must delete nothing: replace_edition_days/replace_edition_boat_days with an empty
    list must leave every day already stored alone. Milestones are the whole-race table (day_col=None): there an
    empty list IS the new state, so a race with no milestones left ends with none."""
    from ggrstats import db
    db.upsert_race(conn, "ggr2018", {"title": "Golden Globe Race 2018", "course": {"distance": 46484.9}, "tags": [{"start": 1530439200}], "teams": []})
    db.upsert_past_teams(conn, "ggr2018", [{"id": 8, "name": "Jean-Luc Van Den Heede", "first_name": None, "model": "Rustler 36", "yacht": "Matmut",
        "design_class": "Rustler 36", "status": "racing", "start_at": 1530439200, "ended_at": None, "ended_how": None,
        "ended_where": None, "class_note": None, "source": "https://goldengloberace.com/"}])
    day = lambda d: {"race_day": d, "as_of": 1531440000 + d, "racing": 16, "finished": 0, "fresh": 16, "leader_team_id": 8,
        "leader_mg_nm": 1000.0, "median_mg_nm": 900.0, "last_mg_nm": 800.0, "best_run_nm": 150.0, "best_run_team_id": 8,
        "mean_run_nm": 130.0, "runs_n": 15, "wind_kt": 10.0, "wind_legs": 90, "legs_upwind": 20, "legs_reaching": 20, "legs_running": 50, "straight_pct": 105.0}
    boat_day = lambda d: {"team_id": 8, "race_day": d, "as_of": 1531440000 + d, "racing": True, "finished": False, "fresh": True,
        "fix_at": 1531440001 + d, "lat": 27.9, "lon": -14.7, "togo_nm": 24000.0, "mg_nm": 1300.0, "sailed_nm": 1400.0, "run24_nm": 150.0, "place": 2}
    db.replace_edition_days(conn, "ggr2018", [day(11), day(12)])
    db.replace_edition_boat_days(conn, "ggr2018", [boat_day(11), boat_day(12)])
    db.replace_edition_milestones(conn, "ggr2018", [{"team_id": 8, "milestone": "Lanzarote", "passed_at": 1530439300, "race_day": 1}])
    conn.commit()
    db.replace_edition_days(conn, "ggr2018", [])
    db.replace_edition_boat_days(conn, "ggr2018", [])
    db.replace_edition_milestones(conn, "ggr2018", [])
    conn.commit()
    assert conn.execute("select count(*) from edition_day where race_key='ggr2018'").fetchone()[0] == 2        # untouched
    assert conn.execute("select count(*) from edition_boat_day where race_key='ggr2018'").fetchone()[0] == 2   # untouched
    assert conn.execute("select count(*) from edition_milestone where race_key='ggr2018'").fetchone()[0] == 0  # the new (empty) whole-race state
