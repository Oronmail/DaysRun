# worker/ggrstats/run.py
"""CLI. Every command is idempotent; `all` is what the timers run."""
import argparse, gzip, json, logging, pathlib, sys, time
from datetime import datetime, timezone
import requests
from . import backfill, backup, config, db, decode, events, monitoring, perf, stats, weather, yb
from .grid import SLOT_S, slot_time

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
    start_at = config.race_start(setup)
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

# ---------------------------------------------------------------- the Past races page: its own tables, and nothing else
#
# editions and editions_data are imported inside the commands below, never at the top of this module: an error raised while
# IMPORTING them would happen before main() runs, and the live capture and derive — which need neither — would never start at
# all. Inside a command the same error is caught by the try around it in `all`, and the site goes on publishing.

IMPORT_ENDPOINTS = ("RaceSetup", "zegments", "AllPositions3")    # an import reads no leaderboard, and YB served 2018's as a 503
WIND_WAIT_S = (60, 300)                                          # the archive refused once, twice: wait, ask again, then stop and resume later

def _measure(conn, race):
    """THIS race's own course length in nm, which is what its own fleet's miles made good are counted against. Every fleet keeps
    YB's own distance to finish, so each is measured on the course it actually sailed and no fleet needs another year's RaceSetup:
    25,754.5 (2026), 26,003.0 (2022), 25,099.9 (2018) nm. The three differ by 903 nm and the page says so in words, rather than
    projecting two fleets onto a third's course line to hide it — a projection that could not deliver what it promised.

    `course.distance` is YB's own course sum in km, and course.Line reproduces it to a tenth of a mile; taking it straight from
    the stored RaceSetup means the page's denominator is YB's figure, not a sum of ours. No course LINE is built for any fleet:
    where YB's record gives a fix no distance at all the page shows the position and leaves every figure counted off a distance
    blank, rather than reading a measure of ours beside YB's own in the same fleet row."""
    row = conn.execute("select raw_setup from race where key=%s", (race,)).fetchone()
    if not row:
        raise RuntimeError(f"the {race} race row is missing: import or capture that race before computing its days")
    return row[0]["course"]["distance"] / 1.852

def cmd_import_edition(conn, race, from_dir=None):
    """A past race into the database, once: RaceSetup, the split times and every fix from YB's own endpoints, or from a folder
    holding the same three files (--from-dir, for the day YB's archive goes away again). The curated rows of editions_data are
    written over YB's team strings, and only the boats that started take a row or a fix. Inserts only, so a second run writes
    nothing twice. Returns the number of NEW fixes."""
    from . import editions_data
    if from_dir:
        d = pathlib.Path(from_dir)
        setup, zeg = json.loads((d / "RaceSetup").read_text()), json.loads((d / "zegments").read_text())
        teams = json.loads((d / "AllPositions3.json").read_text()) if (d / "AllPositions3.json").exists() else decode.decode((d / "AllPositions3").read_bytes())
        paths = []
    else:
        snap = yb.snapshot(race, config.SNAPDIR, names=IMPORT_ENDPOINTS)     # keeps a timestamped copy on disk, as the live capture does
        setup, zeg = json.loads(snap["RaceSetup"][0]), json.loads(snap["zegments"][0])
        teams = decode.decode(snap["AllPositions3"][0])
        paths = [p for _, p in snap.values()]
    ed, fleet = editions_data.EDITIONS[race], editions_data.TEAMS[race]
    keep = {r["id"] for r in fleet} - ed["skip"]                             # the replays, and a sailor who never crossed the line
    db.upsert_race(conn, race, setup, start_at=ed["start"])                  # the raw setup exactly as received; the start is the curated one
    db.upsert_past_teams(conn, race, [dict(r, start_at=ed["start"]) for r in fleet])
    n = db.insert_fixes(conn, race, [t for t in teams if t["id"] in keep])
    db.upsert_splits(conn, race, zeg)
    conn.commit()
    if paths:
        try:
            log.info("backup: %d raw files uploaded", backup.upload_files(paths, race=race))
        except Exception as e:                                               # a backup failure must not undo an import
            log.warning("backup failed: %s", e)
            monitoring.warn("the raw-snapshot backup failed", reason=type(e).__name__)
    log.info("import %s: %d boats, %d new fixes", race, len(fleet), n)
    return n

def cmd_editions(conn, race, as_of, since=None, fixes=None):
    """The three tables of the Past races page for one race. A past race: every day from the gun to the race day of its last
    documented end. This year: the 00:00 report of the day of `as_of` (default the latest slot) — never a day derive has not
    published — or every day since `since`, and by default also the day after the last one stored, so a skipped day heals itself.
    fixes: the track the caller has already read (`all` passes its own). It touches nothing else: no snapshot, no event, no
    weather call, no re-derive."""
    from . import editions, editions_data
    start = editions_data.EDITIONS[race]["start"]
    past = race != config.RACE_KEY
    course_nm = _measure(conn, race)
    fixes = fixes if fixes is not None else db.load_fixes(conn, race)
    ends = db.team_ends(conn, race)                                          # ghosts are not in it; a past race's rows are the curated ones
    if race == config.RACE_KEY:
        winds, now = db.load_winds(conn, race), as_of if as_of else latest_slot()
        last = editions.race_day_of(now - 1, start)                          # the last 00:00 report before this slot
        if now % 86400 == 0 and conn.execute("select 1 from fleet_stat where race_key=%s and as_of=%s", (race, db.ts(now))).fetchone():
            last = editions.race_day_of(now, start)                          # this slot IS a 00:00 report and derive has published it
        stored = conn.execute("select max(race_day) from edition_day where race_key=%s", (race,)).fetchone()[0]
        first = editions.race_day_of(since, start) if since else min(last, (last - 1 if stored is None else stored) + 1)
        days = list(range(max(1, first), last + 1))
        until = editions.day_zero(start) + days[-1] * 86400 if days else None    # nothing later than the page's own clock
    else:
        winds, until = db.load_edition_wind(conn, race), None
        end = max((e["ended_at"] for e in ends.values() if e["ended_at"]), default=None)
        days = list(range(1, editions.race_day_of(end, start) + 1)) if end else []
    if not days:
        log.info("editions %s: no race day to write yet", race)
        return {"days": [], "boat_days": [], "milestones": [], "notes": {}}
    out = editions.compute({tid: fx for tid, fx in fixes.items() if tid in ends}, ends, start, course_nm, days, winds,
                           past, splits=db.load_splits(conn, race), until=until)
    db.replace_edition_days(conn, race, out["days"])
    db.replace_edition_boat_days(conn, race, out["boat_days"])
    db.replace_edition_milestones(conn, race, out["milestones"])             # the whole race's table is the unit of replacement
    conn.commit()
    log.info("editions %s: race days %d to %d, %d boat-days, %d milestones, %s", race, days[0], days[-1], len(out["boat_days"]),
             len(out["milestones"]), out["notes"])
    blank = out["notes"].get("unmeasured_boat_days") or {}
    if blank:                                                                # named, not counted: the page's "Read with care" says who
        named = dict(conn.execute("select id, name from team where race_key=%s and id = any(%s)", (race, list(blank))).fetchall())
        log.warning("editions %s: %d boat-day(s) show a position but no distance to finish, YB's record giving none — %s. Miles made "
                    "good, place and the fleet's leader, middle and last are blank for those reports, and nothing is guessed.", race,
                    sum(blank.values()), ", ".join(f"{named.get(tid, tid)} {n}" for tid, n in sorted(blank.items())))
    return out

def _utc(t):
    return "no fix" if t is None else f"{datetime.fromtimestamp(int(t), timezone.utc):%Y-%m-%d %H:%M}"

def _nm(v):
    return "blank" if v is None else f"{v:.2f} nm"

def cmd_editions_check(conn, race=None):
    """The standing cross-check the design asks for: every stored day of THIS year's race, boat by boat, against the figures the
    live pages show. Two readings, and each can differ for a reason the line it prints makes visible.
    Distance to finish, 0.6 nm: boat_stat takes the latest fix up to 20 minutes AFTER the report (stats.at_or_before), these rows
    the fix NEAREST it (grid.resample), and a fast tracker gives both — so both fix times are printed.
    The day's run, 0.05 nm, and only where all six legs of that report have a distance: a run boat_stat shows across a missing
    report is bridged, which these rows refuse by design; a run left out as impossible is not compared at all.
    Prints one line per mismatch and their number, and returns that number — which the CLI hands to sys.exit, so it counts
    MISMATCHES only: a day derive has never published is said once, as a line, and is not one of them (there is nothing to read
    against, and a long stretch of them would otherwise overflow an exit code)."""
    race, bad = race or config.RACE_KEY, 0
    for day, as_of in conn.execute("select race_day, as_of from edition_day where race_key=%s order by race_day", (race,)).fetchall():
        T = int(as_of.timestamp())
        live = {tid: rest for tid, *rest in conn.execute("""select team_id, dtf_nm, run24_nm, extract(epoch from last_fix_at)::bigint
                                                            from boat_stat where race_key=%s and as_of=%s""", (race, as_of))}
        if not live:
            print(f"day {day:>3}  {_utc(T)}  no derived report: nothing to read these rows against")
            continue
        whole = {tid for tid, n in conn.execute("""select team_id, count(dist_nm) from leg where race_key=%s and end_slot > %s
                                                   and end_slot <= %s group by team_id""", (race, db.ts(T - 86400), as_of)) if n == 6}
        for tid, name, togo, run24, fix_at in conn.execute(
                """select b.team_id, coalesce(t.first_name, t.name), b.togo_nm, b.run24_nm, extract(epoch from b.fix_at)::bigint
                   from edition_boat_day b join team t on t.race_key = b.race_key and t.id = b.team_id
                   where b.race_key=%s and b.race_day=%s and b.fresh order by b.team_id""", (race, day)):
            dtf, run, last_fix = live.get(tid, (None, None, None))
            if togo is not None and (dtf is None or abs(togo - dtf) > 0.6):
                bad += 1
                print(f"day {day:>3}  {name:<9} distance to finish {togo:.2f} nm, boat_stat {_nm(dtf)}   fix {_utc(fix_at)} against {_utc(last_fix)}")
            if run24 is not None and tid in whole and (run is None or abs(run24 - run) > 0.05):
                bad += 1
                print(f"day {day:>3}  {name:<9} day's run {run24:.2f} nm, boat_stat {_nm(run)}")
    print("mismatches:", bad)
    return bad

def cmd_import_edition_wind(conn, race, pace_s=2.0, until_day=None, batch=20, max_failures=3, session=None, sleep=None):
    """Model wind at the end of every 4-hour leg of a past race, from Open-Meteo's archive: at exactly the slots the page's own
    figures are built on (editions.past_slots), and only at a slot that ENDS a leg — a slot with no predecessor ends none, and
    asking for it would spend an allowance that is counted per location per day. past_slots IS prepare's own pipeline for a past
    fleet, so the archive is asked for exactly the slots the page has a leg at and for no other — including the slots YB gave no
    distance to finish, which the page sails and shows the wind of. `until_day` stops at that race day, so the owner can take the
    race a few days at a time. One batch at a time, each stored and committed before the next is asked for, because
    one archive call is all-or-nothing (weather.fetch_archive_wind); `pace_s` between calls. The archive's own wall (429, 5xx, a
    body that is not JSON) is waited out and the SAME batch asked again; after max_failures in a row the run stops cleanly and
    says what is left — it inserts only, so the next run asks for exactly what is still missing. Any other error is a programming
    error and comes straight out. Returns the points stored in this run; `editions` afterwards puts the wind into edition_day."""
    from . import editions, editions_data
    sleep = sleep or time.sleep
    start = editions_data.EDITIONS[race]["start"]
    fixes, ends, points = db.load_fixes(conn, race), db.team_ends(conn, race), {}
    for tid, fx in fixes.items():
        if tid not in ends:
            continue
        slots = editions.past_slots(fx, start, ends[tid]["ended_at"])
        for k, f in slots.items():
            t = slot_time(k)
            if k - 1 in slots and (until_day is None or editions.race_day_of(t, start) <= until_day):
                points[(tid, t)] = {"team_id": tid, "slot_at": t, "lat": f["lat"], "lon": f["lon"]}
    asked = {}
    for tid, t in points:
        asked.setdefault(tid, []).append(t)
    missing = db.missing_edition_wind_slots(conn, race, asked)
    by_day = {}
    for tid, t in missing:
        by_day.setdefault(datetime.fromtimestamp(t, timezone.utc).date(), []).append(points[(tid, t)])
    batches = []                                                             # one call each: one UTC date, at most `batch` points
    for day in sorted(by_day):
        group = sorted(by_day[day], key=lambda p: (p["slot_at"], p["team_id"]))
        batches += [group[i:i + batch] for i in range(0, len(group), batch)]
    session = session or requests.Session()
    stored, fails, walled = 0, 0, False
    for j, chunk in enumerate(batches):
        while True:
            try:
                rows = weather.fetch_archive_wind(chunk, session=session, batch=batch)
                break
            except weather.RetryableWeatherError as e:
                fails += 1
                log.warning("edition wind %s: %s (refusal %d of %d)", datetime.fromtimestamp(chunk[0]["slot_at"], timezone.utc).date(), e, fails, max_failures)
                walled = fails >= max_failures
                if walled:
                    break
                sleep(WIND_WAIT_S[min(fails, len(WIND_WAIT_S)) - 1])          # then the same batch again: nothing of it was stored
        if walled:
            break
        db.insert_edition_wind(conn, race, rows)
        conn.commit()
        stored, fails = stored + len(rows), 0
        if j + 1 < len(batches):
            sleep(pace_s)                                                    # between calls only: no wait after the last batch
    left = len(missing) - stored
    log.info("edition wind %s: %d points stored, %d still missing%s", race, stored, left, " (the archive walled this run)" if walled else "")
    print(f"points stored: {stored}, still missing: {left}")
    return stored

def main(argv=None):
    ap = argparse.ArgumentParser(prog="ggrstats")
    ap.add_argument("command", choices=["capture", "derive", "weather", "revalidate", "all", "backfill", "verify", "alarm-test",
                                        "import-edition", "import-edition-wind", "editions"])
    ap.add_argument("--as-of", help="ISO UTC time; default = the latest 4-hour slot")
    ap.add_argument("--race", default=config.RACE_KEY)
    ap.add_argument("--master", help="backfill: path to AllPositions3.master.json.gz")
    ap.add_argument("--snapshots", help="backfill: directory of <endpoint>.<stamp>.gz files")
    ap.add_argument("--since", help="backfill/derive: derive every slot from this ISO time; weather: fill every missing (boat, fix) pair from this ISO time, paced; editions: write every race day from this ISO time")
    ap.add_argument("--golden", default="tests/fixtures/golden.snap.json")
    ap.add_argument("--from-dir", help="import-edition: a folder holding RaceSetup, zegments and AllPositions3 (YB's binary) or AllPositions3.json")
    ap.add_argument("--until-day", type=int, help="import-edition-wind: go no further than this race day (the archive's free allowance is counted per location per day)")
    ap.add_argument("--pace", type=float, default=2.0, help="import-edition-wind: seconds between archive calls")
    ap.add_argument("--check", action="store_true", help="editions: read this year's stored rows against the live pages' own figures")
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
                try:                                          # the Past races page's rows for this year: its own tables, nothing else
                    cmd_editions(conn, a.race, as_of, fixes=fixes)
                except Exception as e:
                    conn.rollback(); log.warning("editions failed: %s", e); monitoring.warn("the editions rows failed", reason=type(e).__name__)
                cmd_revalidate()
        elif a.command == "backfill":
            setup_path = sorted(pathlib.Path(a.snapshots).glob("RaceSetup.*.gz"))[-1]
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
        elif a.command == "import-edition":
            print(cmd_import_edition(conn, a.race, from_dir=a.from_dir))
        elif a.command == "import-edition-wind":
            cmd_import_edition_wind(conn, a.race, pace_s=a.pace, until_day=a.until_day)
        elif a.command == "editions":
            if a.check:
                return cmd_editions_check(conn, a.race)
            cmd_editions(conn, a.race, as_of, parse_iso(a.since) if a.since else None)
    finally:
        conn.close()

if __name__ == "__main__":
    sys.exit(main())
