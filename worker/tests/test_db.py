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
    c.execute(open(pathlib.Path(__file__).parents[2] / "db/migrations/0001_init.sql").read())
    c.execute("truncate race, team, fix, leaderboard_snap, split, restart, leg, boat_stat, fleet_stat, record_board, sprint_result, conditions, event cascade")
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
    for t in (T - 4 * 3600, T, T):                                   # the slot before, the slot, and the slot again
        snap = stats.compute_snapshot(setup, fixes, t)
        prev = db.previous_boat_stats(conn, "ggr2026", t)
        db.replace_snapshot(conn, "ggr2026", t, snap)
        db.insert_events(conn, "ggr2026", events.derive(snap, prev, []))
        conn.commit()
    one = lambda q: conn.execute(q, (db.ts(T),)).fetchone()[0]
    assert one("select count(*) from boat_stat where as_of=%s") == 16
    assert one("select count(*) from fleet_stat where as_of=%s") == 1
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
