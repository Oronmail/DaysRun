# worker/ggrstats/duels.py
"""The private races inside the fleet. A duel is two boats next to each other in the ranking, both with a current fix, within
DUEL_NM of each other in distance to finish. For each pair: the gap now, the gap at every 4-hour report of the last three
days (fix to fix, so a missed report is a hole in the line and never a false gain), how often the lead changed hands, when
the boat now ahead got ahead, and how far apart the two are on the water and on which side. Pure functions on plain dicts."""
import bisect, math
from .grid import gc_nm, bearing_deg, SLOT_S

DAY = 86400
DUEL_NM = 15.0
COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")

def _dtf_near(fixes, ats, t):
    """Distance to finish (nm) from the latest fix at or before t (+20 min), if that fix is less than 3.5 h old."""
    i = bisect.bisect_right(ats, t + 1200) - 1
    if i < 0 or t - fixes[i]["at"] >= 3.5 * 3600 or not fixes[i].get("dtf"):
        return None
    return fixes[i]["dtf"] / 1852.0

def find(boats, fixes_by_team, T, within_nm=DUEL_NM, days=3):
    fresh = sorted((b for b in boats if not b["stale"]), key=lambda b: b["dtf_nm"])
    out = []
    for a, b in zip(fresh, fresh[1:]):                       # a is ahead of b
        gap = b["dtf_nm"] - a["dtf_nm"]
        if gap > within_nm:
            continue
        fa, fb = fixes_by_team[a["id"]], fixes_by_team[b["id"]]
        ata, atb = [f["at"] for f in fa], [f["at"] for f in fb]
        series = []
        for t in range(T - days * DAY, T + 1, SLOT_S):
            da, db_ = _dtf_near(fa, ata, t), _dtf_near(fb, atb, t)
            if da is not None and db_ is not None:
                series.append([t, db_ - da])                 # positive: today's leader of the pair was ahead then too
        at = {t: g for t, g in series}
        changes, passed_at, prev = 0, None, 0
        for t, g in series:
            s = (g > 0) - (g < 0)
            if s and prev and s != prev:
                changes += 1
                passed_at = t if s > 0 else None             # the moment today's leader of the pair got ahead (for good, so far)
            if s:
                prev = s
        brg = bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"])
        water = gc_nm(a["lat"], a["lon"], b["lat"], b["lon"])
        out.append({"ahead_id": a["id"], "behind_id": b["id"], "gap_nm": gap, "gap24_nm": at.get(T - DAY), "gap72_nm": at.get(T - days * DAY),
                    "lead_changes": changes, "passed_at": passed_at, "water_nm": water,
                    "side": COMPASS[int((brg + 22.5) // 45) % 8] if water >= 0.5 else None, "series": series})
    return out
