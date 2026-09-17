# worker/ggrstats/perf.py
"""The angles YB's leaderboard does not give: how a boat sails rather than where it is. Pure functions on plain dicts.

Wind is Open-Meteo MODEL wind at the boat's report position, not measured on board, and the boat's direction is its course
made good over a 4-hour leg, not its heading. Point of sail is therefore approximate; it is good enough to separate upwind
work from running, which is what it is used for."""
import math, statistics
from .grid import resample, gc_nm, bearing_deg, SLOT_S, slot_time

DAY = 86400
BANDS = ("upwind", "reaching", "running")
COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")

def all_legs(fixes, start_at, t0=0, until=None):
    """Every clean 4-hour leg since the start (two consecutive reports, 3.5–4.5 h apart), oldest first. Legs before a
    restart (t0) and on the start day are left out, as for the records."""
    slots = resample(fixes, start_at)
    out = []
    for k in sorted(slots):
        a, b = slots.get(k - 1), slots[k]
        if not a or a["at"] < max(t0, start_at + DAY) or (until is not None and b["at"] > until + 1200):
            continue
        h = (b["at"] - a["at"]) / 3600.0
        if 3.5 <= h <= 4.5:
            out.append({"end_at": slot_time(k), "start_at": slot_time(k - 1), "speed_kn": gc_nm(a["lat"], a["lon"], b["lat"], b["lon"]) / h,
                        "cmg_deg": bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"]), "lon": (a["lon"] + b["lon"]) / 2})
    return out

def point_of_sail(wind_from_deg, cmg_deg):
    twa = abs(((wind_from_deg - cmg_deg + 180) % 360) - 180)          # 0 = wind dead ahead of the course made good, 180 = dead astern
    return "upwind" if twa < 60 else "reaching" if twa < 130 else "running"

def wind_stats(legs, wind_by_slot, lo=8.0, hi=25.0, min_legs=10):
    """wind_by_slot: {slot end time: (wind_kn, wind_from_deg)}. Speed for the wind = mean of leg speed / model wind speed over
    legs sailed in lo–hi knots (below that a heavy boat barely moves, above it she is reefed: neither says much about efficiency)."""
    ratios, bands = [], {b: [] for b in BANDS}
    for l in legs:
        w = wind_by_slot.get(l["end_at"])
        if not w or w[0] is None or w[1] is None:
            continue
        bands[point_of_sail(w[1], l["cmg_deg"])].append((l["speed_kn"], w[0]))
        if lo <= w[0] <= hi:
            ratios.append(l["speed_kn"] / w[0])
    n = sum(len(v) for v in bands.values())
    pos = {b: {"legs": len(v), "share": len(v) / n, "speed_kn": statistics.mean(s for s, _ in v), "wind_kn": statistics.mean(w for _, w in v)}
           for b, v in bands.items() if v}
    return {"wind_ratio": statistics.mean(ratios) if len(ratios) >= min_legs else None, "wind_legs": len(ratios), "pos": pos}

def consistency(legs, T, days=7):
    recent = [l["speed_kn"] for l in legs if T - days * DAY < l["end_at"] <= T + 1200]
    if len(recent) < 6:
        return {"sd7": None, "share5_7": None, "parked_h7": None}
    return {"sd7": statistics.pstdev(recent), "share5_7": sum(s >= 5 for s in recent) / len(recent), "parked_h7": 4 * sum(s < 2 for s in recent)}

def night_day(legs, min_each=6):
    """Average leg speed at night minus by day. Local solar time of the leg's midpoint from the longitude; night is 2000–0600."""
    night, day = [], []
    for l in legs:
        mid = (l["start_at"] + l["end_at"]) / 2
        h = ((mid % DAY) / 3600.0 + l["lon"] / 15.0) % 24
        (night if (h >= 20 or h < 6) else day).append(l["speed_kn"])
    ok = len(night) >= min_each and len(day) >= min_each
    return {"night_delta": statistics.mean(night) - statistics.mean(day) if ok else None, "n_night": len(night), "n_day": len(day)}

def leverage(track, lat, lon):
    """Distance in nm from (lat, lon) to the nearest point of a track (list of {lat, lon}, oldest first) and the compass side the
    boat lies on, seen from that point: the tactical bet, in one number. (0.0, None) on the line; (None, None) without a track."""
    if len(track) < 2:
        return None, None
    kx = 60.0 * math.cos(math.radians(lat))                           # local flat-earth nm per degree, fine over a few hundred miles
    px, py = lon * kx, lat * 60.0
    best = None
    for a, b in zip(track, track[1:]):
        ax, ay, bx, by = a["lon"] * kx, a["lat"] * 60.0, b["lon"] * kx, b["lat"] * 60.0
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        cx, cy = ax + t * dx, ay + t * dy
        d = math.hypot(px - cx, py - cy)
        if best is None or d < best[0]:
            best = (d, cx, cy)
    d, cx, cy = best
    if d < 0.5:
        return 0.0, None
    brg = (math.degrees(math.atan2(px - cx, py - cy)) + 360.0) % 360.0
    return d, COMPASS[int((brg + 22.5) // 45) % 8]

def compute(fixes, start_at, t0, T, wind_by_slot):
    """Everything on the Performance page for one boat at T."""
    legs = all_legs(fixes, start_at, t0, until=T)
    return {**wind_stats(legs, wind_by_slot), **consistency(legs, T), **night_day(legs), "legs": len(legs)}
