# worker/ggrstats/stats.py
"""Everything derived from fixes. Pure functions on plain dicts; the database is handled in run.py."""
from datetime import datetime, timezone
from . import config, names
from .grid import gc_nm, resample, window, legs, slot_of, slot_time, SLOT_S
from . import perf, duels

DAY = 86400

def sorted_fixes(moments):
    return sorted(moments, key=lambda m: m["at"])

def at_or_before(fixes, t, tol_s=1200):
    c = [f for f in fixes if f["at"] <= t + tol_s]
    return c[-1] if c else None

def detect_restart(fixes, start_at, port=config.LES_SABLES, radius_nm=1.0, after_s=6 * 3600):
    """A boat back within radius_nm of the Les Sables marina more than after_s after the gun, then out again.
    NOR C.1.2: allowed within 7 days; race time is not reset."""
    inport = [f for f in fixes if f["at"] > start_at + after_s and gc_nm(f["lat"], f["lon"], port[0], port[1]) < radius_nm]
    if not inport:
        return None
    last_in = inport[-1]["at"]
    out = next((f for f in fixes if f["at"] > last_in), None)
    return None if out is None else {"last_in_port_at": last_in, "first_out_at": out["at"]}

def rank_at(fleet, t):
    """fleet: {team_id: fixes sorted ascending}, racing boats only. Rank by distance to finish of the latest fix at or before t."""
    rows = []
    for tid, fx in fleet.items():
        f = at_or_before(fx, t)
        if f:
            rows.append((f["dtf"], tid))
    return {tid: i + 1 for i, (_, tid) in enumerate(sorted(rows))}

def personal_bests(slots, k_end, t0, start_at):
    """(best 4-h leg speed, best 24-h run, best 7-day run) as (value, end_at). Start day excluded; fixes before t0 ignored."""
    best4 = best24 = best7 = (0.0, None)
    for k in sorted(slots):
        if k > k_end or slots[k]["at"] < max(start_at + DAY, t0):
            continue
        if k - 1 in slots and slots[k - 1]["at"] >= t0:
            h = (slots[k]["at"] - slots[k - 1]["at"]) / 3600.0
            if 3.5 <= h <= 4.5:
                v = gc_nm(slots[k - 1]["lat"], slots[k - 1]["lon"], slots[k]["lat"], slots[k]["lon"]) / h
                if v > best4[0]:
                    best4 = (v, slots[k]["at"])
        w = window(slots, k, 6, t0, strict=True)            # records never bridge a missed report
        if w and 22 <= w["hours"] <= 26 and w["dist_nm"] > best24[0]:
            best24 = (w["dist_nm"], slots[k]["at"])
        w = window(slots, k, 42, t0, strict=True)
        if w and 160 <= w["hours"] <= 176 and w["dist_nm"] > best7[0]:
            best7 = (w["dist_nm"], slots[k]["at"])
    return best4, best24, best7

def position_text(lat, lon):
    def f(v, pos, neg, width):
        h = pos if v >= 0 else neg
        tenths = round(abs(v) * 600)               # whole tenths of a minute, so 59.97′ carries into the degrees
        d, m = divmod(tenths, 600)
        return f"{d:0{width}d}°{m / 10:04.1f}′{h}"
    return f(lat, "N", "S", 2) + " " + f(lon, "E", "W", 3)

# worker/ggrstats/stats.py (append)
def crossing_time(fixes, lat, t0=0):
    """First southbound crossing of a parallel after t0, linearly interpolated between the two fixes around it."""
    fx = [f for f in fixes if f["at"] >= t0]
    for a, b in zip(fx, fx[1:]):
        if a["lat"] >= lat > b["lat"]:
            return a["at"] + (a["lat"] - lat) / (a["lat"] - b["lat"]) * (b["at"] - a["at"])
    return None

def ghost_time_gap_days(ghost_fixes, boat_dtf_nm, T):
    """Design plan §4 ghost gap, in days. Negative: the ghost's replay passed this boat's distance to finish that many
    days before T (exact, interpolated between replay fixes). Positive: the ghost has not reached it; days until it does,
    at the ghost's pace over its last 7 replay days. None if the replay cannot answer."""
    fx = [f for f in ghost_fixes if f["at"] <= T + 1200 and f.get("dtf")]
    if len(fx) < 2:
        return None
    target = boat_dtf_nm * 1852.0
    for a, b in zip(fx, fx[1:]):
        if a["dtf"] >= target > b["dtf"]:
            t_ghost = a["at"] + (a["dtf"] - target) / (a["dtf"] - b["dtf"]) * (b["at"] - a["at"])
            return -(T - t_ghost) / DAY
    last = fx[-1]
    old = at_or_before(fx, last["at"] - 7 * DAY) or fx[0]
    if last["at"] <= old["at"] or old["dtf"] <= last["dtf"]:
        return None
    pace_m_per_s = (old["dtf"] - last["dtf"]) / (last["at"] - old["at"])
    return ((last["dtf"] - target) / pace_m_per_s + (last["at"] - T)) / DAY

def next_mark_for(fix):
    """v0 rule, valid until Trindade: a boat north of a mark's latitude (+0.2°) is heading for it."""
    for name, lat, lon in config.MARKS:
        if fix["lat"] > lat + 0.2:
            return name, lat, lon
    return config.MARKS[-1]

def unreported(snapshot):
    """True when no boat has a fix for the snapshot's report time: the report has not been captured yet. One boat without
    a fix is a missed report; all of them is missing data, and the slot must not be stored."""
    return all(b["stale"] for b in snapshot["boats"])

def compute_snapshot(setup, fixes_by_team, T):
    start_at = min(t["start"] for t in setup["tags"])
    course_nm = setup["course"]["distance"] / 1.852
    KT = slot_of(T)
    team_meta = {t["id"]: t for t in setup["teams"]}
    racing_ids = [tid for tid in fixes_by_team if tid not in config.GHOSTS and tid in team_meta]
    racing = {tid: fixes_by_team[tid] for tid in racing_ids}
    rank_now, rank_then = rank_at(racing, T), rank_at(racing, T - DAY)

    ghosts = {}
    for gid in config.GHOSTS:
        fx = fixes_by_team.get(gid, [])
        f = at_or_before(fx, T)
        if not f:
            continue
        old = at_or_before(fx, f["at"] - 7 * DAY) or fx[0]
        pace = ((old["dtf"] - f["dtf"]) / 1852.0) / ((f["at"] - old["at"]) / DAY) if f["at"] > old["at"] else None
        ghosts[gid] = {"dtf_nm": f["dtf"] / 1852.0 if f.get("dtf") else None, "fix_at": f["at"], "lat": f["lat"], "lon": f["lon"],
                       "pace7_nm_day": pace, "nfix": len(fx)}

    boats = []
    for tid in racing_ids:
        fx = racing[tid]
        f = at_or_before(fx, T)
        if not f:
            continue
        restart = detect_restart(fx, start_at)
        t0 = restart["first_out_at"] if restart else 0
        slots = resample(fx, start_at)
        kl = max((k for k in slots if k <= KT), default=None)   # None in the first hours: no usable grid fix yet
        w4 = window(slots, kl, 1, t0, strict=True) if kl is not None else None   # a 4-hour leg is never stretched to 8 hours
        w24 = window(slots, kl, 6, t0) if kl is not None else None               # displayed runs may bridge one report (flagged)
        w7 = window(slots, kl, 42, t0) if kl is not None else None
        best4, best24, best7 = personal_bests(slots, KT, t0, start_at)
        leg_rows = legs(slots, kl, 42, t0) if kl is not None else []
        old = at_or_before(fx, max(f["at"] - 7 * DAY, t0))
        vmg7 = ((old["dtf"] - f["dtf"]) / 1852.0) / ((f["at"] - old["at"]) / 3600.0) if old and f["at"] > old["at"] else 0.0
        mark_name, mlat, mlon = next_mark_for(f)
        dmark = gc_nm(f["lat"], f["lon"], mlat, mlon)
        eta = f["at"] + dmark / vmg7 * 3600 if vmg7 > 0.2 else None
        ks = sorted(k for k in slots if k <= KT and slots[k]["at"] >= t0)
        sailed = sum(gc_nm(slots[a]["lat"], slots[a]["lon"], slots[b]["lat"], slots[b]["lon"]) for a, b in zip(ks, ks[1:]))
        boats.append({
            "id": tid, "name": names.FULL.get(tid, team_meta[tid]["name"]), "first": names.FIRST.get(tid, team_meta[tid]["name"].split()[0]),
            "rank": rank_now[tid], "rank_change": rank_then.get(tid, rank_now[tid]) - rank_now[tid],
            "dtf_nm": f["dtf"] / 1852.0, "last_fix_at": f["at"], "stale": (T - f["at"]) / 3600.0 >= 3.5,
            "lat": f["lat"], "lon": f["lon"], "position_text": position_text(f["lat"], f["lon"]),
            "w4": w4, "w24": w24, "w7": w7, "legs": leg_rows, "speed_log": [l["speed_kn"] for l in leg_rows],
            "best4_kn": best4[0], "best4_at": best4[1], "best24_nm": best24[0], "best24_at": best24[1],
            "best7_nm": best7[0] if best7[1] else None, "best7_at": best7[1],
            "sailed_nm": sailed, "made_good_nm": course_nm - f["dtf"] / 1852.0, "vmg7_kn": vmg7,
            "next_mark": mark_name, "next_mark_nm": dmark, "next_mark_eta": eta, "restart": restart,
        })
    boats.sort(key=lambda b: b["dtf_nm"])
    if not boats:                                                # asked for a time before the first fix
        return {"as_of": T, "race_day": 0, "boats": [], "ghosts": ghosts, "fleet": None, "records": [], "sprints": [], "duels": []}
    lead, prev = boats[0]["dtf_nm"], None
    for b in boats:
        b["gap_nm"] = round(b["dtf_nm"] - lead)
        b["interval_nm"] = None if prev is None else round(b["dtf_nm"] - prev)
        prev = b["dtf_nm"]
        for gid, key in ((978, "vdh"), (940, "kirsten")):
            g = ghosts.get(gid)
            if not g:
                b[f"vs_{key}_nm"] = b[f"vs_{key}_days"] = None
                continue
            b[f"vs_{key}_nm"] = round(g["dtf_nm"] - b["dtf_nm"]) if g["dtf_nm"] is not None else None
            b[f"vs_{key}_days"] = ghost_time_gap_days(fixes_by_team[gid], b["dtf_nm"], T)
    # The angles YB does not give (perf.py). All three are fix-to-fix and skip a boat without a current fix, so that a missed
    # report never shows as a hundred miles lost.
    def dtf_near(fx, t):
        f = at_or_before(fx, t)
        return f["dtf"] / 1852.0 if f and f.get("dtf") and t - f["at"] < 3.5 * 3600 else None
    leader = boats[0]
    lead_now, lead_then = dtf_near(racing[leader["id"]], T), dtf_near(racing[leader["id"]], T - DAY)
    lead_slots = resample(racing[leader["id"]], start_at)
    lead_track = [lead_slots[k] for k in sorted(lead_slots) if k <= KT]
    for b in boats:
        now, then = dtf_near(racing[b["id"]], T), dtf_near(racing[b["id"]], T - DAY)
        known = b is not leader and None not in (now, then, lead_now, lead_then)
        b["gain24_nm"] = (then - lead_then) - (now - lead_now) if known else None      # miles gained (+) on today's leader in 24 h
        near = [o["w24"]["dist_nm"] for o in boats if o is not b and o["w24"] and not o["stale"]
                and gc_nm(b["lat"], b["lon"], o["lat"], o["lon"]) < 150]
        ok = b["w24"] and not b["stale"] and len(near) >= 2
        b["vs_near_nm"] = b["w24"]["dist_nm"] - sorted(near)[len(near) // 2] if ok and len(near) % 2 else (
            b["w24"]["dist_nm"] - (sorted(near)[len(near) // 2 - 1] + sorted(near)[len(near) // 2]) / 2 if ok else None)
        b["near_n"] = len(near)
        b["lever_nm"], b["lever_dir"] = (None, None) if b is leader or b["stale"] else perf.leverage(lead_track, b["lat"], b["lon"])
    best_run = max((b["w24"]["dist_nm"] for b in boats if b["w24"]), default=None)   # None until a 24-hour window exists
    for b in boats:
        run = b["w24"]["dist_nm"] if b["w24"] else 0.0
        b["fleet_best24"] = b["w24"] is not None and best_run is not None and round(run) == round(best_run)
        b["pb24"] = (round(run) >= round(b["best24_nm"])) and not b["fleet_best24"] and b["w24"] is not None

    records = []
    for kind, key, atkey in (("best4", "best4_kn", "best4_at"), ("best24", "best24_nm", "best24_at"), ("best7", "best7_nm", "best7_at")):
        for win, since in (("7d", T - 7 * DAY), ("30d", T - 30 * DAY), ("race", 0)):
            rows = sorted([b for b in boats if b[key] and b[atkey] and b[atkey] >= since], key=lambda b: -b[key])[:5]
            records += [{"kind": kind, "win": win, "rank": i + 1, "team_id": b["id"], "value": b[key], "at": b[atkey]} for i, b in enumerate(rows)]

    sprints = []
    for name, l0, l1 in config.SPRINTS:
        for b in boats:
            fx = racing[b["id"]]
            t0 = b["restart"]["first_out_at"] if b["restart"] else 0
            a, c = crossing_time(fx, l0, t0), crossing_time(fx, l1, t0)
            if a and c and c <= T + 1200:
                sprints.append({"sprint": name, "team_id": b["id"], "start_at": a, "end_at": c, "hours": (c - a) / 3600.0})

    race_day = (datetime.fromtimestamp(T, timezone.utc).date() - datetime.fromtimestamp(start_at, timezone.utc).date()).days
    fleet = {"race_day": race_day, "leader_team_id": boats[0]["id"], "spread_nm": round(boats[-1]["dtf_nm"] - boats[0]["dtf_nm"]),
             "best_run24_nm": round(best_run) if best_run is not None else None,
             "best_run24_team_id": next((b["id"] for b in boats if b["fleet_best24"]), None),
             "ahead_vdh": sum(1 for b in boats if (b["vs_vdh_nm"] or 0) > 0), "ahead_kirsten": sum(1 for b in boats if (b["vs_kirsten_nm"] or 0) > 0),
             "vdh_dtf_nm": ghosts.get(978, {}).get("dtf_nm"), "kirsten_dtf_nm": ghosts.get(940, {}).get("dtf_nm"),
             "stale_ids": [b["id"] for b in boats if b["stale"]],
             "next_mark": boats[0]["next_mark"], "racing": len(boats), "retired": 0}
    return {"as_of": T, "race_day": fleet["race_day"], "boats": boats, "ghosts": ghosts, "fleet": fleet, "records": records, "sprints": sprints,
            "duels": duels.find(boats, racing, T)}
