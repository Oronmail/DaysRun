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
