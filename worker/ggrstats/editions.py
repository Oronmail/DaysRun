# worker/ggrstats/editions.py
"""The fleets of past races beside this year's. Pure functions on plain dicts; times in Unix seconds UTC; distances in nm.

EVERY FLEET KEEPS YB'S OWN DISTANCE TO FINISH AND IS MEASURED AGAINST ITS OWN COURSE'S LENGTH, and the fleets are compared race
day for race day (the owner's decision, 19 Sep 2026). No fix is projected onto another year's course line: the three courses are
25,754.5 (2026), 26,003.0 (2022) and 25,099.9 (2018) nm, and the page says so in words rather than pretending one yardstick fits
all three. The figures are therefore the same source every other page of the site already uses, so no two pages disagree by
construction. The comparison that needs no course at all — the equator, the Cape of Good Hope, Cape Horn — is the geographic
crossing, and the gates that are a race's own (Lanzarote, Hobart) come from that race's own YB split time.

Every fleet goes through the worker's own rules (grid.resample, grid.window, stats.detect_restart, perf.point_of_sail). A boat's
race ends at the documented date (editions_data), never when her tracker falls silent. Three things a past fleet needs that this
year's does not: the 2018 fleet reported every three hours for a week, a rhythm the 4-hour grid meets only twice a day
(fill_slots); YB's record of a past race can stop giving a distance to finish while the boat is plainly still sailing, and such a
fix is KEPT for its position (grid.resample's keep_without_dtf) while every figure counted off a distance stays BLANK, never
guessed — a measure of ours beside YB's own in the same fleet row disagreed with YB by up to 178 nm where it could be checked;
and a boat that is not moving (perf.STOPPED_KN, perf.sailing — the same rule the live pages use) is left out of the fleet's
mean run, run count, day's best run and wind bands for exactly as long as she lies there, never for the rest of the race; her own
row keeps her own run, her own record and her place, and the race's best run so far keeps the record she sailed."""
import bisect, statistics
from datetime import datetime, timezone
from . import perf
from .grid import resample, window, slot_of, slot_time, gc_nm, bearing_deg, SLOT_TOL_S
from .stats import detect_restart, position_text, RUN24_LIMIT_NM, LEG_LIMIT_KN

DAY = 86400
RESTART_WINDOW_S = 7 * DAY           # NOR C.1.2 lets a boat return and start again only within seven days of the gun; later, a fix
                                     # outside the marina after one inside it is an ARRIVAL (2022 held Damien Guillou to this window)

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
    linear in time between them, the short way round the antimeridian. An added fix is never itself interpolated from.

    The distance to finish is interpolated the same way, and for the same reason the position is: grid.resample DROPS a fix
    without one (in-port tracker noise), so a filled slot that carried none would be thrown away again and the three-hourly week
    would have no run after all. Both neighbours must have one, or the added fix carries none and is dropped — blank, never
    guessed."""
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
        add = {"at": t, "lat": p["lat"] + f * (q["lat"] - p["lat"]), "lon": _wrap(p["lon"] + f * _wrap(q["lon"] - p["lon"])), "interp": True}
        if p.get("dtf") and q.get("dtf"):                                # falsy IS missing, as in grid.resample: a dtf of nought is no figure
            add["dtf"] = round(p["dtf"] + f * (q["dtf"] - p["dtf"]))
        added.append(add)
    return sorted(fx + added, key=lambda f: f["at"]) if added else fx

def on_line(fixes, line):
    """THE RETIRED COMMON YARDSTICK, kept but no longer on the page's path (19 Sep 2026): the same fixes with dtf replaced by the
    distance to finish on ONE course line, in metres (what grid reads), so that two fleets of different years could be compared
    mile for mile. The page now keeps YB's own distance for every fleet and measures each against its own course, because the
    projection could not deliver what it promised — a boat of 2018 and a boat of 2026 at the same spot do NOT show the same
    figure, for structural reasons course.py's corner table documents. This stays because course.Line, course.CORNERS and their
    tests are the record of exactly why, and the only way back to one yardstick if it is ever wanted again.

    A fix on the finish line keeps one metre, so that resample does not drop it as in-port noise. The forward-only search is
    widened by the silence before the fix — a boat that has not reported for a week may be a thousand miles on — and the interp
    flag rides through."""
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
    race costs one pass instead of one per race day. The start day is left out as the records leave it, and a restart starts the
    count again (a restarted boat's figures count from the restart). This is the boat's OWN record: unlike the fleet's figures
    (fleet_day), it is never filtered by whether she is moving now — a run of nought never exceeds an earlier real one, exactly
    as stats.personal_bests already has it."""
    out, best, t0 = [], (None, None), 0
    first_out = restart["first_out_at"] if restart else None
    for k in sorted(slots):
        if first_out is not None and t0 == 0 and slot_time(k) >= first_out:      # the report's own hour, the one t0_at keys on
            best, t0 = (None, None), first_out
        if slots[k]["at"] >= max(start_at + DAY, t0):
            r = run_at(slots, k, t0)
            if r is not None and (best[0] is None or r > best[0]):
                best = (r, slots[k]["at"])
        out.append(best)
    return out

def prepare(fixes, start_at, ended_at=None, ended_how=None, fill=False):
    """Everything one boat needs for a whole race, computed once: her fixes cut at the documented end (for a past fleet also
    filled to the grid), the fixes she really sent, the slots, the restart (read off those reported fixes, and only inside NOR
    C.1.2's seven days), the miles sailed as a running sum and the best run at every slot. compute() calls this once per boat;
    each race day then costs a lookup. Every fleet keeps YB's own distance to finish, whatever year it sailed, and nothing here
    invents one.

    fill True is the whole of what a past fleet gets that this year's does not: the 4-hour grid is filled where the boat reported
    around a slot but not on it (fill_slots), and a fix YB gave NO distance to finish is kept for its position instead of being
    dropped as in-port noise (grid.resample's keep_without_dtf). fill False is this year's fleet, whose grid is the live site's —
    no slot of 2026 is ever filled and no fix of 2026 without a distance is ever kept, or this page and the live pages would
    disagree about which reports a boat made."""
    fx = cut(sorted(fixes, key=lambda f: f["at"]), ended_at)
    if fill:
        fx = fill_slots(fx)
    slots = resample(fx, start_at, keep_without_dtf=fill)
    ks = sorted(slots)
    cum = [0.0]
    for a, b in zip(ks, ks[1:]):
        cum.append(cum[-1] + gc_nm(slots[a]["lat"], slots[a]["lon"], slots[b]["lat"], slots[b]["lon"]))
    real = [f for f in fx if not f.get("interp")]                        # the restart is read off what the tracker sent, never off a filled slot
    restart = detect_restart(real, start_at)
    if restart and restart["first_out_at"] > start_at + RESTART_WINDOW_S:
        restart = None                                                   # a finisher coming home is not a boat starting again
    return {"fixes": fx, "real": real, "real_ats": [f["at"] for f in real], "slots": slots, "ks": ks, "ats": [slots[k]["at"] for k in ks],
            "cum": cum, "restart": restart, "best": running_best(slots, start_at, restart), "ended_at": ended_at, "ended_how": ended_how,
            "filled": sum(1 for f in slots.values() if f.get("interp"))}

def past_slots(fixes, start_at, ended_at):
    """The slots a past boat's figures are built on, so that the wind import fetches the model wind at exactly the times the legs
    use. It IS prepare's own pipeline for a past fleet, called rather than spelt again: written twice, the two drift apart and
    the archive is asked for a slot the page has no leg at, or not asked for one it has. The slots YB gave no distance to finish
    are in it: the boat sailed those legs and the page shows their wind, whatever her distance to home was."""
    return prepare(fixes, start_at, ended_at, fill=True)["slots"]

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
    is not taken away when her race ends. position_text is stats.position_text on whatever lat/lon the row carries, formatted once
    here so that no page ever rounds a position itself. stopped: her own 4-hour leg ending at this report reads under
    perf.STOPPED_KN (perf.sailing) — a fact about this one report, used to leave her out of the FLEET's figures (fleet_day) while
    it holds; her own run24_nm and best24_nm on this row are never zeroed by it. The default row — no leg to test: before racing
    starts, or a report she missed entirely — reads stopped=False, on purpose, not an oversight: it is a fact about a leg, and
    there is no leg to read. It costs the fleet's figures nothing either way, since a row with no leg carries no run to leave in
    or out, and the fleet's best run so far reads every row's record whatever this flag says."""
    ended = boat["ended_at"] is not None and boat["ended_at"] <= T
    finished = ended and boat["ended_how"] == "finished"
    k, t0 = slot_of(T), t0_at(boat, T)
    best = best_so_far(boat, k)
    row = {"race_day": race_day_of(T, start_at), "as_of": T, "racing": T >= start_at and not ended, "finished": finished, "fresh": False,
           "fix_at": None, "lat": None, "lon": None, "position_text": None, "togo_nm": None, "mg_nm": None, "sailed_nm": None,
           "run24_nm": None, "best24_nm": best[0], "best24_at": best[1], "place": None, "restarted": t0 > 0, "ended_at": boat["ended_at"],
           "stopped": False}
    i = bisect.bisect_right(boat["real_ats"], T + SLOT_TOL_S) - 1
    if i >= 0 and boat["real"][i]["at"] >= start_at:                     # never a position from before the gun, as resample has it
        row.update(fix_at=boat["real"][i]["at"], lat=boat["real"][i]["lat"], lon=boat["real"][i]["lon"],
                    position_text=position_text(boat["real"][i]["lat"], boat["real"][i]["lon"]))
    if finished:
        row.update(togo_nm=0.0, mg_nm=course_nm)
    f = boat["slots"].get(k) if row["racing"] else None
    if f is None or f.get("interp"):
        return row
    togo = f["dtf"] / 1852.0 if f.get("dtf") else None                   # YB gave this report no distance: blank, never guessed
    w4 = window(boat["slots"], k, 1, t0, strict=True)
    row.update(fresh=True, fix_at=f["at"], lat=f["lat"], lon=f["lon"], position_text=position_text(f["lat"], f["lon"]),
               togo_nm=togo, mg_nm=None if togo is None else course_nm - togo, sailed_nm=_sailed(boat, k, t0),
               run24_nm=run_at(boat["slots"], k, t0), stopped=w4 is not None and not perf.sailing([w4]))
    return row

def _order(r):
    return r["togo_nm"], r["ended_at"] if r["finished"] else 0        # two boats home are both at nought: the first one home is first

def assign_places(rows):
    """Place among the boats with a fix at the report and the boats already home, by distance to finish unrounded (a tie broken by
    file order was a fault of the mock-up). A finisher is at nought and so ahead of everyone still at sea, in the order she
    finished in: the leader of the day and place 1 are then the same boat. A boat whose report YB gave no distance to finish has
    NO place: she is somewhere on the water and the page says so, but where she stands in the fleet is not a thing anyone
    measured, and the boats around her keep the places they really held."""
    ranked = (r for r in rows.values() if (r["fresh"] and r["togo_nm"] is not None) or r["finished"])
    for i, r in enumerate(sorted(ranked, key=_order)):
        r["place"] = i + 1
    return rows

def day_legs(slots, T, t0=0):
    """The six 4-hour legs of the 24 hours to the report at T that have a fix at both ends: {end_at, cmg_deg, speed_kn}, for the
    wind. Two consecutive slots may stand 3 h 20 min to 4 h 40 min apart, each fix being up to 20 minutes off its own hour;
    perf.all_legs calls a leg a leg only between 3.5 and 4.5 hours, and the wind bands use that same gate so that no leg counts
    here and not there. speed_kn rides along so that wind_day can leave out a leg the boat spent not moving (perf.sailing)."""
    k, out = slot_of(T), []
    for j in range(k - 5, k + 1):
        a, b = slots.get(j - 1), slots.get(j)
        if a and b and a["at"] >= t0 and 3.5 <= (b["at"] - a["at"]) / 3600.0 <= 4.5:
            h = (b["at"] - a["at"]) / 3600.0
            out.append({"end_at": slot_time(j), "cmg_deg": bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"]),
                        "speed_kn": gc_nm(a["lat"], a["lon"], b["lat"], b["lon"]) / h})
    return out

def wind_day(legs_by_team, winds):
    """winds: {team_id: {slot end time: (kt, the direction the wind blows FROM)}}. The site's own bands (perf.point_of_sail):
    upwind under 60°, reaching to 130°, running beyond, by the course made good over the leg, which is not the boat's heading.
    A leg the boat spent not moving (perf.sailing, perf.STOPPED_KN) is left out first, exactly as perf.wind_stats does it for the
    live pages: its course made good is the bearing between two pieces of tracker noise, and classing it invents a direction."""
    kts, bands = [], {"upwind": 0, "reaching": 0, "running": 0}
    for tid, legs in legs_by_team.items():
        for l in perf.sailing(legs):
            w = winds.get(tid, {}).get(l["end_at"])
            if not w or w[0] is None or w[1] is None:
                continue
            kts.append(w[0]); bands[perf.point_of_sail(w[1], l["cmg_deg"])] += 1
    return {"wind_kt": statistics.mean(kts) if kts else None, "wind_legs": len(kts),
            "legs_upwind": bands["upwind"], "legs_reaching": bands["reaching"], "legs_running": bands["running"]}

def fleet_day(rows, T, start_at, wind):
    """The fleet's row for the report at T. Leader, middle and last over the boats with a fix at the report plus the boats already
    home at the course's length; the runs and the DAY's best run over the boats that were MOVING at this report (row['stopped'],
    perf.STOPPED_KN via boat_day): a boat lying in port is racing by the record, but a leg she did not sail is not sailing, and is
    left out of the fleet's figures for exactly the reports where she lies there — never for the rest of the race, and never from
    her own row. The race's best run SO FAR is not one of those figures: it is a record of what has happened, so a run set while
    sailing stands whether or not the boat is moving today (the owner's rule, 19 Sep 2026, after the audit found best_sofar_nm
    falling on 2022 race day 192 because the holder lay becalmed at that report); a "run" set while NOT moving is a tracker
    wandering at a mooring, which never exceeds a real one and so cannot become the record either. straight_pct leaves out a
    restarted boat: her miles sailed count from the restart and her miles made good from the gun, and the ratio means nothing.

    A boat whose report YB gave no distance to finish is counted as RACING and as FRESH — she is in the race and she reported —
    and her run is a real run, read off two positions, so she stays in the runs and can hold the day's best. She is out of the
    leader, the middle and the last, every one of which is miles made good: those are read off a distance nobody measured, and
    the page shows the fleet that has one rather than a fleet with a figure of ours in it."""
    racing = [(t, r) for t, r in rows.items() if r["racing"]]
    finished = [(t, r) for t, r in rows.items() if r["finished"]]
    fresh = [(t, r) for t, r in racing if r["fresh"]]
    inset = [(t, r) for t, r in fresh + finished if r["mg_nm"] is not None]
    mgs = sorted((r["mg_nm"] for _, r in inset), reverse=True)
    lead = min(inset, key=lambda tr: _order(tr[1]), default=None)
    sailing = [(t, r) for t, r in fresh if r["run24_nm"] is not None and not r["stopped"]]
    best = max(sailing, key=lambda tr: tr[1]["run24_nm"], default=None)
    sofar = max(((t, r) for t, r in rows.items() if r["best24_nm"] is not None),        # a record stands whether or not she moves today
                key=lambda tr: tr[1]["best24_nm"], default=None)
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

def crossings(fixes, start_at, ended_how, ended_at, splits, milestones, until=None):
    """{milestone: the time it was passed}. A latitude is crossed SOUTHBOUND and a longitude EASTBOUND, and only the FIRST such
    crossing counts: the return across the equator months later does not overwrite the outward one, and a boat that rounded the
    Cape of Good Hope's longitude and then turned back to Cape Town keeps the crossing she made. Each is interpolated between the
    two fixes either side and counts only where the milestone's own guard holds. Those three — the equator, the Cape of Good Hope,
    Cape Horn — need no course at all and mean the same thing in every year, which is why they are the page's strongest comparison.

    A GATE of the race (Lanzarote, Hobart) is THAT RACE'S OWN YB SPLIT TIME, read from `splits` ({YB's checkpoint index in its
    zegments file: the time YB timed this boat through it}, db.load_splits — the same index for the same gate in all three races,
    620 off Lanzarote and 2411 at Hobart, and no offset into any course's nodes) — the race's own record of its own water, never a
    threshold on a distance measured on somebody else's course. A gate with no split row is BLANK, with the reason in the page's
    words: 2018 has no Lanzarote split in YB's record although the race had the gate. A split later than the boat's documented end
    is not hers (Gregor McGuckin's 2018 tracker went through YB's 1903 gate three weeks after the dismasting, under tow — not a
    gate this table reads, but the same tracker goes on sending through the ones it does).

    The finish is the documented one. Nothing after the page's own clock: until is the report of the last day computed, None for a
    race long finished."""
    out = {}
    fx = [f for f in fixes if f["at"] >= start_at and (until is None or f["at"] <= until + SLOT_TOL_S)]
    late = lambda t: until is not None and t > until
    for name, kind, value, guard in milestones:
        if kind == "finish":
            if ended_how == "finished" and ended_at is not None and not late(ended_at):
                out[name] = ended_at
            continue
        if kind == "split":
            t = splits.get(value)
            if t is not None and t >= start_at and (ended_at is None or t <= ended_at) and not late(t):
                out[name] = t
            continue
        for p, q in zip(fx, fx[1:]):
            if kind == "lat":
                hit = p["lat"] > value >= q["lat"]
                frac = (value - p["lat"]) / (q["lat"] - p["lat"]) if hit else 0.0
            else:
                east, ahead = _wrap(q["lon"] - p["lon"]), _wrap(value - p["lon"])   # the short way round: +179 to -179 is two degrees EAST
                hit = east > 0 and 0 < ahead <= east                                # -179 to +179 is two degrees west and crosses nothing eastbound
                frac = ahead / east if hit else 0.0
            if hit and guard(q["lat"], q["lon"]):
                t = p["at"] + frac * (q["at"] - p["at"])
                if not late(t):
                    out[name] = t
                break
    return out

def compute(fixes_by_team, ends, start_at, course_nm, days, winds, fill, milestones=None, splits=None, until=None):
    """Everything the page needs for one race: fixes_by_team {team_id: fixes}, carrying YB's OWN distance to finish for this race;
    ends {team_id: {ended_at, ended_how}} (empty for a race still running); course_nm THIS race's own course length, which is what
    miles made good are counted against; days: the race days to (re)compute; winds as wind_day takes; fill True for a past fleet,
    whose three-hourly week the 4-hour grid would otherwise miss (fill_slots), False for this year's, whose grid is the live
    site's; splits {team_id: {checkpoint index: time}} as crossings reads them, None for no milestones this run.

    No fix is measured on another year's course. The three courses differ by 903 nm and the page says so in words; what is
    compared straight across is the race DAY, and the geographic crossings, which need no course at all.

    notes says what the rules of a past fleet added and left out, for the run's log: filled_slots, the slots fill_slots supplied;
    stopped_legs, the boat-days whose report's own 4-hour leg read under perf.STOPPED_KN (not moving) and so left the fleet's
    mean, best-of-day and wind bands for that report (never the best so far: a record stands); interp_reports, the boat-days whose
    own report was a filled slot and are therefore not fresh; unmeasured_boat_days {team_id: n}, the boat-days that show a
    position but no distance to finish because YB's record gives none, which is what the page's "Read with care" names."""
    from . import editions_data
    milestones = editions_data.MILESTONES if milestones is None else milestones
    boats = {tid: prepare(fx, start_at, ends.get(tid, {}).get("ended_at"), ends.get(tid, {}).get("ended_how"), fill)
             for tid, fx in fixes_by_team.items()}
    dz, stopped_legs, interp, out = day_zero(start_at), 0, 0, {"days": [], "boat_days": [], "milestones": [], "notes": {}}
    blank = {}
    for d in days:
        T = dz + d * DAY
        rows = {tid: dict(boat_day(b, start_at, T, course_nm), team_id=tid) for tid, b in boats.items()}
        assign_places(rows)
        stopped_legs += sum(1 for r in rows.values() if r["stopped"])
        for tid, r in rows.items():
            if r["fresh"] and r["togo_nm"] is None:
                blank[tid] = blank.get(tid, 0) + 1                        # a position YB gave, a distance YB did not
        interp += sum(1 for tid, b in boats.items() if rows[tid]["racing"] and (b["slots"].get(slot_of(T)) or {}).get("interp"))
        legs = {tid: day_legs(b["slots"], T, t0_at(b, T)) for tid, b in boats.items() if rows[tid]["racing"]}
        out["days"].append(fleet_day(rows, T, start_at, wind_day(legs, winds) if winds else None))
        out["boat_days"].extend(rows.values())
    if splits is not None:
        for tid, b in boats.items():
            for name, t in crossings(b["fixes"], start_at, b["ended_how"], b["ended_at"], splits.get(tid, {}), milestones, until).items():
                out["milestones"].append({"team_id": tid, "milestone": name, "passed_at": int(t), "race_day": race_day_of(t, start_at)})
    out["notes"] = {"filled_slots": sum(b["filled"] for b in boats.values()), "stopped_legs": stopped_legs, "interp_reports": interp,
                    "unmeasured_boat_days": blank}
    return out
