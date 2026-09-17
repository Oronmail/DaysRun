# worker/ggrstats/db.py
"""psycopg 3 helpers. Times go in as timestamptz from Unix seconds; JSON in as jsonb."""
import json
from datetime import datetime, timezone
import psycopg
from psycopg.types.json import Jsonb
from . import config, names

def ts(unix):
    return None if unix is None else datetime.fromtimestamp(unix, timezone.utc)

def connect(url=None):
    """TCP keepalives and a connect timeout: without them a connection the network has silently dropped (a laptop on a
    hotspot, a recycled pooler node) leaves the client waiting for a reply for ever instead of failing so the next run retries."""
    return psycopg.connect(url or config.DATABASE_URL, connect_timeout=20,
                           keepalives=1, keepalives_idle=20, keepalives_interval=5, keepalives_count=3)

def upsert_race(conn, key, setup):
    start = min(t["start"] for t in setup["tags"])
    conn.execute("""insert into race (key, title, start_at, course_km, raw_setup, updated_at)
                    values (%s, %s, %s, %s, %s, now())
                    on conflict (key) do update set title=excluded.title, start_at=excluded.start_at,
                    course_km=excluded.course_km, raw_setup=excluded.raw_setup, updated_at=now()""",
                 (key, setup.get("title"), ts(start), setup["course"].get("distance"), Jsonb(setup)))

def upsert_teams(conn, key, setup):
    rows = []
    for t in setup["teams"]:
        tid = t["id"]
        ghost = tid in config.GHOSTS
        rows.append((key, tid, names.FULL.get(tid, t["name"]), names.FIRST.get(tid), t.get("country"),
                     names.COUNTRY_CODE.get(t.get("country") or "", ""), t.get("flag"),
                     names.GHOST_BOAT.get(tid, names.MODEL.get(tid, t.get("model"))), names.YACHT.get(tid, t.get("owner")),
                     names.DESIGN_CLASS.get(tid), str(t.get("sail") or ""), t.get("colour"), ghost,
                     config.GHOSTS.get(tid), t.get("status"), ts(t.get("start"))))
    conn.cursor().executemany("""insert into team (race_key, id, name, first_name, country, country_code, flag, model, yacht,
                    design_class, sail, colour, is_ghost, ghost_label, status, start_at)
                    values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    on conflict (race_key, id) do update set name=excluded.name, first_name=excluded.first_name,
                    country=excluded.country, country_code=excluded.country_code, flag=excluded.flag, model=excluded.model, yacht=excluded.yacht,
                    design_class=excluded.design_class, sail=excluded.sail, colour=excluded.colour, is_ghost=excluded.is_ghost,
                    ghost_label=excluded.ghost_label, status=excluded.status, start_at=excluded.start_at""", rows)

def insert_fixes(conn, key, teams):
    """Insert decoded fixes; existing (team, at) rows are left alone. Returns the number of new rows."""
    rows = [(key, t["id"], ts(m["at"]), m["lat"], m["lon"], m.get("dtf")) for t in teams for m in t["moments"]]
    before = conn.execute("select count(*) from fix where race_key=%s", (key,)).fetchone()[0]
    conn.cursor().executemany("insert into fix (race_key, team_id, at, lat, lon, dtf_m) values (%s,%s,%s,%s,%s,%s) on conflict do nothing", rows)
    after = conn.execute("select count(*) from fix where race_key=%s", (key,)).fetchone()[0]
    return after - before

def load_fixes(conn, key):
    out = {}
    for tid, at, lat, lon, dtf in conn.execute("select team_id, extract(epoch from at)::bigint, lat, lon, dtf_m from fix where race_key=%s order by team_id, at", (key,)):
        out.setdefault(tid, []).append({"at": int(at), "lat": lat, "lon": lon, "dtf": dtf})
    return out

def insert_leaderboard(conn, key, fetched_at, lb):
    rows = []
    for tag in lb.get("tags", []):
        for t in tag["teams"]:
            rows.append((key, ts(fetched_at), t["id"], t.get("rankR"), t.get("rankS"), t.get("dtf"), t.get("dmg"), t.get("d24"),
                         t.get("vmgR"), t.get("vmgS"), ts(t.get("eFinishR")), ts(t.get("eFinishS")), t.get("status"), t.get("old"), Jsonb(t)))
    conn.cursor().executemany("""insert into leaderboard_snap values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing""", rows)

def upsert_splits(conn, key, zeg):
    idx = {c["id"]: c for c in zeg["course"]}
    rows = []
    for tag in zeg["tags"]:
        for t in tag["teams"]:
            for seg in t.get("segments", {}).values():
                c = idx.get(seg["courseNodeId"], {})
                rows.append((key, t["markerNo"], seg["courseNodeId"], c.get("name"), c.get("index"),
                             ts(seg["start"] / 1000), ts(seg["stop"] / 1000), seg["durationTotal"] // 1000,
                             _dur_s(seg.get("deltaBestF")), _dur_s(seg.get("deltaPrecedingF"))))
    conn.cursor().executemany("""insert into split values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    on conflict (race_key, team_id, checkpoint_id) do update set stop_at=excluded.stop_at,
                    duration_s=excluded.duration_s, delta_best_s=excluded.delta_best_s, delta_preceding_s=excluded.delta_preceding_s""", rows)

def _dur_s(text):
    """'1d 6h 18m 42s' -> seconds."""
    if not text: return None
    total, mult = 0, {"d": 86400, "h": 3600, "m": 60, "s": 1}
    for part in text.split():
        total += int(part[:-1]) * mult[part[-1]]
    return total

def replace_snapshot(conn, key, as_of, snap):
    """Write one derived snapshot (see stats.compute_snapshot for the dict shape)."""
    a = ts(as_of)
    # One pipeline: about 50 statements per snapshot travel in a single round trip instead of 50 (each costs 80-150 ms
    # between a GitHub runner or a laptop and the database; re-deriving a whole race would otherwise take hours).
    with conn.pipeline(), conn.cursor() as cur:
        for t in ("restart", "boat_stat", "boat_perf", "duel", "fleet_stat", "record_board", "sprint_result"):   # leg rows are upserted, not replaced
            cur.execute(f"delete from {t} where race_key=%s and as_of=%s", (key, a))
        for b in snap["boats"]:
            if b.get("restart"):
                cur.execute("insert into restart values (%s,%s,%s,%s,%s) on conflict do nothing",
                            (key, b["id"], a, ts(b["restart"]["last_in_port_at"]), ts(b["restart"]["first_out_at"])))
            cur.executemany("""insert into leg values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                               on conflict (race_key, team_id, end_slot) do update set start_at=excluded.start_at, end_at=excluded.end_at,
                               hours=excluded.hours, dist_nm=excluded.dist_nm, made_good_nm=excluded.made_good_nm, speed_kn=excluded.speed_kn,
                               vmg_kn=excluded.vmg_kn, cmg_deg=excluded.cmg_deg, bridged=excluded.bridged""",
                            [(key, b["id"], ts(l["end_slot"]), ts(l["start_at"]), ts(l["end_at"]), l["hours"], l["dist_nm"], l["made_good_nm"],
                              l["speed_kn"], l["vmg_kn"], l["cmg_deg"], l["bridged"]) for l in b["legs"]])
            w4, w24, w7 = b["w4"] or {}, b["w24"] or {}, b["w7"] or {}
            cur.execute("""insert into boat_stat (race_key, team_id, as_of, rank, rank_change, dtf_nm, gap_nm, interval_nm, last_fix_at, stale,
                lat, lon, position_text, spd4, vmg4, cmg4, spd24, vmg24, run24_nm, spd7, run7_nm, best4_kn, best4_at, best24_nm, best24_at,
                best7_nm, best7_at, sailed_nm, made_good_nm, vmg7_kn, pb24, fleet_best24, vs_vdh_nm, vs_vdh_days, vs_kirsten_nm, vs_kirsten_days,
                next_mark, next_mark_nm, next_mark_eta, restart_at, speed_log_json, gain24_nm, vs_near_nm, near_n, lever_nm, lever_dir)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (key, b["id"], a, b["rank"], b["rank_change"], b["dtf_nm"], b["gap_nm"], b["interval_nm"], ts(b["last_fix_at"]), b["stale"],
                 b["lat"], b["lon"], b["position_text"], w4.get("speed_kn"), w4.get("vmg_kn"), w4.get("cmg_deg"),
                 w24.get("speed_kn"), w24.get("vmg_kn"), w24.get("dist_nm"), w7.get("speed_kn"), w7.get("dist_nm"),
                 b["best4_kn"], ts(b["best4_at"]), b["best24_nm"], ts(b["best24_at"]), b["best7_nm"], ts(b["best7_at"]),
                 b["sailed_nm"], b["made_good_nm"], b["vmg7_kn"], b["pb24"], b["fleet_best24"],
                 b["vs_vdh_nm"], b["vs_vdh_days"], b["vs_kirsten_nm"], b["vs_kirsten_days"],
                 b["next_mark"], b["next_mark_nm"], ts(b["next_mark_eta"]), ts(b["restart"]["first_out_at"]) if b.get("restart") else None,
                 Jsonb(b["speed_log"]), b.get("gain24_nm"), b.get("vs_near_nm"), b.get("near_n"), b.get("lever_nm"), b.get("lever_dir")))
            p = b.get("perf")
            if p:
                cur.execute("insert into boat_perf values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                            (key, b["id"], a, p["wind_ratio"], p["wind_legs"], Jsonb(p["pos"]), p["sd7"], p["share5_7"], p["parked_h7"],
                             p["night_delta"], p["n_night"], p["n_day"], p["legs"]))
        f = snap["fleet"]
        cur.execute("""insert into fleet_stat values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (key, a, f["race_day"], f["leader_team_id"], f["spread_nm"], f["best_run24_nm"], f["best_run24_team_id"],
                     f["ahead_vdh"], f["ahead_kirsten"], f["vdh_dtf_nm"], f["kirsten_dtf_nm"], f["next_mark"], f["racing"], f["retired"]))
        cur.executemany("insert into record_board values (%s,%s,%s,%s,%s,%s,%s,%s)",
                        [(key, a, r["kind"], r["win"], r["rank"], r["team_id"], r["value"], ts(r["at"])) for r in snap["records"]])
        cur.executemany("insert into duel values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        [(key, a, d["ahead_id"], d["behind_id"], d["gap_nm"], d["gap24_nm"], d["gap72_nm"], d["lead_changes"], ts(d["passed_at"]),
                          d["water_nm"], d["side"], Jsonb(d["series"])) for d in snap.get("duels", [])])
        cur.executemany("insert into sprint_result values (%s,%s,%s,%s,%s,%s,%s)",
                        [(key, a, s["sprint"], s["team_id"], ts(s["start_at"]), ts(s["end_at"]), s["hours"]) for s in snap["sprints"]])

def load_winds(conn, key):
    """{team_id: {report time: (model wind kt, direction it blows FROM)}} for the Performance statistics."""
    from .grid import slot_of, slot_time
    out = {}
    for tid, at, w, wd in conn.execute("select team_id, extract(epoch from fix_at)::bigint, wind_kn, wind_dir_deg from conditions where race_key=%s", (key,)):
        out.setdefault(tid, {})[slot_time(slot_of(int(at)))] = (w, wd)
    return out

def insert_conditions(conn, key, rows):
    conn.cursor().executemany("""insert into conditions values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing""",
        [(key, r["team_id"], ts(r["fix_at"]), r["lat"], r["lon"], r["wind_kn"], r["gust_kn"], r["wind_dir_deg"], r["mslp_hpa"], r["wave_m"],
          r["swell_m"], r["swell_period_s"], r["current_kn"], r["current_dir_deg"], r["sst_c"], ts(r["fetched_at"])) for r in rows])

def insert_events(conn, key, events):
    n = 0
    with conn.cursor() as cur:
        for e in events:
            cur.execute("insert into event (race_key, at, kind, team_id, title, body, page, dedupe_key) values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict (dedupe_key) do nothing",
                        (key, ts(e["at"]), e["kind"], e.get("team_id"), e["title"], e.get("body"), e.get("page"), e["dedupe_key"]))
            n += cur.rowcount
    return n

def previous_boat_stats(conn, key, before_as_of):
    prev = conn.execute("select max(as_of) from boat_stat where race_key=%s and as_of < %s", (key, ts(before_as_of))).fetchone()[0]
    if not prev: return []
    cols = ["team_id", "rank", "run24_nm", "best24_nm", "best4_kn", "best7_nm", "stale", "next_mark", "fleet_best24", "pb24", "restart_at"]
    return [dict(zip(cols, r)) for r in conn.execute(f"select {', '.join(cols)} from boat_stat where race_key=%s and as_of=%s", (key, prev))]
