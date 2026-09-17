# worker/ggrstats/stats.py
"""Everything derived from fixes. Pure functions on plain dicts; the database is handled in run.py."""
from datetime import datetime, timezone
from . import config, names
from .grid import gc_nm, resample, window, legs, slot_of, slot_time, SLOT_S

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
