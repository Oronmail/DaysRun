# worker/tests/test_db.py
import gzip, json, os, pathlib
import pytest
from datetime import datetime, timedelta, timezone

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
    c.execute("truncate duel, boat_perf, race, team, fix, leaderboard_snap, split, restart, leg, boat_stat, fleet_stat, record_board, sprint_result, conditions, event cascade")
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


def test_the_class_comes_from_ybs_own_tag_and_the_override_only_stands_in_until_it_does():
    """NOR C.2.1: every entrant starts in the Suhaili class. C.2.2: one who makes an unapproved stop or receives material
    assistance is placed in the Chichester class. YB carries it as a tag on the team. On 18 Sep 2026 the race announced on its own
    account that Guy deBoer had been moved to the Chichester class after stopping at Marina Rubicón for repairs, and YB had not
    changed its tag a day later — hence an override that names its source and its date, and that counts for nothing the moment
    YB's own data says the same."""
    from ggrstats import db
    tags = [{"id": 84200, "name": "All Boats"}, {"id": 84707, "name": "Chichester Class"}, {"id": 84554, "name": "Previous Competitors"}]
    cls = lambda tid, team_tags, override=None: db.race_class({"id": tid, "tags": team_tags}, tags, override or {})
    assert cls(1, [84200]) == "Suhaili"
    assert cls(5, [84200, 84707]) == "Chichester"                      # YB has moved her
    assert cls(978, [84554]) is None                                   # a replay is in no class
    assert cls(5, [84200], {5: "Chichester"}) == "Chichester"          # the override stands in
    assert cls(5, [84200, 84707], {5: "Chichester"}) == "Chichester"   # and agrees once YB says it
    assert cls(1, [84200], {5: "Chichester"}) == "Suhaili"             # it names one boat and no other

def test_export_view_gathers_a_day_for_the_data_files(conn):
    """The view behind the data files (site/app/data): a day's six legs, how many are whole, whether the run crossed a silence,
    where the 24 hours began, the day's model wind. It gathers; what is blanked for a boat without a current fix is the site's job."""
    T = datetime(2026, 9, 17, 0, 0, tzinfo=timezone.utc)
    conn.execute("insert into race (key, title, start_at) values ('ggr2026', 'GGR 2026', '2026-09-06 12:30+00')")
    conn.execute("insert into team (race_key, id, name, first_name, yacht, model, country_code) values ('ggr2026', 8, 'Selim Yalcin', 'Selim', 'Help Disabled Children', 'Endurance 35', 'TUR')")
    for k in range(7):                                                # seven reports, 24 h apart end to end; the one 8 h before T was missed
        at = T - timedelta(hours=4 * k); stale = k == 2
        fix_at = at - timedelta(hours=4) if stale else at + timedelta(seconds=15)
        conn.execute("insert into boat_stat (race_key, team_id, as_of, rank, dtf_nm, last_fix_at, stale, lat, lon, run24_nm, run24_bridged) values ('ggr2026', 8, %s, 16, %s, %s, %s, %s, -10, 126.3, %s)",
                     (at, 25000 + 20 * k, fix_at, stale, 38 + 0.3 * k, k == 0))
        if k not in (1, 2):                                           # a missed report leaves no leg on either side of it
            conn.execute("insert into leg (race_key, team_id, end_slot, dist_nm, speed_kn) values ('ggr2026', 8, %s, 20, %s)", (at, 5 + k / 10))
        if k in (0, 3, 5):                                            # the weather service answered for three of the reports
            conn.execute("insert into conditions (race_key, team_id, fix_at, wind_kn) values ('ggr2026', 8, %s, %s)", (fix_at, 20 + k))
    conn.commit()
    row = conn.execute("""select closes_day, skipper, design, leg1_kn, leg2_kn, leg3_kn, leg4_kn, leg5_kn, leg6_kn, legs_complete,
                                 start_lat, start_dtf_nm - dtf_nm, round(wind_mean_kn::numeric, 2)::float, wind_max_kn, wind_reports, wind_kn, leg_kn, run24_bridged
                          from export_report where race_key = 'ggr2026' and team_id = 8 and as_of = %s""", (T,)).fetchone()
    assert row[:3] == (True, "Selim Yalcin", "Endurance 35")
    assert row[3:10] == (5.5, 5.4, 5.3, None, None, 5.0, 4)          # oldest first; the two legs round the missed report are blank
    assert row[10:12] == (39.8, 120)                                  # the fix 24 hours earlier; made good = the fall in distance to finish
    assert row[12:15] == (22.67, 25, 3) and row[15:] == (20, 5.0, True)   # the day's model wind from the reports that have one; this report's own; the run crossed the silence
    missed = conn.execute("select closes_day, stale, legs_complete from export_report where team_id = 8 and as_of = %s", (T - timedelta(hours=8),)).fetchone()
    assert missed == (False, True, 4)                                 # the view gathers; blanking a boat without a current fix is the site's job
    assert conn.execute("select has_table_privilege('anon', 'export_report', 'select')").fetchone()[0] is True
