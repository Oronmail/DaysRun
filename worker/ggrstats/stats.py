# worker/ggrstats/stats.py
"""Everything derived from fixes. Pure functions on plain dicts; the database is handled in run.py."""
from datetime import datetime, timezone
from . import config, names, weather_records
from .grid import gc_nm, resample, window, legs, slot_of, slot_time, SLOT_S
from . import perf, duels, course

DAY = 86400

def sorted_fixes(moments):
    return sorted(moments, key=lambda m: m["at"])

def fix_at(fixes, t, tol_s=1200):
    """The fix that belongs to the report at t: the one NEAREST t within tol_s, and failing that the latest one before t.

    The same rule as grid.resample, which the legs and runs have always used; before 19 Sep 2026 this took the LATEST fix up to
    tol_s AFTER t instead, so a boat reporting every ten minutes near a landfall was placed by her 00:20 fix while her neighbours
    were placed by their 00:00 ones. A dead heat goes to the earlier fix, the report being at or before. The fallback is what keeps
    a silent boat in the fleet: she is placed at her last known position and marked stale, rather than vanishing from the snapshot
    (which the sanity gate would refuse). `fixes` is sorted ascending."""
    near = [f for f in fixes if abs(f["at"] - t) <= tol_s]
    if near:
        return min(near, key=lambda f: (abs(f["at"] - t), f["at"]))
    before = [f for f in fixes if f["at"] <= t]
    return before[-1] if before else None

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
        f = fix_at(fx, t)
        if f:
            rows.append((f["dtf"], tid))
    return {tid: i + 1 for i, (_, tid) in enumerate(sorted(rows))}

def place_changes(fleet, T, stale_h=3.5):
    """{team_id: places gained (+) or lost (−) in 24 hours, or None}. Counted among the boats that have a current fix at T AND had
    one 24 hours earlier: rank_at() ranks a silent boat at her frozen distance to finish, so the day after a silence she 'gains'
    places she never lost and every boat she had drifted behind 'loses' one (18 Sep 2026: Andrea +6, six boats −1, nobody had
    moved). None for a boat without a current fix at either end."""
    def current(t):
        out = {}
        for tid, fx in fleet.items():
            f = fix_at(fx, t)
            if f and f.get("dtf") and (t - f["at"]) / 3600.0 < stale_h:
                out[tid] = f["dtf"]
        return out
    now, then = current(T), current(T - DAY)
    both = [tid for tid in now if tid in then]
    pos = lambda d: {tid: i for i, tid in enumerate(sorted(both, key=lambda tid: (d[tid], tid)))}
    p_now, p_then = pos(now), pos(then)
    return {tid: (p_then[tid] - p_now[tid] if tid in p_now else None) for tid in fleet}

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
    old = fix_at(fx, last["at"] - 7 * DAY) or fx[0]
    if last["at"] <= old["at"] or old["dtf"] <= last["dtf"]:
        return None
    pace_m_per_s = (old["dtf"] - last["dtf"]) / (last["at"] - old["at"])
    return ((last["dtf"] - target) / pace_m_per_s + (last["at"] - T)) / DAY

def least_dtf_nm(fixes, t0, T):
    """The least distance to finish YB has shown for a boat up to T, counted from a restart: a mark once passed stays passed
    (course.next_mark), whatever the boat does afterwards. Fixes without a distance (in-port tracker noise) are left out."""
    return min((f["dtf"] for f in fixes if t0 <= f["at"] <= T + 1200 and f.get("dtf")), default=None)

def unreported(snapshot):
    """True when no boat has a fix for the snapshot's report time: the report has not been captured yet. One boat without
    a fix is a missed report; all of them is missing data, and the slot must not be stored."""
    return all(b["stale"] for b in snapshot["boats"])

def ready_to_publish(snapshot, previously_fresh, age_s, patience_s=12 * 60):
    """The worker starts a few minutes after a report, to have it on the site quickly. YB does not receive the whole fleet in the
    same minute, so a young report is published only once every boat that had a current fix at the previous report has one now;
    after patience_s it is published as it stands, and a boat still silent has then missed the report."""
    fresh = {b["id"] for b in snapshot["boats"] if not b["stale"]}
    return age_s >= patience_s or set(previously_fresh) <= fresh

RUN24_LIMIT_NM, LEG_LIMIT_KN, DTF_RISE_LIMIT_NM_PER_4H = 260.0, 12.0, 60.0          # no boat of this fleet can do any of them

def sanity_problems(snapshot, previous, course_nm):
    """Reasons not to publish a snapshot; [] when it is sane. A tracker glitch, a feed that changed shape or a bug must never put
    an impossible number on the site (or on a slide read out on air): the run fails loudly instead, the last good snapshot stays,
    and the alarm tells the owner. previous: [{team_id, dtf_nm, as_of_s, stale}] of the report before (db.previous_boat_stats)."""
    out, boats = [], snapshot["boats"]
    if snapshot["as_of"] % SLOT_S:
        out.append("the snapshot's time is not a 4-hourly report time")
    here = {b["id"] for b in boats}
    gone = [p["team_id"] for p in previous if p["team_id"] not in here]
    if gone:
        out.append(f"{len(gone)} boat{'s' if len(gone) > 1 else ''} of the previous report {'are' if len(gone) > 1 else 'is'} missing: "
                   + ", ".join(names.FIRST.get(t, str(t)) for t in gone))
    if sorted(b["rank"] for b in boats) != list(range(1, len(boats) + 1)):
        out.append(f"places are not 1 to {len(boats)}: {sorted(b['rank'] for b in boats)}")
    was = {p["team_id"]: p for p in previous}
    for b in boats:
        if b["w24"] and b["w24"]["dist_nm"] > RUN24_LIMIT_NM:
            out.append(f"{b['first']}: a 24-hour run of {round(b['w24']['dist_nm'])} nm (limit {round(RUN24_LIMIT_NM)})")
        if b["w4"] and b["w4"]["speed_kn"] > LEG_LIMIT_KN:
            out.append(f"{b['first']}: a 4-hour leg at {b['w4']['speed_kn']:.1f} kt (limit {round(LEG_LIMIT_KN)})")
        if not 0 < b["dtf_nm"] <= course_nm + 50:
            out.append(f"{b['first']}: {round(b['dtf_nm'])} nm to go, more than the course ({round(course_nm)}) or not above nought")
        p = was.get(b["id"])
        if p and p.get("dtf_nm") is not None and p.get("as_of_s"):
            hours = max(4.0, (snapshot["as_of"] - p["as_of_s"]) / 3600.0)
            rise = b["dtf_nm"] - p["dtf_nm"]
            if rise > DTF_RISE_LIMIT_NM_PER_4H * hours / 4.0:
                out.append(f"{b['first']}: distance to finish rose by {round(rise)} nm in {round(hours)} hours (limit {round(DTF_RISE_LIMIT_NM_PER_4H * hours / 4.0)})")
    return out

def moored(b):
    """A boat that is not moving: her newest 4-hour leg under `perf.STOPPED_KN` (0.2 kt, 0.8 nm in four hours). The rule and the
    reasoning live in perf.py, beside the legs it also governs."""
    return bool(b.get("w4")) and b["w4"]["speed_kn"] < perf.STOPPED_KN

def against_the_nearby(boats, radius_nm=150.0, min_boats=2):
    """Each boat's 24-hour run against the MEDIAN run of the boats within `radius_nm`, which sail much the same weather.
    A boat that is not moving is left out of that median: she sails no weather at all, and one motionless boat moves a small
    median a long way (18 Sep 2026, Guy deBoer lying at Lanzarote among the boats rounding the mark). She keeps her own figure,
    measured against the boats that are sailing — the miles she covered are a fact. Sets vs_near_nm and near_n on each boat."""
    for b in boats:
        near = sorted(o["w24"]["dist_nm"] for o in boats if o is not b and o["w24"] and not o["stale"] and not moored(o)
                      and gc_nm(b["lat"], b["lon"], o["lat"], o["lon"]) < radius_nm)
        b["near_n"] = len(near)
        if not (b["w24"] and not b["stale"] and len(near) >= min_boats):
            b["vs_near_nm"] = None
            continue
        m = len(near) // 2
        b["vs_near_nm"] = b["w24"]["dist_nm"] - (near[m] if len(near) % 2 else (near[m - 1] + near[m]) / 2)

def compute_snapshot(setup, fixes_by_team, T, conditions=None):
    """conditions: db.load_conditions, for the weather boards (None = boards without weather, as verify and the tests call it)."""
    start_at = config.race_start(setup)
    course_nm = setup["course"]["distance"] / 1.852
    KT = slot_of(T)
    team_meta = {t["id"]: t for t in setup["teams"]}
    racing_ids = [tid for tid in fixes_by_team if tid not in config.GHOSTS and tid in team_meta]
    racing = {tid: fixes_by_team[tid] for tid in racing_ids}
    rank_now, changes = rank_at(racing, T), place_changes(racing, T)
    togo = course.mark_togo(setup["course"]["nodes"], config.MARKS)      # each mark's own distance to finish, on YB's scale

    ghosts = {}
    for gid in config.GHOSTS:
        fx = fixes_by_team.get(gid, [])
        f = fix_at(fx, T)
        if not f:
            continue
        old = fix_at(fx, f["at"] - 7 * DAY) or fx[0]
        pace = ((old["dtf"] - f["dtf"]) / 1852.0) / ((f["at"] - old["at"]) / DAY) if f["at"] > old["at"] else None
        ghosts[gid] = {"dtf_nm": f["dtf"] / 1852.0 if f.get("dtf") else None, "fix_at": f["at"], "lat": f["lat"], "lon": f["lon"],
                       "pace7_nm_day": pace, "nfix": len(fx)}

    boats = []
    for tid in racing_ids:
        fx = racing[tid]
        f = fix_at(fx, T)
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
        old = fix_at(fx, max(f["at"] - 7 * DAY, t0))
        vmg7 = ((old["dtf"] - f["dtf"]) / 1852.0) / ((f["at"] - old["at"]) / 3600.0) if old and f["at"] > old["at"] else 0.0
        least = least_dtf_nm(fx, t0, T)
        mark_name, mlat, mlon = course.next_mark((least if least is not None else f["dtf"]) / 1852.0, config.MARKS, togo)
        # To a mark: the great circle from the boat. To the finish: YB's distance to finish, which goes round the land between.
        dmark = f["dtf"] / 1852.0 if mark_name == config.MARKS[-1][0] else gc_nm(f["lat"], f["lon"], mlat, mlon)
        eta = f["at"] + dmark / vmg7 * 3600 if vmg7 > 0.2 else None
        ks = sorted(k for k in slots if k <= KT and slots[k]["at"] >= t0)
        sailed = sum(gc_nm(slots[a]["lat"], slots[a]["lon"], slots[b]["lat"], slots[b]["lon"]) for a, b in zip(ks, ks[1:]))
        boats.append({
            "id": tid, "name": names.FULL.get(tid, team_meta[tid]["name"]), "first": names.FIRST.get(tid, team_meta[tid]["name"].split()[0]),
            "rank": rank_now[tid], "rank_change": changes.get(tid),
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
        f = fix_at(fx, t)
        return f["dtf"] / 1852.0 if f and f.get("dtf") and t - f["at"] < 3.5 * 3600 else None
    leader = boats[0]
    lead_now, lead_then = dtf_near(racing[leader["id"]], T), dtf_near(racing[leader["id"]], T - DAY)
    lead_slots = resample(racing[leader["id"]], start_at)
    lead_track = [lead_slots[k] for k in sorted(lead_slots) if k <= KT]
    against_the_nearby(boats)
    for b in boats:
        now, then = dtf_near(racing[b["id"]], T), dtf_near(racing[b["id"]], T - DAY)
        known = b is not leader and None not in (now, then, lead_now, lead_then)
        b["gain24_nm"] = (then - lead_then) - (now - lead_now) if known else None      # miles gained (+) on today's leader in 24 h
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

    if conditions:
        records += weather_records.compute({tid: rows for tid, rows in conditions.items() if tid in racing}, T)

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
