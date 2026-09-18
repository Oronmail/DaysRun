# worker/ggrstats/events.py
"""Turn the difference between two snapshots into a time-ordered feed. Titles use first names only."""
from datetime import datetime, timezone
from . import course

def _d(unix):
    return datetime.fromtimestamp(unix, timezone.utc).strftime("%Y-%m-%dT%H:%M")

def _passed(mark):
    """An island, a cape or an inshore mark is rounded; a Southern Ocean waypoint, left hundreds of miles to one side, is
    passed; the Hobart Gate is a line to cross and wait behind (NOR C.1.5)."""
    if mark == "Hobart Gate":
        return "is through the Hobart Gate"
    return f"has passed the {mark} waypoint" if mark[0].isdigit() else f"has rounded {mark}"

def derive(snapshot, previous, conditions):
    T = snapshot["as_of"]
    prev = {p["team_id"]: p for p in previous}
    out = []
    def add(kind, team_id, title, body=None, page="Fleet", key=None):
        out.append({"at": T, "kind": kind, "team_id": team_id, "title": title, "body": body, "page": page,
                    "dedupe_key": key or f"{kind}:{team_id}:{_d(T)}"})
    boats = snapshot["boats"]
    if not boats:                                     # a time before the first fix
        return out
    for b in boats:
        run = round(b["w24"]["dist_nm"]) if b["w24"] else None
        was = prev.get(b["id"], {})                     # said once: when the holder changes, when a best is newly set
        if b["fleet_best24"] and run is not None and not was.get("fleet_best24"):
            add("fleet_best24", b["id"], f"{b['first']} sails the longest run of the last 24 hours: {run} nm" + (", also a personal best" if run >= round(b["best24_nm"]) else ""), page="Records")
        elif b["pb24"] and run is not None and not was.get("pb24") and not b["fleet_best24"]:
            add("pb24", b["id"], f"{b['first']} sets a personal best 24-hour run: {run} nm", page="Records")
        if b["stale"] and not prev.get(b["id"], {}).get("stale"):
            add("missed_report", b["id"], f"{b['first']}’s tracker skipped the {datetime.fromtimestamp(T, timezone.utc).strftime('%H:%M')} report",
                f"Last fix at {datetime.fromtimestamp(b['last_fix_at'], timezone.utc).strftime('%H:%M')} UTC.")
        if b["restart"] and prev and b["id"] in prev and not prev[b["id"]].get("restart_at"):
            add("restart", b["id"], f"{b['first']} restarted from Les Sables after repairs", "NOR C.1.2: race time is not reset.", key=f"restart:{b['id']}")
        # Said only when the next mark moves forward along the course: two snapshots derived by different rules, or a
        # course amended by the race (NOR C.1.4), must never read as a mark un-rounded or a later one rounded.
        was_mark = prev.get(b["id"], {}).get("next_mark")
        if was_mark and -1 < course.order(was_mark) < course.order(b["next_mark"]):
            add("next_mark", b["id"], f"{b['first']} {_passed(was_mark)}", page="Course & sprints")
    # A place gained or lost against a boat with an older fix is not a move (audit N6). The snapshot's rank_change already says
    # so at its source (stats.place_changes): places gained among the boats with a current fix now AND 24 hours ago, None otherwise.
    fresh = [b for b in boats if b.get("rank_change") is not None and not b.get("stale")]
    gained = {b["id"]: b["rank_change"] for b in fresh}
    if any(gained.values()):
        # The feed prints titles, so the title names who moved and by how much, grouped like the table's arrows:
        # "Places, last 24 hours: ▲2 Louis · ▲1 Ertan, Henry · ▼1 Mara". The same line is stored once a day.
        groups = {}
        for b in sorted(fresh, key=lambda b: b["rank"]):
            if gained[b["id"]]:
                groups.setdefault(gained[b["id"]], []).append(b["first"])
        text = " · ".join(f"{'▲' if n > 0 else '▼'}{abs(n)} {', '.join(who)}" for n, who in sorted(groups.items(), key=lambda kv: -kv[0]))
        add("moves", None, f"Places, last 24 hours: {text}", "A place gained against a boat that missed the report is not counted.", key=f"moves:{_d(T)[:10]}:{text}")
    # Duels (duels.py): a pass inside a duel, said once — the key is the moment of the pass, not the report that saw it; and a
    # chase that has closed to within 5 nm, said once a day per pair.
    who = {b["id"]: b["first"] for b in boats}
    # In the first three days the whole fleet is within a few miles and places swap at every report: nothing to say yet.
    for d in (snapshot.get("duels", []) if snapshot.get("race_day", 99) >= 3 else []):
        a, c = who.get(d["ahead_id"]), who.get(d["behind_id"])
        if not a or not c:
            continue
        was = d.get("gap72_nm")
        if d.get("passed_at") and d["passed_at"] >= T - 12 * 3600:
            if d["gap_nm"] < 2:                      # level, inside the noise of two fixes: said when she is two miles clear
                continue
            tail = f", after trailing by {round(-was)} nm three days ago" if was is not None and was <= -5 else ""
            add("pass", d["ahead_id"], f"{a} passes {c} and leads by {round(d['gap_nm'])} nm{tail}", page="Fleet", key=f"pass:{d['ahead_id']}:{d['behind_id']}:{d['passed_at']}")
        elif d["gap_nm"] <= 5 and was is not None and was - d["gap_nm"] >= 10:
            add("duel", d["behind_id"], f"{c} has closed to {max(1, round(d['gap_nm']))} nm behind {a}, from {round(was)} nm three days ago", page="Fleet", key=f"duel:{d['ahead_id']}:{d['behind_id']}:{_d(T)[:10]}")
    lead = boats[0]
    if lead["next_mark_nm"] is not None and lead["next_mark_nm"] < 100 and lead["next_mark_eta"]:
        add("next_mark", lead["id"], f"{lead['first']} is {round(lead['next_mark_nm'])} nm from {lead['next_mark']}, due about {datetime.fromtimestamp(lead['next_mark_eta'], timezone.utc).strftime('%H:%M')} UTC", page="Course & sprints", key=f"next_mark:{lead['id']}:{_d(T)}")
    first = {b["id"]: b["first"] for b in boats}
    for c in conditions:
        if c["wind_kn"] is not None and c["wind_kn"] >= 34 and c["team_id"] in first:
            add("gale", c["team_id"], f"{first[c['team_id']]} is in gale-force wind: {round(c['wind_kn'])} kt" + (f", gusts {round(c['gust_kn'])}" if c.get("gust_kn") is not None else ""), "Model value from Open-Meteo, not measured on board.", page="Conditions")
    return out
