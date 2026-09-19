# worker/tests/test_editions_cli.py — the three commands of the Past races page against a real PostgreSQL: a past race imported
# from a folder of YB's own files, its three tables computed, the model wind fetched batch by batch (a fake fetcher: no network),
# and the standing cross-check of this year's rows against the live pages' own figures.
import gzip, json, os, pathlib
from datetime import datetime, timezone
import pytest

FIX = pathlib.Path(__file__).parent / "fixtures"
URL = os.getenv("DATABASE_URL_TEST")
pytestmark = pytest.mark.skipif(not URL, reason="set DATABASE_URL_TEST to run (createdb ggrstats_test; postgresql://localhost:5432/ggrstats_test)")
T26 = 1789516800                      # 2026-09-16 00:00:00 UTC, the golden report: race day 10

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

def seed_2026_course(conn):
    """The 2026 race row alone: every fleet, past or present, is measured on that course line."""
    from ggrstats import db
    db.upsert_race(conn, "ggr2026", json.load(open(FIX / "RaceSetup.20260916.json")))
    conn.commit()

def seed_2026_fleet(conn):
    """The 2026 race, its teams and the whole master track up to the golden report."""
    from ggrstats import db
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    db.upsert_race(conn, "ggr2026", setup)
    db.upsert_teams(conn, "ggr2026", setup)
    db.insert_fixes(conn, "ggr2026", json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz")))
    conn.commit()
    return setup

def folder(tmp_path, race):
    """A folder in YB's own shape, as --from-dir takes it: RaceSetup, zegments and AllPositions3.json (the decoded list the
    fixtures hold, which --from-dir accepts beside YB's binary)."""
    (tmp_path / "RaceSetup").write_text((FIX / f"RaceSetup.{race}.json").read_text())
    (tmp_path / "zegments").write_text((FIX / f"zegments.{race}.json").read_text())
    (tmp_path / "AllPositions3.json").write_bytes(gzip.open(FIX / f"{race}.sample.json.gz").read())
    return tmp_path

def rows(conn, q, args=()):
    return conn.execute(q, args).fetchall()

def spy_on_compute(monkeypatch):
    """Records what cmd_editions asks editions.compute for — the mark scale, the line and the page's own clock."""
    from ggrstats import editions
    real, seen = editions.compute, {}
    def spy(*a, **kw):
        seen.update(kw, args=a)
        return real(*a, **kw)
    monkeypatch.setattr(editions, "compute", spy)
    return seen

# ---------------------------------------------------------------- import-edition

def test_2022_imported_from_a_folder_then_its_three_tables(conn, tmp_path, monkeypatch):
    """The whole path for a past race: YB's three files in, the curated fleet and every fix stored, then the day tables of the
    page. The figures are those of the race, not of the plan: Guy deBoer went aground at 04:45 UTC on race day 14 and is
    therefore still racing at that day's 00:00 report."""
    from ggrstats import config, editions_data, run
    seed_2026_course(conn)
    n = run.cmd_import_edition(conn, "ggr2022", from_dir=folder(tmp_path, "ggr2022"))
    assert n > 5000
    names = dict(rows(conn, "select id, name from team where race_key='ggr2022'"))
    assert names[7] == "Kirsten Neuschäfer" and names[14] == "Guy deBoer"                     # the curated names, not YB's
    assert len(names) == 16                                                                   # every boat of the race, tracks or not
    assert conn.execute("select count(distinct team_id) from fix where race_key='ggr2022'").fetchone()[0] == 5    # the sample's five tracks
    assert conn.execute("select count(*) from split where race_key='ggr2022'").fetchone()[0] > 0
    assert conn.execute("select extract(epoch from start_at)::bigint from race where key='ggr2022'").fetchone()[0] == editions_data.EDITIONS["ggr2022"]["start"]
    assert run.cmd_import_edition(conn, "ggr2022", from_dir=tmp_path) == 0                    # idempotent: no fix written twice
    assert len(rows(conn, "select id from team where race_key='ggr2022'")) == 16

    seen = spy_on_compute(monkeypatch)
    out = run.cmd_editions(conn, "ggr2022", as_of=None)
    assert seen["until"] is None and seen["args"][7] is True                                  # a race long finished, measured on the 2026 line
    assert abs(seen["togo_marks"]["Lanzarote"] - config.MARK_TOGO_OBSERVED["Lanzarote"]) > 5  # the line's own figure, not YB's observed one
    days = rows(conn, "select race_day, racing, fresh, leader_team_id from edition_day where race_key='ggr2022' order by race_day")
    assert days[0][0] == 1 and days[-1][0] >= 278                                             # to the last finisher (Jeremy Bagshaw, race day 278)
    assert len(days) == days[-1][0] and len(out["days"]) == len(days)
    d12 = next(d for d in days if d[0] == 12)
    assert d12[1] == 5 and d12[3] == 11                                                       # five boats of the sample racing; Simon Curwen leads
    ms = dict(rows(conn, "select milestone, race_day from edition_milestone where race_key='ggr2022' and team_id=7"))
    assert ms["Cape Horn"] == 164 and ms["Finish"] == 235
    assert "Lanzarote" in dict(rows(conn, "select milestone, race_day from edition_milestone where race_key='ggr2022' and team_id=14"))
    assert conn.execute("select count(*) from edition_boat_day where race_key='ggr2022' and team_id=14 and racing").fetchone()[0] == 14   # days 1 to 14
    assert set(out["notes"]) == {"filled_slots", "stopped_legs", "interp_reports"}
    assert conn.execute("select count(*) from edition_boat_day where race_key='ggr2022'").fetchone()[0] == 5 * len(days)

def test_2018_imported_from_a_folder_and_the_three_hourly_week_makes_runs(conn, tmp_path):
    """4 to 9 July 2018 the whole fleet reported every three hours, a rhythm the 4-hour grid meets at 00:00 and 12:00 only:
    without editions.fill_slots those six race days would show no run at all."""
    from ggrstats import run
    seed_2026_course(conn)
    assert run.cmd_import_edition(conn, "ggr2018", from_dir=folder(tmp_path, "ggr2018")) > 2000
    assert len(rows(conn, "select id from team where race_key='ggr2018'")) == 17              # 17 starters; Francesco Cappelletti never crossed the line
    out = run.cmd_editions(conn, "ggr2018", as_of=None)
    assert out["notes"]["filled_slots"] > 0
    week = rows(conn, """select race_day, count(run24_nm) from edition_boat_day where race_key='ggr2018' and race_day between 3 and 8
                         group by race_day order by race_day""")
    assert [d for d, _ in week] == [3, 4, 5, 6, 7, 8] and all(n > 0 for _, n in week), week
    assert conn.execute("select count(*) from edition_milestone where race_key='ggr2018' and milestone='Finish'").fetchone()[0] == 2   # the sample's two finishers

def test_the_import_fetches_only_three_endpoints_and_backs_up_into_the_races_own_folder(conn, monkeypatch, tmp_path):
    """Amendments 2 and 3: the leaderboard is not fetched (YB served 2018's as a 503 on the morning of 18 Sep 2026), and the raw
    files go to the past race's own folder of the bucket, never over the live race's snapshots."""
    from ggrstats import backup, decode, run, yb
    seed_2026_course(conn)
    sample = json.load(gzip.open(FIX / "ggr2018.sample.json.gz", "rt"))
    asked, sent = {}, {}
    p = tmp_path / "AllPositions3.20180701T1000.gz"; p.write_bytes(b"gzipped")
    def fake_snapshot(race, snapdir, session=None, now=None, names=None):
        asked["names"] = tuple(names)
        return {"RaceSetup": ((FIX / "RaceSetup.ggr2018.json").read_bytes(), p),
                "zegments": ((FIX / "zegments.ggr2018.json").read_bytes(), p), "AllPositions3": (b"binary", p)}
    monkeypatch.setattr(yb, "snapshot", fake_snapshot)
    monkeypatch.setattr(decode, "decode", lambda raw: sample)
    monkeypatch.setattr(backup, "upload_files", lambda paths, race=None: sent.update(race=race, n=len(list(paths))) or len(paths))
    assert run.cmd_import_edition(conn, "ggr2018") > 2000
    assert asked["names"] == ("RaceSetup", "zegments", "AllPositions3")
    assert sent == {"race": "ggr2018", "n": 3}

def test_a_backup_failure_never_stops_the_import(conn, monkeypatch, tmp_path):
    from ggrstats import backup, decode, run, yb
    seed_2026_course(conn)
    sample = json.load(gzip.open(FIX / "ggr2018.sample.json.gz", "rt"))
    p = tmp_path / "AllPositions3.20180701T1000.gz"; p.write_bytes(b"gzipped")
    monkeypatch.setattr(yb, "snapshot", lambda race, snapdir, session=None, now=None, names=None: {
        "RaceSetup": ((FIX / "RaceSetup.ggr2018.json").read_bytes(), p), "zegments": ((FIX / "zegments.ggr2018.json").read_bytes(), p),
        "AllPositions3": (b"binary", p)})
    monkeypatch.setattr(decode, "decode", lambda raw: sample)
    def boom(paths, race=None):
        raise RuntimeError("the bucket said no")
    monkeypatch.setattr(backup, "upload_files", boom)
    assert run.cmd_import_edition(conn, "ggr2018") > 2000                                     # the fixes are in; the upload is only a copy

# ---------------------------------------------------------------- editions, this year's race

def test_2026_writes_the_asked_day_with_ybs_own_distance_to_finish(conn, monkeypatch):
    """This year's fleet keeps YB's own distance to finish, as every other page of the site shows it, so no two pages disagree."""
    from ggrstats import config, run
    setup = seed_2026_fleet(conn)
    run.cmd_derive(conn, "ggr2026", T26, None)                                                # the 00:00 report published: race day 10
    seen = spy_on_compute(monkeypatch)
    out = run.cmd_editions(conn, "ggr2026", as_of=T26)
    assert seen["until"] == T26 and seen["args"][7] is False                                  # the page's own clock; YB's own distances
    assert seen["togo_marks"]["Lanzarote"] == config.MARK_TOGO_OBSERVED["Lanzarote"]
    assert [r[0] for r in rows(conn, "select race_day from edition_day where race_key='ggr2026'")] == [10]
    assert (out["days"][0]["racing"], out["days"][0]["fresh"]) == (16, 15)                    # 16 boats racing; one had not reported at 00:00
    golden = {b["id"]: b for b in json.load(open(FIX / "golden.snap.json"))["boats"]}
    course_nm = setup["course"]["distance"] / 1.852
    fresh = rows(conn, "select team_id, mg_nm from edition_boat_day where race_key='ggr2026' and race_day=10 and fresh")
    assert len(fresh) == 15
    for tid, mg in fresh:
        assert abs((course_nm - mg) - golden[tid]["dtf"]) < 0.6, tid
    assert conn.execute("select count(*) from edition_boat_day where race_key='ggr2026'").fetchone()[0] == 16
    assert conn.execute("select count(*) from edition_milestone where race_key='ggr2026'").fetchone()[0] == 0   # nobody had rounded Lanzarote by this report
    before = rows(conn, "select * from edition_boat_day where race_key='ggr2026' order by team_id")
    run.cmd_editions(conn, "ggr2026", as_of=T26)                                              # a second run changes nothing
    assert rows(conn, "select * from edition_boat_day where race_key='ggr2026' order by team_id") == before

def test_2026_without_a_published_report_stops_at_the_day_before(conn):
    """The page never shows a day derive has not published: at the 00:00 slot itself the last day stays yesterday's until the
    snapshot of that report is in fleet_stat."""
    from ggrstats import run
    seed_2026_fleet(conn)
    run.cmd_editions(conn, "ggr2026", as_of=T26)
    assert [r[0] for r in rows(conn, "select race_day from edition_day where race_key='ggr2026'")] == [9]
    run.cmd_derive(conn, "ggr2026", T26, None)
    run.cmd_editions(conn, "ggr2026", as_of=T26)                                              # now published: day 10 joins day 9
    assert [r[0] for r in rows(conn, "select race_day from edition_day where race_key='ggr2026' order by race_day")] == [9, 10]

def test_2026_since_writes_every_day_from_that_date_and_a_gap_heals_itself(conn):
    from ggrstats import run
    seed_2026_fleet(conn)
    run.cmd_derive(conn, "ggr2026", T26, None)
    run.cmd_editions(conn, "ggr2026", as_of=T26, since=T26 - 5 * 86400)
    assert [r[0] for r in rows(conn, "select race_day from edition_day where race_key='ggr2026' order by race_day")] == [5, 6, 7, 8, 9, 10]
    conn.execute("delete from edition_day where race_key='ggr2026' and race_day >= 8")
    conn.commit()
    run.cmd_editions(conn, "ggr2026", as_of=T26)                                              # the largest day stored is 7: days 8, 9 and 10 come back
    assert [r[0] for r in rows(conn, "select race_day from edition_day where race_key='ggr2026' order by race_day")] == [5, 6, 7, 8, 9, 10]

def test_editions_check_says_nought_on_healthy_rows_and_names_a_boat_whose_figure_moved(conn, capsys):
    """The standing cross-check of the design's §4, and the only test of its accuracy: rows just written by cmd_editions must
    read nought — anything else means the rows and the live pages disagree, or the check cries wolf. A mismatch is not always a
    fault, so the line makes the reason readable: boat_stat takes the latest fix up to 20 minutes after the report, the page's
    own rows the fix NEAREST it, and a fast tracker gives both, so both fix times are printed."""
    from ggrstats import run
    seed_2026_fleet(conn)
    run.cmd_derive(conn, "ggr2026", T26, None)
    run.cmd_editions(conn, "ggr2026", as_of=T26)
    bad = run.cmd_editions_check(conn, "ggr2026")
    lines = capsys.readouterr().out.strip().splitlines()
    assert bad == 0 and lines == ["mismatches: 0"]                                            # every stored distance and run agrees
    conn.execute("update edition_boat_day set togo_nm = togo_nm + 5 where race_key='ggr2026' and team_id=6 and fresh")
    conn.commit()
    assert run.cmd_editions_check(conn, "ggr2026") == 1
    out = capsys.readouterr().out
    assert "distance to finish" in out and "against" in out                                   # the two fix times, side by side

def test_editions_check_says_once_that_a_day_was_never_derived_and_does_not_count_it(conn, capsys):
    """A day derive has never published is not a mismatch: there is nothing to read the rows against. It is said once, as a
    line, and stays out of the number — which the CLI hands to sys.exit, where a long stretch of them would wrap at 255."""
    from ggrstats import db, run
    seed_2026_fleet(conn)
    run.cmd_derive(conn, "ggr2026", T26, None)
    run.cmd_editions(conn, "ggr2026", as_of=T26, since=T26 - 86400)
    conn.execute("delete from boat_stat where race_key='ggr2026' and as_of=%s", (db.ts(T26 - 86400),))
    conn.commit()
    assert run.cmd_editions_check(conn, "ggr2026") == 0
    lines = capsys.readouterr().out.strip().splitlines()
    assert len([l for l in lines if "no derived report" in l]) == 1                           # one line for the day, not one per boat
    assert lines[-1] == "mismatches: 0"

# ---------------------------------------------------------------- import-edition-wind

class FakeArchive:
    """Stands in for weather.fetch_archive_wind: records every batch it is handed and answers one row per point."""
    def __init__(self, fail_from=None):
        self.calls, self.fail_from = [], fail_from
    def __call__(self, points, session=None, model="ecmwf_ifs", batch=20):
        from ggrstats import weather
        self.calls.append(list(points))
        assert len({datetime.fromtimestamp(p["slot_at"], timezone.utc).date() for p in points}) == 1   # one call is one UTC date
        assert 0 < len(points) <= batch
        if self.fail_from is not None and len(self.calls) >= self.fail_from:
            raise weather.RetryableWeatherError("the archive said no")
        return [{"team_id": p["team_id"], "slot_at": p["slot_at"], "wind_kt": 11.0, "wind_dir_deg": 200.0, "model": model} for p in points]

def import_2018(conn, tmp_path):
    from ggrstats import run
    seed_2026_course(conn)
    run.cmd_import_edition(conn, "ggr2018", from_dir=folder(tmp_path, "ggr2018"))

def test_wind_is_fetched_batch_by_batch_at_the_slots_the_legs_use(conn, tmp_path, monkeypatch):
    """Each batch is stored before the next is asked for (weather.fetch_archive_wind is all-or-nothing), only at slots that END a
    leg — a slot with no predecessor can end none — and only up to --until-day: the free allowance is counted per location per day."""
    from ggrstats import course, db, editions, editions_data, run, weather
    import_2018(conn, tmp_path)
    fake = FakeArchive()
    monkeypatch.setattr(weather, "fetch_archive_wind", fake)
    stored = run.cmd_import_edition_wind(conn, "ggr2018", pace_s=0.0, until_day=4, batch=20)
    assert stored == conn.execute("select count(*) from edition_wind where race_key='ggr2018'").fetchone()[0] > 0
    assert len(fake.calls) >= 2 and all(len(c) <= 20 for c in fake.calls)
    start = editions_data.EDITIONS["ggr2018"]["start"]
    line = course.Line(conn.execute("select raw_setup from race where key='ggr2026'").fetchone()[0]["course"]["nodes"])
    ends, fixes = db.team_ends(conn, "ggr2018"), db.load_fixes(conn, "ggr2018")
    want = set()
    for tid, fx in fixes.items():
        slots = editions.past_slots(fx, start, ends[tid]["ended_at"], line)
        want |= {(tid, editions.slot_time(k)) for k in slots if k - 1 in slots and editions.race_day_of(editions.slot_time(k), start) <= 4}
    got = {(tid, int(at)) for tid, at in conn.execute("select team_id, extract(epoch from slot_at)::bigint from edition_wind where race_key='ggr2018'")}
    assert got == want and got
    n = len(fake.calls)
    assert run.cmd_import_edition_wind(conn, "ggr2018", pace_s=0.0, until_day=4) == 0         # nothing missing: no call at all
    assert len(fake.calls) == n

def test_the_three_hourly_week_of_2018_gets_wind_at_the_filled_slots(conn, tmp_path, monkeypatch):
    """Without the filled slots that week has no wind leg at all: the fleet reported at 03:00, 06:00, 09:00 … and the 4-hour
    grid asks for 04:00, 08:00, 16:00 and 20:00."""
    from ggrstats import run, weather
    import_2018(conn, tmp_path)
    monkeypatch.setattr(weather, "fetch_archive_wind", FakeArchive())
    run.cmd_import_edition_wind(conn, "ggr2018", pace_s=0.0, until_day=9)
    hours = {int(at) % 86400 // 3600 for at, in conn.execute("""select extract(epoch from slot_at)::bigint from edition_wind
             where race_key='ggr2018' and slot_at >= '2018-07-04T12:00:00Z' and slot_at <= '2018-07-09T06:00:00Z'""")}
    assert {4, 8, 16, 20} <= hours, hours                                                     # off the three-hour rhythm: filled slots

def test_a_walled_archive_keeps_what_it_stored_waits_and_stops_cleanly(conn, tmp_path, monkeypatch):
    """Amendment 19: 60 s after the first consecutive failure, 300 s after the second, the SAME batch each time; after
    max_failures the run stops normally and the next one asks only for what is still missing."""
    from ggrstats import run, weather
    import_2018(conn, tmp_path)
    fake, slept = FakeArchive(fail_from=3), []
    monkeypatch.setattr(weather, "fetch_archive_wind", fake)
    stored = run.cmd_import_edition_wind(conn, "ggr2018", pace_s=0.0, until_day=4, batch=20, sleep=slept.append)
    assert stored == sum(len(c) for c in fake.calls[:2]) > 0
    assert stored == conn.execute("select count(*) from edition_wind where race_key='ggr2018'").fetchone()[0]
    assert [s for s in slept if s] == [60, 300]
    assert len(fake.calls) == 5 and fake.calls[2] == fake.calls[3] == fake.calls[4]           # the same batch, three times
    again = FakeArchive()
    monkeypatch.setattr(weather, "fetch_archive_wind", again)
    run.cmd_import_edition_wind(conn, "ggr2018", pace_s=0.0, until_day=4, batch=20, sleep=slept.append)
    assert again.calls[0] == fake.calls[2]                                                    # it resumes at the batch that was refused
    assert conn.execute("select count(*) from edition_wind where race_key='ggr2018' and wind_kt is null").fetchone()[0] == 0

def test_an_error_that_is_not_the_archives_wall_is_not_swallowed(conn, tmp_path, monkeypatch):
    from ggrstats import run, weather
    import_2018(conn, tmp_path)
    def boom(points, session=None, model="ecmwf_ifs", batch=20):
        raise ValueError("a programming error")
    monkeypatch.setattr(weather, "fetch_archive_wind", boom)
    with pytest.raises(ValueError):
        run.cmd_import_edition_wind(conn, "ggr2018", pace_s=0.0, until_day=2)

# ---------------------------------------------------------------- the two alarms that guard the swept-bearing measure

def test_the_live_fleet_entering_a_corners_wedge_is_warned_about(conn, caplog, monkeypatch):
    """This year's figures are YB's own and the site is checked against them to 0.07 nm, so a live fix inside a corner's wedge
    would be smoothed into a disagreement with the answer key — which is exactly why the general form of this rule was refused.
    NOR C.1.3 holds the fleet out at Trindade by requiring the island to be left to port, but the NOR forces the side AT the
    island, not on the approach: a boat 24.6 nm east of the line abeam node 85 is already inside. Today the master fixture clears
    the wedge by 5.35 deg of bearing and NOTHING ELSE WOULD NOTICE if that changed, so run._wedge_watch counts it on every derive.
    Here the fleet is moved bodily into the wedge to prove the alarm is wired, then left where it is to prove it stays quiet."""
    import logging
    from ggrstats import course, editions_data, run
    seed_2026_fleet(conn)
    nodes = json.load(open(FIX / "RaceSetup.20260916.json"))["course"]["nodes"]
    line, apex = course.Line(nodes), nodes[88]
    called = []
    real = run._wedge_watch
    monkeypatch.setattr(run, "_wedge_watch", lambda l, r, f: called.append(r) or real(l, r, f))
    with caplog.at_level(logging.WARNING, logger="ggrstats"):
        assert run.cmd_editions(conn, "ggr2026", as_of=T26)["days"]
    assert called == ["ggr2026"]                                                   # the live derive really does count, every time
    assert not [r for r in caplog.records if "wedge" in r.message], caplog.text     # and the real fleet is outside it
    monkeypatch.undo()

    inside = {1: [{"at": T26, "lat": apex["lat"] + 3.0, "lon": apex["lon"] + 6.0, "dtf": 21000 * 1852}]}
    assert line.adjusts(inside[1][0]["lat"], inside[1][0]["lon"], 88)              # the position really is in the wedge
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="ggrstats"):
        assert run._wedge_watch(line, "ggr2026", inside) == 1
    assert "wedge" in caplog.text and "Trindade" in caplog.text

def test_a_corner_that_has_dropped_out_of_the_course_warns_this_year_and_refuses_a_past_race(conn, caplog, monkeypatch, tmp_path):
    """The line is built from race.raw_setup as the capture worker last stored it, and YB EDITS that structure mid-race — it added
    a whole Chichester tag on 18 Sep 2026. course._corner returns None rather than raising when a node has moved, so that a course
    change can never take the hourly capture down; without this alarm Van Den Heede's 1,173 nm leap would be back on a public page
    with every test green and nothing in the log. The live path warns and carries on; the past-races rebuild refuses outright."""
    import logging
    from ggrstats import course, run
    seed_2026_fleet(conn)
    monkeypatch.setattr(course, "CORNERS", [dict(course.CORNERS[0], turn=-40.0)])   # as if YB had renumbered the nodes
    with caplog.at_level(logging.WARNING, logger="ggrstats"):
        assert run.cmd_editions(conn, "ggr2026", as_of=T26)["days"]                 # this year still derives
    assert "Trindade" in caplog.text and "no longer holds" in caplog.text
    run.cmd_import_edition(conn, "ggr2022", from_dir=folder(tmp_path, "ggr2022"))
    with pytest.raises(RuntimeError, match="no longer holds Trindade"):
        run.cmd_editions(conn, "ggr2022", as_of=None)                               # the past-races page must not publish that
