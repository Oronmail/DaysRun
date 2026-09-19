# worker/ggrstats/grid.py
"""The 4-hour grid: resampling, legs, windows, geodesy. Distances in nautical miles, times in Unix seconds UTC."""
import math

SLOT_S = 4 * 3600
SLOT_TOL_S = 20 * 60
R_NM = 3440.065

def gc_nm(lat1, lon1, lat2, lon2):
    p1, l1, p2, l2 = map(math.radians, (lat1, lon1, lat2, lon2))
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2
    return 2 * R_NM * math.asin(math.sqrt(a))

def bearing_deg(lat1, lon1, lat2, lon2):
    p1, l1, p2, l2 = map(math.radians, (lat1, lon1, lat2, lon2))
    y = math.sin(l2 - l1) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(l2 - l1)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

def slot_of(at):
    return round(at / SLOT_S)

def slot_time(k):
    return k * SLOT_S

def resample(fixes, start_at, keep_without_dtf=False):
    """{slot_index: fix}: per 4-hour boundary, the fix NEAREST the boundary within ±20 min.
    Fixes before start_at, and fixes with dtf 0 (in-port tracker noise on the first days), are dropped.

    keep_without_dtf: keep the second kind. Only the PAST-races path passes it (editions.prepare's `fill`), and only because
    YB's record of a past race can stop giving a distance while the boat is plainly still sailing — it gives Mark Slats none for
    the last month of 2018, mid-Atlantic. The position of such a fix is YB's and is true, so the boat keeps her legs, her runs
    and her miles sailed; everything counted off a distance stays blank (editions.boat_day). This year's fleet never passes it:
    its figures must equal YB's own, and a fix of 2026 without a distance really is a tracker on a quay."""
    out = {}
    for f in sorted(fixes, key=lambda f: f["at"]):
        if f["at"] < start_at or (not keep_without_dtf and not f.get("dtf")):
            continue
        k = slot_of(f["at"])
        off = abs(f["at"] - slot_time(k))
        if off <= SLOT_TOL_S and (k not in out or off < abs(out[k]["at"] - slot_time(k))):
            out[k] = f
    return out

def _stats(first, last, dist):
    # Distance sailed, speed and course made good are positions and are always there. Miles made good and VMG are read off the
    # distance to finish, so an end without one leaves both blank rather than nought: a window whose ends YB never measured has
    # no made-good at all (resample keeps such a fix only for a past fleet, see above).
    mg = (first["dtf"] - last["dtf"]) / 1852.0 if first.get("dtf") and last.get("dtf") else None
    hours = (last["at"] - first["at"]) / 3600.0
    return {"start_at": first["at"], "end_at": last["at"], "hours": hours, "dist_nm": dist, "made_good_nm": mg,
            "speed_kn": dist / hours if hours > 0 else 0.0, "vmg_kn": (mg / hours if hours > 0 else 0.0) if mg is not None else None,
            "cmg_deg": bearing_deg(first["lat"], first["lon"], last["lat"], last["lon"])}

def window(slots, k_end, n_slots, t0=0, strict=False):
    """Along-track window over the last n_slots slots ending at k_end; only fixes at/after t0 count (t0 = restart).
    Display mode (strict=False): a window with fewer than two fixes widens by up to three slots; any window missing a
    slot is marked bridged. Record mode (strict=True): every slot from k_end-n_slots to k_end must be present, else None."""
    extra = 0
    while True:
        ks = [k for k in sorted(slots) if k_end - n_slots - extra <= k <= k_end and slots[k]["at"] >= t0]
        if len(ks) >= 2 or extra >= 3:
            break
        extra += 1
    if len(ks) < 2:
        return None
    if strict and (extra > 0 or len(ks) < n_slots + 1):
        return None
    dist = sum(gc_nm(slots[a]["lat"], slots[a]["lon"], slots[b]["lat"], slots[b]["lon"]) for a, b in zip(ks, ks[1:]))
    w = _stats(slots[ks[0]], slots[ks[-1]], dist)
    w["bridged"] = extra > 0 or len(ks) < n_slots + 1
    return w

def legs(slots, k_end, n=42, t0=0):
    """One entry per slot for the last n slots ending at k_end (the 7-day speed log). dist_nm is None when either
    end of the leg is missing or before t0."""
    out = []
    for k in range(k_end - n + 1, k_end + 1):
        a, b = slots.get(k - 1), slots.get(k)
        if a and b and a["at"] >= t0:
            dist = gc_nm(a["lat"], a["lon"], b["lat"], b["lon"])
            s = _stats(a, b, dist)
            s.update({"end_slot": slot_time(k), "bridged": False})
            out.append(s)
        else:
            out.append({"end_slot": slot_time(k), "start_at": None, "end_at": None, "hours": None, "dist_nm": None,
                        "made_good_nm": None, "speed_kn": None, "vmg_kn": None, "cmg_deg": None, "bridged": False})
    return out
