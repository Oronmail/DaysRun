# worker/ggrstats/editions.py
"""The fleets of past races beside this year's. Pure functions on plain dicts; times in Unix seconds UTC; distances in nm.

Every fleet goes through the worker's own rules (grid.resample, grid.window, stats.detect_restart, perf.point_of_sail) once its
fixes have been measured on the 2026 course line (course.Line): a boat of 2018 and a boat of 2026 at the same spot then show the
same figure, and no two pages of the site disagree. A boat's race ends at the documented date (editions_data), never when her
tracker falls silent. Two things a past fleet needs that this year's does not: the 2018 fleet reported every three hours for a
week, a rhythm the 4-hour grid meets only twice a day (fill_slots), and a boat may lie in port for weeks and still be racing by
the record, her nought of a run kept off the fleet's average (MOORED_RUN_NM)."""
import bisect, statistics
from datetime import datetime, timezone
from . import perf
from .grid import resample, window, slot_of, slot_time, gc_nm, bearing_deg, SLOT_S, SLOT_TOL_S
from .stats import detect_restart, RUN24_LIMIT_NM, LEG_LIMIT_KN

DAY = 86400
MOORED_RUN_NM = 10.0                 # under this in 24 hours a boat is not sailing: back in port, or stopped in the Chichester class

def day_zero(start_at):
    """00:00 UTC of the start date: race day N is this plus N days (the site's rule: a race day is a UTC calendar date)."""
    return int(datetime.fromtimestamp(start_at, timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).timestamp())

def race_day_of(t, start_at):
    return (datetime.fromtimestamp(t, timezone.utc).date() - datetime.fromtimestamp(start_at, timezone.utc).date()).days

def cut(fixes, ended_at):
    """The boat's race: nothing after the documented end, whatever her tracker went on sending from a quay or a rescue ship."""
    return [f for f in fixes if ended_at is None or f["at"] <= ended_at]

def _wrap(deg):
    return (deg + 180.0) % 360.0 - 180.0

def fill_slots(fixes, max_gap_s=3 * 3600 + SLOT_TOL_S):
    """The same fixes plus one at every 4-hour slot time the boat reported around but not on. From 4 to 9 July 2018 the whole
    fleet reported every three hours, which the grid meets at 00:00 and 12:00 only: without this the trackers were sending MORE
    often than usual and the site would show no run, no leg and no miles for six days. A slot is filled only when the two
    original fixes either side are at most max_gap_s apart (3 h 20 min), so a real silence is never papered over; the position is
    linear in time between them, the short way round the antimeridian. An added fix is never itself interpolated from."""
    fx = sorted(fixes, key=lambda f: f["at"])
    if len(fx) < 2:
        return fx
    ats, added = [f["at"] for f in fx], []
    for k in range(slot_of(ats[0]) - 1, slot_of(ats[-1]) + 2):          # the guards below reject any slot outside the two fixes
        t = slot_time(k)
        i = bisect.bisect_left(ats, t)
        if i == 0 or i == len(fx):
            continue
        p, q = fx[i - 1], fx[i]
        if t - p["at"] <= SLOT_TOL_S or q["at"] - t <= SLOT_TOL_S or q["at"] - p["at"] > max_gap_s:
            continue                                                     # a fix already holds this slot, or the silence is longer than the grid
        f = (t - p["at"]) / (q["at"] - p["at"])
        added.append({"at": t, "lat": p["lat"] + f * (q["lat"] - p["lat"]), "lon": _wrap(p["lon"] + f * _wrap(q["lon"] - p["lon"])), "interp": True})
    return sorted(fx + added, key=lambda f: f["at"]) if added else fx

def on_line(fixes, line):
    """The same fixes with dtf replaced by the distance to finish on THIS course line, in metres (what grid reads). A fix on the
    finish line keeps one metre, so that resample does not drop it as in-port noise. The forward-only search is widened by the
    silence before the fix — a boat that has not reported for a week may be a thousand miles on — and the interp flag rides through."""
    out, i0, prev = [], 0, None
    for f in sorted(fixes, key=lambda f: f["at"]):
        togo, i0 = line.togo(f["lat"], f["lon"], i0, ahead=40 + (int((f["at"] - prev) // (4 * 3600)) if prev is not None else 0))
        out.append({"at": f["at"], "lat": f["lat"], "lon": f["lon"], "dtf": max(1, round(togo * 1852)), "interp": bool(f.get("interp"))})
        prev = f["at"]
    return out

def run_at(slots, k, t0=0):
    """One run rule, used for the day's run and for the record alike: the six 4-hour legs ending at slot k with a fix at every
    end (grid.window's record mode), 22 to 26 hours as stats.personal_bests demands, no leg above stats.LEG_LIMIT_KN and no total
    above stats.RUN24_LIMIT_NM (a tracker aboard a rescue ship made 295 nm). The distance in nm, or None: six legs or nothing."""
    w = window(slots, k, 6, t0, strict=True)
    if w is None or not 22 <= w["hours"] <= 26 or w["dist_nm"] > RUN24_LIMIT_NM:
        return None
    for a, b in zip(range(k - 6, k), range(k - 5, k + 1)):
        h = (slots[b]["at"] - slots[a]["at"]) / 3600.0
        if h <= 0 or gc_nm(slots[a]["lat"], slots[a]["lon"], slots[b]["lat"], slots[b]["lon"]) / h > LEG_LIMIT_KN:
            return None
    return w["dist_nm"]

def running_best(slots, start_at, restart):
    """(best run so far, its time) at every slot, in slot order: stats.personal_bests' rule one slot at a time, so that a whole
    race costs one pass instead of one per race day. The start day is left out as the records leave it, a run under MOORED_RUN_NM
    is not a record, and a restart starts the count again (a restarted boat's figures count from the restart)."""
    out, best, t0 = [], (None, None), 0
    first_out = restart["first_out_at"] if restart else None
    for k in sorted(slots):
        if first_out is not None and t0 == 0 and slots[k]["at"] >= first_out:
            best, t0 = (None, None), first_out
        if slots[k]["at"] >= max(start_at + DAY, t0):
            r = run_at(slots, k, t0)
            if r is not None and r >= MOORED_RUN_NM and (best[0] is None or r > best[0]):
                best = (r, slots[k]["at"])
        out.append(best)
    return out

def prepare(fixes, start_at, ended_at=None, ended_how=None, line=None):
    """Everything one boat needs for a whole race, computed once: her fixes cut at the documented end (for a past fleet also
    filled to the grid and measured on the 2026 line), the slots, the restart, the miles sailed as a running sum and the best run
    at every slot. compute() calls this once per boat; each race day then costs a lookup. line None: this year's fleet, whose
    fixes already carry YB's own distance to finish and whose grid is the live site's — no slot of 2026 is ever filled."""
    fx = cut(sorted(fixes, key=lambda f: f["at"]), ended_at)
    if line is not None:
        fx = on_line(fill_slots(fx), line)
    slots = resample(fx, start_at)
    ks = sorted(slots)
    cum = [0.0]
    for a, b in zip(ks, ks[1:]):
        cum.append(cum[-1] + gc_nm(slots[a]["lat"], slots[a]["lon"], slots[b]["lat"], slots[b]["lon"]))
    restart, real = detect_restart(fx, start_at), [f for f in fx if not f.get("interp")]
    return {"fixes": fx, "real": real, "real_ats": [f["at"] for f in real], "slots": slots, "ks": ks, "ats": [slots[k]["at"] for k in ks],
            "cum": cum, "restart": restart, "best": running_best(slots, start_at, restart), "ended_at": ended_at, "ended_how": ended_how,
            "filled": sum(1 for f in slots.values() if f.get("interp"))}

def past_slots(fixes, start_at, ended_at, line):
    """The slots a past boat's figures are built on, so that the wind import fetches the model wind at exactly the times the legs use."""
    return resample(on_line(fill_slots(cut(sorted(fixes, key=lambda f: f["at"]), ended_at)), line), start_at)

def _upto(ks, k):
    return bisect.bisect_right(ks, k) - 1                                # the index of the last slot at or before k, or -1

def t0_at(boat, t):
    """What the boat's figures count from: her restart once she has left again, the gun before that (NOR C.1.2 does not reset her race time)."""
    r = boat["restart"]
    return r["first_out_at"] if r and t >= r["first_out_at"] else 0

def best_so_far(boat, k):
    i = _upto(boat["ks"], k)
    return boat["best"][i] if i >= 0 else (None, None)

def _sailed(boat, k, t0):
    """Miles sailed as stats.compute_snapshot counts them: the great-circle legs between consecutive PRESENT slots, so a missed
    report is bridged by the straight line across it (a lower bound), never dropped."""
    j, i = _upto(boat["ks"], k), bisect.bisect_left(boat["ats"], t0)
    return boat["cum"][j] - boat["cum"][i] if j > i else 0.0

def boat_day(boat, start_at, T, course_nm):
    """One boat's row for the report at T. racing: started and not ended at T; finished: ended as 'finished' before T, and kept
    at the course's length so that she stays ahead of the fleet she beat; fresh: a REPORTED fix within 20 minutes of T, grid's own
    tolerance. A slot that fill_slots added serves the run, the wind legs and the miles sailed, never a position or a place: when
    the report's own slot is a filled one the row is the not-fresh row, as for a boat that missed the report. A boat that is not
    fresh keeps her last reported position and nothing else. Her best run so far is on every row, racing or not: a record once set
    is not taken away when her race ends."""
    ended = boat["ended_at"] is not None and boat["ended_at"] <= T
    finished = ended and boat["ended_how"] == "finished"
    k, t0 = slot_of(T), t0_at(boat, T)
    best = best_so_far(boat, k)
    row = {"race_day": race_day_of(T, start_at), "as_of": T, "racing": T >= start_at and not ended, "finished": finished, "fresh": False,
           "fix_at": None, "lat": None, "lon": None, "togo_nm": None, "mg_nm": None, "sailed_nm": None, "run24_nm": None,
           "best24_nm": best[0], "best24_at": best[1], "place": None, "restarted": t0 > 0, "ended_at": boat["ended_at"]}
    i = bisect.bisect_right(boat["real_ats"], T + SLOT_TOL_S) - 1
    if i >= 0:
        row.update(fix_at=boat["real"][i]["at"], lat=boat["real"][i]["lat"], lon=boat["real"][i]["lon"])
    if finished:
        row.update(togo_nm=0.0, mg_nm=course_nm)
    f = boat["slots"].get(k) if row["racing"] else None
    if f is None or f.get("interp"):
        return row
    togo = f["dtf"] / 1852.0
    row.update(fresh=True, fix_at=f["at"], lat=f["lat"], lon=f["lon"], togo_nm=togo, mg_nm=course_nm - togo,
               sailed_nm=_sailed(boat, k, t0), run24_nm=run_at(boat["slots"], k, t0))
    return row

def _order(r):
    return r["togo_nm"], r["ended_at"] if r["finished"] else 0        # two boats home are both at nought: the first one home is first

def assign_places(rows):
    """Place among the boats with a fix at the report and the boats already home, by distance to finish unrounded (a tie broken by
    file order was a fault of the mock-up). A finisher is at nought and so ahead of everyone still at sea, in the order she
    finished in: the leader of the day and place 1 are then the same boat."""
    for i, r in enumerate(sorted((r for r in rows.values() if r["fresh"] or r["finished"]), key=_order)):
        r["place"] = i + 1
    return rows

def day_legs(slots, T, t0=0):
    """The six 4-hour legs of the 24 hours to the report at T that have a fix at both ends: {end_at, cmg_deg}, for the wind."""
    k, out = slot_of(T), []
    for j in range(k - 5, k + 1):
        a, b = slots.get(j - 1), slots.get(j)
        if a and b and a["at"] >= t0:
            out.append({"end_at": slot_time(j), "cmg_deg": bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"])})
    return out

def wind_day(legs_by_team, winds):
    """winds: {team_id: {slot end time: (kt, the direction the wind blows FROM)}}. The site's own bands (perf.point_of_sail):
    upwind under 60°, reaching to 130°, running beyond, by the course made good over the leg, which is not the boat's heading."""
    kts, bands = [], {"upwind": 0, "reaching": 0, "running": 0}
    for tid, legs in legs_by_team.items():
        for l in legs:
            w = winds.get(tid, {}).get(l["end_at"])
            if not w or w[0] is None or w[1] is None:
                continue
            kts.append(w[0]); bands[perf.point_of_sail(w[1], l["cmg_deg"])] += 1
    return {"wind_kt": statistics.mean(kts) if kts else None, "wind_legs": len(kts),
            "legs_upwind": bands["upwind"], "legs_reaching": bands["reaching"], "legs_running": bands["running"]}

def fleet_day(rows, T, start_at, wind):
    """The fleet's row for the report at T. Leader, middle and last over the boats with a fix at the report plus the boats already
    home at the course's length; the runs over the boats that were sailing, since a boat lying in port is racing by the record but
    her nought would pull the fleet's average down. straight_pct leaves out a restarted boat: her miles sailed count from the
    restart and her miles made good from the gun, and the ratio of the two means nothing."""
    racing = [(t, r) for t, r in rows.items() if r["racing"]]
    finished = [(t, r) for t, r in rows.items() if r["finished"]]
    fresh = [(t, r) for t, r in racing if r["fresh"]]
    inset = fresh + finished
    mgs = sorted((r["mg_nm"] for _, r in inset), reverse=True)
    lead = min(inset, key=lambda tr: _order(tr[1]), default=None)
    sailing = [(t, r) for t, r in fresh if r["run24_nm"] is not None and r["run24_nm"] >= MOORED_RUN_NM]
    best = max(sailing, key=lambda tr: tr[1]["run24_nm"], default=None)
    sofar = max(((t, r) for t, r in rows.items() if r["best24_nm"] is not None), key=lambda tr: tr[1]["best24_nm"], default=None)
    straight = [r["sailed_nm"] / r["mg_nm"] * 100.0 for _, r in fresh if not r["restarted"] and r["mg_nm"] and r["mg_nm"] > 300 and r["sailed_nm"]]
    out = {"race_day": race_day_of(T, start_at), "as_of": T, "racing": len(racing), "finished": len(finished), "fresh": len(fresh),
           "leader_team_id": lead[0] if lead else None, "leader_mg_nm": mgs[0] if mgs else None,
           "median_mg_nm": statistics.median(mgs) if mgs else None, "last_mg_nm": mgs[-1] if mgs else None,
           "best_run_nm": best[1]["run24_nm"] if best else None, "best_run_team_id": best[0] if best else None,
           "best_sofar_nm": sofar[1]["best24_nm"] if sofar else None, "best_sofar_team_id": sofar[0] if sofar else None,
           "best_sofar_at": sofar[1]["best24_at"] if sofar else None,
           "mean_run_nm": statistics.mean([r["run24_nm"] for _, r in sailing]) if sailing else None, "runs_n": len(sailing),
           "wind_kt": None, "wind_legs": 0, "legs_upwind": 0, "legs_reaching": 0, "legs_running": 0,
           "straight_pct": statistics.median(straight) if straight else None}
    if wind:
        out.update(wind)
    return out

def _interp(t0, v0, t1, v1, v):
    return t0 + (v - v0) / (v1 - v0) * (t1 - t0)

def crossings(fixes, start_at, ended_how, ended_at, togo_marks, milestones, until=None):
    """{milestone: the time it was passed}. A latitude is crossed SOUTHBOUND and a longitude EASTBOUND, and only the FIRST such
    crossing counts: the return across the equator months later does not overwrite the outward one, and a boat that rounded the
    Cape of Good Hope's longitude and then turned back to Cape Town keeps the crossing she made. Each is interpolated between the
    two fixes either side and counts only where the milestone's own guard holds. A mark of the 2026 course is passed when the
    distance to finish falls to the mark's own, interpolated the same way and with NO margin: a margin exists so that the live
    site never announces a rounding early, and a table of history wants the crossing itself. togo_marks must therefore be on the
    same scale as the fixes (see compute). The finish is the documented one. Nothing after the page's own clock: until is the
    report of the last day computed, None for a race long finished."""
    out = {}
    fx = [f for f in fixes if f["at"] >= start_at and (until is None or f["at"] <= until + SLOT_TOL_S)]
    late = lambda t: until is not None and t > until
    for name, kind, value, guard in milestones:
        if kind == "finish":
            if ended_how == "finished" and ended_at is not None and not late(ended_at):
                out[name] = ended_at
            continue
        if kind == "mark":
            thr = togo_marks[value]
            measured = [f for f in fx if f.get("dtf")]                   # a fix without a distance is in-port tracker noise, as least_dtf_nm has it
            for p, q in zip(measured, measured[1:]):
                a, b = p["dtf"] / 1852.0, q["dtf"] / 1852.0
                if a > thr >= b:
                    t = _interp(p["at"], a, q["at"], b, thr)
                    if not late(t):
                        out[name] = t
                    break
            continue
        key = "lat" if kind == "lat" else "lon"
        for p, q in zip(fx, fx[1:]):
            crossed = (p[key] > value >= q[key]) if kind == "lat" else (p[key] < value <= q[key])
            if crossed and guard(q["lat"], q["lon"]):
                t = _interp(p["at"], p[key], q["at"], q[key], value)
                if not late(t):
                    out[name] = t
                break
    return out

def compute(fixes_by_team, ends, start_at, line, course_nm, days, winds, on_this_line, milestones=None, togo_marks=None, until=None):
    """Everything the page needs for one race: fixes_by_team {team_id: fixes}; ends {team_id: {ended_at, ended_how}} (empty for a
    race still running); days: the race days to (re)compute; winds as wind_day takes; on_this_line False for 2026, whose fixes
    carry YB's own distance to finish, so that no two pages of the site disagree; togo_marks None: no milestones this run.

    togo_marks MUST be on the same scale as the fixes, and the caller owns that choice. A fleet measured on the line
    (on_this_line True) takes `course.mark_togo(nodes, config.MARKS, observed={})` — the line's OWN figure at each mark, because
    those boats' distances come from that same projection; at Lanzarote the line reads about 8 nm more than YB's observed
    24,469.5, and mixing the two cost Guy deBoer a rounding he had made. This year's fleet (on_this_line False, YB's own
    distances) takes `course.mark_togo(nodes, config.MARKS)`, YB's observed figure where one is known.

    notes says what the two rules of a past fleet added and left out, for the run's log: filled_slots, the slots fill_slots
    supplied; moored_runs, the boat-days whose run was too small to be sailing; interp_reports, the boat-days whose own report
    was a filled slot and are therefore not fresh."""
    from . import editions_data
    milestones = editions_data.MILESTONES if milestones is None else milestones
    boats = {tid: prepare(fx, start_at, ends.get(tid, {}).get("ended_at"), ends.get(tid, {}).get("ended_how"), line if on_this_line else None)
             for tid, fx in fixes_by_team.items()}
    dz, moored, interp, out = day_zero(start_at), 0, 0, {"days": [], "boat_days": [], "milestones": [], "notes": {}}
    for d in days:
        T = dz + d * DAY
        rows = {tid: dict(boat_day(b, start_at, T, course_nm), team_id=tid) for tid, b in boats.items()}
        assign_places(rows)
        moored += sum(1 for r in rows.values() if r["run24_nm"] is not None and r["run24_nm"] < MOORED_RUN_NM)
        interp += sum(1 for tid, b in boats.items() if rows[tid]["racing"] and (b["slots"].get(slot_of(T)) or {}).get("interp"))
        legs = {tid: day_legs(b["slots"], T, t0_at(b, T)) for tid, b in boats.items() if rows[tid]["racing"]}
        out["days"].append(fleet_day(rows, T, start_at, wind_day(legs, winds) if winds else None))
        out["boat_days"].extend(rows.values())
    if togo_marks is not None:
        for tid, b in boats.items():
            for name, t in crossings(b["fixes"], start_at, b["ended_how"], b["ended_at"], togo_marks, milestones, until).items():
                out["milestones"].append({"team_id": tid, "milestone": name, "passed_at": int(t), "race_day": race_day_of(t, start_at)})
    out["notes"] = {"filled_slots": sum(b["filled"] for b in boats.values()), "moored_runs": moored, "interp_reports": interp}
    return out
