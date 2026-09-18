# worker/tests/test_wind_rows.py — which (boat, fix) pairs the weather call asks for, and which stored row a report reads.
# Written after the investigation of 17–18 Sep 2026 found 53 holes made by the old "already fetched" test, duplicate rows in one
# report hour from a fast tracker, and a gale lookup that only matched a fix on the exact second.
import os, pytest
from datetime import datetime, timezone
from test_db import conn, URL          # the local-Postgres fixture; it refuses any Supabase address and truncates every table
pytestmark = pytest.mark.skipif(not URL, reason="set DATABASE_URL_TEST to run")

H = 3600
T = 1789560000                                       # 2026-09-17 12:00:00 UTC, a report hour
def at(s): return datetime.fromtimestamp(s, timezone.utc)

def seed(conn, stats, rows):
    """stats: (team_id, as_of, last_fix_at, stale, lat, lon); rows: conditions (team_id, fix_at, wind_kn)."""
    conn.execute("insert into race (key, start_at) values ('r', %s)", (at(T - 10 * 86400),))
    for tid in {s[0] for s in stats} | {r[0] for r in rows}:
        conn.execute("insert into team (race_key, id, name) values ('r', %s, %s)", (tid, f"Boat {tid}"))
    for tid, as_of, fix, stale, lat, lon in stats:
        conn.execute("insert into boat_stat (race_key, team_id, as_of, last_fix_at, stale, lat, lon) values ('r', %s, %s, %s, %s, %s, %s)", (tid, at(as_of), at(fix), stale, lat, lon))
    for tid, fix, w in rows:
        conn.execute("insert into conditions (race_key, team_id, fix_at, wind_kn, gust_kn, wind_dir_deg, fetched_at) values ('r', %s, %s, %s, %s, 200, now())", (tid, at(fix), w, w + 5))
    conn.commit()

def test_a_silent_boat_does_not_hide_the_boats_that_share_its_fix_second(conn):
    """Boat 9 went silent at 08:00:00 and has its row. Boat 2 reported at 12:00:00 and also holds a row for 08:00:00 (its own
    fix then). The old test asked "does boat 2 hold a row at ANY boat's last fix time?" and answered yes: boat 2 was never fetched."""
    from ggrstats import db
    seed(conn, [(9, T, T - 4 * H, True, 28.0, -14.0), (2, T, T, False, 29.0, -15.0), (6, T, T, False, 30.0, -16.0)],
               [(9, T - 4 * H, 12.0), (2, T - 4 * H, 14.0), (6, T, 16.0)])
    pts = db.missing_weather_points(conn, "r", as_of=T)
    assert [(p["team_id"], p["fix_at"]) for p in pts] == [(2, T)]                      # boat 2 is missing; 9 has its row, 6 has its row
    assert pts[0]["lat"] == 29.0 and pts[0]["lon"] == -15.0

def test_the_sweep_finds_holes_in_older_reports_oldest_first_and_bounded(conn):
    from ggrstats import db
    seed(conn, [(2, T - 8 * H, T - 8 * H, False, 1, 1), (2, T - 4 * H, T - 4 * H, False, 2, 2), (2, T, T, False, 3, 3),
                (6, T - 4 * H, T - 4 * H, False, 4, 4), (6, T, T, False, 5, 5)],
               [(2, T, 10.0)])
    pts = db.missing_weather_points(conn, "r", since=T - 9 * H, until=T)
    assert [(p["team_id"], p["fix_at"]) for p in pts] == [(2, T - 8 * H), (2, T - 4 * H), (6, T - 4 * H), (6, T)]
    assert [(p["team_id"], p["fix_at"]) for p in db.missing_weather_points(conn, "r", since=T - 9 * H, until=T, limit=2)] == [(2, T - 8 * H), (2, T - 4 * H)]
    assert db.missing_weather_points(conn, "r", since=T - 5 * H, until=T - 4 * H) and all(p["fix_at"] == T - 4 * H for p in db.missing_weather_points(conn, "r", since=T - 5 * H, until=T - 4 * H))

def test_a_stale_boat_is_counted_once_however_many_reports_it_stays_silent(conn):
    from ggrstats import db
    seed(conn, [(9, T - 4 * H, T - 8 * H, True, 1, 1), (9, T, T - 8 * H, True, 1, 1)], [])
    assert [(p["team_id"], p["fix_at"]) for p in db.missing_weather_points(conn, "r", since=T - 9 * H, until=T)] == [(9, T - 8 * H)]

def test_load_winds_takes_the_row_nearest_the_report_hour(conn):
    """A fast tracker near a mark gave Andrea rows at 23:00:03 and 00:02:59; both round to the 00:00 report. The leg ending at the
    00:02:59 fix must read that row, whatever order the table returns them in."""
    from ggrstats import db
    from ggrstats.grid import slot_time, slot_of
    seed(conn, [], [(16, T + 179, 10.3), (16, T - 60 * 60 + 3, 11.0), (16, T - 4 * H + 5, 9.0)])   # the nearest row first: a "last row wins" bug would read 11.0
    winds = db.load_winds(conn, "r")
    assert winds[16][slot_time(slot_of(T))] == (10.3, 200)
    assert winds[16][slot_time(slot_of(T - 4 * H))] == (9.0, 200)

def test_the_gale_lookup_tolerates_the_fix_second_but_not_another_report(conn):
    from ggrstats import db
    seed(conn, [], [(3, T + 14, 36.0), (4, T - 19 * 60, 40.0), (5, T - 2 * H, 50.0), (6, T - 4 * H, 45.0)])
    rows = {r["team_id"]: r["wind_kn"] for r in db.conditions_for_report(conn, "r", T)}
    assert rows == {3: 36.0, 4: 40.0}                                                  # 14 s and 19 min off count; 2 h and 4 h do not

def test_cmd_weather_asks_only_for_what_is_missing_and_stores_it(conn, monkeypatch):
    from ggrstats import db, run, weather
    seed(conn, [(9, T, T - 4 * H, True, 28.0, -14.0), (2, T, T, False, 29.0, -15.0), (6, T, T, False, 30.0, -16.0)],
               [(9, T - 4 * H, 12.0), (2, T - 4 * H, 14.0)])
    asked = []
    def fake(points, session=None, now=None):
        asked.append([(p["team_id"], p["fix_at"]) for p in points])
        return [dict(team_id=p["team_id"], fix_at=p["fix_at"], lat=p["lat"], lon=p["lon"], wind_kn=20.0, gust_kn=25.0, wind_dir_deg=270.0, mslp_hpa=1015.0,
                     wave_m=2.0, swell_m=1.5, swell_period_s=9.0, current_kn=0.2, current_dir_deg=90.0, sst_c=24.0, fetched_at=T + 300) for p in points]
    monkeypatch.setattr(weather, "fetch_conditions", fake)
    run.cmd_weather(conn, "r", T)
    assert asked == [[(2, T), (6, T)]]
    run.cmd_weather(conn, "r", T)
    assert asked == [[(2, T), (6, T)]]                                                 # nothing left to ask for: no request
    assert conn.execute("select count(*) from conditions where race_key='r' and fix_at=%s", (at(T),)).fetchone()[0] == 2

def test_the_sweep_command_groups_the_holes_by_day_and_paces_itself(conn, monkeypatch):
    from ggrstats import db, run, weather
    seed(conn, [(2, T - 30 * H, T - 30 * H, False, 1, 1), (2, T - 26 * H, T - 26 * H, False, 1, 1), (2, T - 4 * H, T - 4 * H, False, 1, 1), (2, T, T, False, 1, 1)],
               [(2, T, 10.0)])
    asked, slept = [], []
    def fake(points, session=None, now=None):
        asked.append([p["fix_at"] for p in points])
        return [dict(team_id=p["team_id"], fix_at=p["fix_at"], lat=p["lat"], lon=p["lon"], wind_kn=20.0, gust_kn=25.0, wind_dir_deg=270.0, mslp_hpa=1015.0,
                     wave_m=2.0, swell_m=1.5, swell_period_s=9.0, current_kn=0.2, current_dir_deg=90.0, sst_c=24.0, fetched_at=T + 300) for p in points]
    monkeypatch.setattr(weather, "fetch_conditions", fake)
    monkeypatch.setattr(run.time, "sleep", lambda s: slept.append(s))
    n = run.cmd_weather_sweep(conn, "r", since=T - 40 * H, until=T, pace_s=4)
    assert n == 3 and asked == [[T - 30 * H, T - 26 * H], [T - 4 * H]] and slept == [4]   # 16 Sep's two holes in one call, 17 Sep's in another, one pause between the two calls
    assert run.cmd_weather_sweep(conn, "r", since=T - 40 * H, until=T, pace_s=4) == 0 and len(asked) == 2
