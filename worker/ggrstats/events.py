# worker/ggrstats/events.py
"""Turn the difference between two snapshots into a time-ordered feed. Titles use first names only."""
from datetime import datetime, timezone

def _d(unix):
    return datetime.fromtimestamp(unix, timezone.utc).strftime("%Y-%m-%dT%H:%M")

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
            add("missed_report", b["id"], f"{b['first']}’s tracker skipped the {datetime.fromtimestamp(T, timezone.utc).strftime('%H%M')} report",
                f"Last fix at {datetime.fromtimestamp(b['last_fix_at'], timezone.utc).strftime('%H%M')} UTC.")
        if b["restart"] and prev and b["id"] in prev and not prev[b["id"]].get("restart_at"):
            add("restart", b["id"], f"{b['first']} restarted from Les Sables after repairs", "NOR C.1.2: race time is not reset.", key=f"restart:{b['id']}")
        if prev.get(b["id"]) and prev[b["id"]].get("next_mark") != b["next_mark"] and prev[b["id"]].get("next_mark"):
            add("next_mark", b["id"], f"{b['first']} has rounded {prev[b['id']]['next_mark']}", page="Course & sprints")
    # A place gained or lost against a boat with an older fix is not a move (audit N6): compare the order now with the
    # order 24 hours ago among the boats that have a current fix. rank_change = rank then − rank now.
    stale_ids = set((snapshot.get("fleet") or {}).get("stale_ids", []))
    fresh = [b for b in boats if b["id"] not in stale_ids]
    now_pos = {b["id"]: i for i, b in enumerate(sorted(fresh, key=lambda b: b["rank"]))}
    then_pos = {b["id"]: i for i, b in enumerate(sorted(fresh, key=lambda b: b["rank"] + b["rank_change"]))}
    gained = {b["id"]: then_pos[b["id"]] - now_pos[b["id"]] for b in fresh}
    if any(gained.values()):
        # The feed prints titles, so the title names who moved and by how much, grouped like the table's arrows:
        # "Places, last 24 hours: ▲2 Louis · ▲1 Ertan, Henry · ▼1 Mara". The same line is stored once a day.
        groups = {}
        for b in sorted(fresh, key=lambda b: b["rank"]):
            if gained[b["id"]]:
                groups.setdefault(gained[b["id"]], []).append(b["first"])
        text = " · ".join(f"{'▲' if n > 0 else '▼'}{abs(n)} {', '.join(who)}" for n, who in sorted(groups.items(), key=lambda kv: -kv[0]))
        add("moves", None, f"Places, last 24 hours: {text}", "A place gained against a boat that missed the report is not counted.", key=f"moves:{_d(T)[:10]}:{text}")
    lead = boats[0]
    if lead["next_mark_nm"] is not None and lead["next_mark_nm"] < 100 and lead["next_mark_eta"]:
        add("next_mark", lead["id"], f"{lead['first']} is {round(lead['next_mark_nm'])} nm from {lead['next_mark']}, due about {datetime.fromtimestamp(lead['next_mark_eta'], timezone.utc).strftime('%H%M')} UTC", page="Course & sprints", key=f"next_mark:{lead['id']}:{_d(T)}")
    first = {b["id"]: b["first"] for b in boats}
    for c in conditions:
        if c["wind_kn"] is not None and c["wind_kn"] >= 34 and c["team_id"] in first:
            add("gale", c["team_id"], f"{first[c['team_id']]} is in gale-force wind: {round(c['wind_kn'])} kt" + (f", gusts {round(c['gust_kn'])}" if c.get("gust_kn") is not None else ""), "Model value from Open-Meteo, not measured on board.", page="Conditions")
    return out
