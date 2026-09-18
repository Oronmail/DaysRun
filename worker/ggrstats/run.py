# worker/ggrstats/run.py
"""CLI. Every command is idempotent; `all` is what the timers run."""
import argparse, gzip, json, logging, sys, time
from datetime import datetime, timezone
import requests
from . import backfill, backup, config, db, decode, events, monitoring, perf, stats, weather, yb
from .grid import SLOT_S

log = logging.getLogger("ggrstats")

def parse_iso(s):
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())

def latest_slot(now=None):
    now = int(now if now is not None else time.time())
    return (now // SLOT_S) * SLOT_S

def cmd_capture(conn, race):
    snap = yb.snapshot(race, config.SNAPDIR)
    setup = json.loads(snap["RaceSetup"][0])
    db.upsert_race(conn, race, setup)
    db.upsert_teams(conn, race, setup)
    new = db.insert_fixes(conn, race, decode.decode(snap["AllPositions3"][0]))
    db.insert_leaderboard(conn, race, int(time.time()), json.loads(snap["leaderboard"][0]))
    db.upsert_splits(conn, race, json.loads(snap["zegments"][0]))
    conn.commit()
    log.info("capture: %d new fixes", new)
    # The runner has no disk of its own: keep the raw snapshots in Supabase Storage. The three JSON endpoints every run;
    # the binary track only on the 0000 UTC run (the database already holds every decoded fix).
    paths = [p for name, (_, p) in snap.items() if name != "AllPositions3" or datetime.now(timezone.utc).hour == 0]
    try:
        log.info("backup: %d snapshot files uploaded", backup.upload_files(paths))
    except Exception as e:                       # a backup failure must not stop the derive
        log.warning("backup failed: %s", e)
        monitoring.warn("the raw-snapshot backup failed", reason=type(e).__name__)
    return new

class SanityError(RuntimeError):
    """A snapshot that broke an invariant (stats.sanity_problems). Nothing was written."""

def cmd_derive(conn, race, as_of, fixes=None):
    """fixes: pass the result of db.load_fixes when deriving many slots in one run, so the track is read once, not per slot."""
    setup = conn.execute("select raw_setup from race where key=%s", (race,)).fetchone()[0]
    fixes = fixes if fixes is not None else db.load_fixes(conn, race)
    snapshot = stats.compute_snapshot(setup, fixes, as_of, db.load_conditions(conn, race))
    if stats.unreported(snapshot):                   # before the first fix, or YB has not published this report yet
        log.info("derive %s: no boat has reported for this slot yet, skipped (a later run catches up)", datetime.fromtimestamp(as_of, timezone.utc))
        return snapshot
    previous = db.previous_boat_stats(conn, race, as_of)
    if not stats.ready_to_publish(snapshot, {p["team_id"] for p in previous if not p["stale"]}, time.time() - as_of):
        log.info("derive %s: part of the fleet has not reported yet, waiting for the next run (12 minutes at most)", datetime.fromtimestamp(as_of, timezone.utc))
        return snapshot
    problems = stats.sanity_problems(snapshot, previous, setup["course"]["distance"] / 1.852)
    if problems:                                      # never published over the last good snapshot; the failed run is what raises the alarm
        raise SanityError(f"snapshot {datetime.fromtimestamp(as_of, timezone.utc):%Y-%m-%d %H:%M} refused: " + "; ".join(problems))
    winds = db.load_winds(conn, race)                 # small; read each time so the pass after the weather call sees it
    start_at = min(t["start"] for t in setup["tags"])
    for b in snapshot["boats"]:
        t0 = b["restart"]["first_out_at"] if b["restart"] else 0
        b["perf"] = perf.compute(fixes[b["id"]], start_at, t0, as_of, winds.get(b["id"], {}))
    db.replace_snapshot(conn, race, as_of, snapshot)
    cond = db.conditions_for_report(conn, race, as_of)   # nearest row per boat within 20 min: a tracker reports at 12:00:14, not 12:00:00
    n = db.insert_events(conn, race, events.derive(snapshot, previous, cond))
    conn.commit()
    log.info("derive %s: %d boats, %d new events", datetime.fromtimestamp(as_of, timezone.utc), len(snapshot["boats"]), n)
    return snapshot

def cmd_weather(conn, race, as_of):
    """Model conditions for every boat of one report that has none yet (its own fix: see db.missing_weather_points)."""
    pts = db.missing_weather_points(conn, race, as_of=as_of)
    if pts:
        db.insert_conditions(conn, race, weather.fetch_conditions(pts))
        conn.commit()
    log.info("weather: %d points fetched", len(pts))

def cmd_weather_sweep(conn, race, since, until, pace_s=4, limit=None):
    """Fill the holes of older reports: every (boat, fix) pair since `since` without a row, one call per UTC day, `pace_s`
    between calls (2 requests of up to 16 x 6 points each: well under Open-Meteo's 600 weighted calls a minute). Inserts only;
    a row that exists is never touched. Returns the number of points fetched. Used by `all` for the last days (a fix that
    reached YB late gets its wind) and by `weather --since` for a one-off fill of history."""
    pts = db.missing_weather_points(conn, race, since=since, until=until, limit=limit)
    days = {}
    for p in pts:
        days.setdefault(datetime.fromtimestamp(p["fix_at"], timezone.utc).date(), []).append(p)
    for i, (day, group) in enumerate(sorted(days.items())):
        if i: time.sleep(pace_s)
        db.insert_conditions(conn, race, weather.fetch_conditions(group))
        conn.commit()
        log.info("weather sweep %s: %d points fetched", day, len(group))
    return len(pts)

def safe_weather(conn, race, as_of):
    """Open-Meteo is a free service with per-minute, hourly and daily limits (HTTP 429). The statistics never wait for it:
    a failed weather call is logged and the next run fills the gap (cmd_weather only fetches what is missing)."""
    try:
        cmd_weather(conn, race, as_of)
        return True
    except Exception as e:
        conn.rollback()
        log.warning("weather failed for %s: %s", datetime.fromtimestamp(as_of, timezone.utc), e)
        monitoring.warn("the weather call failed", reason=type(e).__name__)
        return False

def cmd_revalidate():
    if not config.REVALIDATE_URL:
        log.info("revalidate: no REVALIDATE_URL set, skipping")
        return
    r = requests.post(config.REVALIDATE_URL, headers={"x-revalidate-secret": config.REVALIDATE_SECRET}, timeout=30)
    log.info("revalidate: HTTP %s", r.status_code)

# Where the 2026-09-16 audit (an independent recomputation of every figure) corrected golden.snap.json, verify checks the
# audited value instead, so that a healthy system prints `mismatches: 0`. Only valid for --as-of 2026-09-16T00:00:00Z.
AUDIT_T = 1789516800
AUDITED_BEST24 = {3: 150}                       # N3: Guido's 156 nm window bridged a missed report
AUDITED_VS_VDH_DAYS = {17: -0.50, 16: -0.52, 13: -0.62, 4: -0.69, 3: -0.84, 5: -0.88, 2: -0.93, 11: -1.46, 12: -1.49, 14: -1.56,
                       1: -1.80, 15: -1.97, 8: -3.52, 9: -3.74}   # N4: the time rule; boats 6 and 10 are ahead (positive)

def cmd_verify(conn, race, as_of, golden_path):
    """Recompute the snapshot at as_of from the database and print it beside the golden values."""
    setup = conn.execute("select raw_setup from race where key=%s", (race,)).fetchone()[0]
    snapshot = stats.compute_snapshot(setup, db.load_fixes(conn, race), as_of)
    golden = {b["id"]: b for b in json.load(open(golden_path))["boats"]}
    bad = 0
    for b in snapshot["boats"]:
        g = golden.get(b["id"])
        if not g: continue
        checks = [("rank", b["rank"], g["rank"]), ("dtf", round(b["dtf_nm"]), round(g["dtf"])), ("gap", b["gap_nm"], g["gap"]),
                  ("run24", round(b["w24"]["dist_nm"]) if b["w24"] else None, g["run24"]), ("best24", round(b["best24_nm"]), g["best24"]),
                  ("best4", round(b["best4_kn"], 1), g["best4"]), ("vs_vdh_d", round(b["vs_vdh_days"], 1), round(g["vdh_days"], 1))]
        for name, got, want in checks:
            source, same = "golden", got == want
            if as_of == AUDIT_T and name == "best24" and b["id"] in AUDITED_BEST24:
                source, want = "audited", AUDITED_BEST24[b["id"]]; same = got == want
            elif as_of == AUDIT_T and name == "vs_vdh_d":
                source = "audited"
                if b["id"] in AUDITED_VS_VDH_DAYS:
                    want = AUDITED_VS_VDH_DAYS[b["id"]]; same = abs(b["vs_vdh_days"] - want) < 0.15
                else:
                    want = "> 0"; same = b["vs_vdh_days"] > 0
            flag = "" if same else "   <-- MISMATCH"
            if flag: bad += 1
            print(f"{b['first']:<8} {name:<9} got {got!s:>8}  {source} {want!s:>8}{flag}")
    print("mismatches:", bad)
    return bad

def main(argv=None):
    ap = argparse.ArgumentParser(prog="ggrstats")
    ap.add_argument("command", choices=["capture", "derive", "weather", "revalidate", "all", "backfill", "verify", "alarm-test"])
    ap.add_argument("--as-of", help="ISO UTC time; default = the latest 4-hour slot")
    ap.add_argument("--race", default=config.RACE_KEY)
    ap.add_argument("--master", help="backfill: path to AllPositions3.master.json.gz")
    ap.add_argument("--snapshots", help="backfill: directory of <endpoint>.<stamp>.gz files")
    ap.add_argument("--since", help="backfill/derive: derive every slot from this ISO time; weather: fill every missing (boat, fix) pair from this ISO time, paced")
    ap.add_argument("--golden", default="tests/fixtures/golden.snap.json")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    as_of = parse_iso(a.as_of) if a.as_of else latest_slot()
    monitoring.init()
    if a.command == "alarm-test":                    # proves the alarm end to end: this must arrive as an e-mail
        raise RuntimeError("Day's Run alarm test: this error was raised on purpose. Nothing is wrong.")
    if a.command == "revalidate":
        return cmd_revalidate()
    conn = db.connect()
    try:
        if a.command == "capture":
            cmd_capture(conn, a.race)
        elif a.command == "derive":
            slots = backfill.slots_between(parse_iso(a.since), as_of) if a.since else [as_of]
            fixes = db.load_fixes(conn, a.race)
            for t in slots:
                cmd_derive(conn, a.race, t, fixes)
        elif a.command == "weather":
            if a.since:
                print(f"points fetched: {cmd_weather_sweep(conn, a.race, parse_iso(a.since), as_of)}")
            else:
                cmd_weather(conn, a.race, as_of)
        elif a.command == "all":
            with monitoring.checkin("worker-all"):       # a run that never starts, or fails twice running, is noticed
                cmd_capture(conn, a.race)
                last = conn.execute("select extract(epoch from max(as_of))::bigint from fleet_stat where race_key=%s", (a.race,)).fetchone()[0]
                slots = backfill.slots_between(last, as_of) if last and last < as_of else [as_of]   # catch up any slot a delayed run skipped
                if last:
                    safe_weather(conn, a.race, last)     # retry a weather call that failed last run; makes no request when nothing is missing
                fixes = db.load_fixes(conn, a.race)
                for t in slots:
                    cmd_derive(conn, a.race, t, fixes)
                    if safe_weather(conn, a.race, t):
                        cmd_derive(conn, a.race, t, fixes)   # second pass so gale events see the weather
                try:                                          # a fix that reached YB late, or a call that failed days ago: swept, bounded, never fatal
                    cmd_weather_sweep(conn, a.race, since=as_of - 3 * 86400, until=as_of, limit=48)
                except Exception as e:
                    conn.rollback(); log.warning("weather sweep failed: %s", e); monitoring.warn("the weather sweep failed", reason=type(e).__name__)
                cmd_revalidate()
        elif a.command == "backfill":
            setup_path = sorted(__import__("pathlib").Path(a.snapshots).glob("RaceSetup.*.gz"))[-1]
            setup = json.load(gzip.open(setup_path))
            db.upsert_race(conn, a.race, setup); db.upsert_teams(conn, a.race, setup); conn.commit()
            print(backfill.import_archive(conn, a.race, a.master, a.snapshots))
            fixes = db.load_fixes(conn, a.race)
            for t in backfill.slots_between(parse_iso(a.since) if a.since else config.START_AT, as_of):
                cmd_derive(conn, a.race, t, fixes)
                if safe_weather(conn, a.race, t):
                    time.sleep(4)                    # 2 calls x 16 boats per slot: stay under Open-Meteo's 600 weighted calls a minute
        elif a.command == "verify":
            return cmd_verify(conn, a.race, as_of, a.golden)
    finally:
        conn.close()

if __name__ == "__main__":
    sys.exit(main())
