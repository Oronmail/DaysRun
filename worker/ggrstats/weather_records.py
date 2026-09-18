# worker/ggrstats/weather_records.py
"""The weather boards on the Records page: the weather each boat MET according to the model (Open-Meteo at the boat's report
position: never a measurement, never an achievement), per window. Three kinds, each one row per boat ranked across the fleet
so that the page can draw both its board (the first five) and its personal table (everyone):
  wind  — the strongest model wind (mean) at a report, with the gust at that same report stored beside it as kind "gust";
  wave  — the highest significant wave height at a report;
  calm  — the longest spell of consecutive 4-hour reports under CALM_KT, in hours, `at` = the spell's first report.
A spell needs two reports; a missed report ends it; an off-hour row (a fast tracker) is ignored, so a spell counts reports, not fixes."""
from .grid import slot_of, slot_time, SLOT_TOL_S

DAY = 86400
CALM_KT = 6.0
WINDOWS = (("7d", 7 * DAY), ("30d", 30 * DAY), ("race", None))

def _by_slot(rows):
    """{slot time: row} with the row nearest the report hour, within the grid's tolerance."""
    out, off = {}, {}
    for r in rows:
        if r.get("wind_kn") is None:
            continue
        k = slot_time(slot_of(r["at"])); d = abs(r["at"] - k)
        if d <= SLOT_TOL_S and (k not in off or d < off[k]):
            out[k], off[k] = r, d
    return out

def _calm_spells(slots):
    """[(hours, first report time)] for every run of consecutive reports (4 h apart) under CALM_KT with at least two reports."""
    spells, run = [], []
    for k in sorted(slots):
        calm = slots[k]["wind_kn"] < CALM_KT
        if calm and run and k - run[-1] == 4 * 3600:
            run.append(k)
        else:
            if len(run) >= 2:
                spells.append((4.0 * len(run), run[0]))
            run = [k] if calm else []
    if len(run) >= 2:
        spells.append((4.0 * len(run), run[0]))
    return spells

def compute(cond_by_team, T):
    """cond_by_team: {team_id: [{at, wind_kn, gust_kn, wave_m}, ...]}. Returns record rows {kind, win, rank, team_id, value, at}."""
    records = []
    for win, span in WINDOWS:
        since = T - span if span else 0
        bests = {"wind": [], "gust": [], "wave": [], "calm": []}
        for tid, rows in cond_by_team.items():
            slots = {k: r for k, r in _by_slot(rows).items() if k >= since and k <= T + SLOT_TOL_S}
            if not slots:
                continue
            k_wind = max(sorted(slots), key=lambda k: slots[k]["wind_kn"])          # the first of equals
            bests["wind"].append((slots[k_wind]["wind_kn"], k_wind, tid)); bests["gust"].append((slots[k_wind].get("gust_kn"), k_wind, tid))
            waves = [k for k in sorted(slots) if slots[k].get("wave_m") is not None]
            if waves:
                k_wave = max(waves, key=lambda k: slots[k]["wave_m"]); bests["wave"].append((slots[k_wave]["wave_m"], k_wave, tid))
            spells = _calm_spells(slots)
            if spells:
                hours, at = max(spells, key=lambda s: (s[0], -s[1])); bests["calm"].append((hours, at, tid))
        order = sorted(range(len(bests["wind"])), key=lambda i: (-bests["wind"][i][0], bests["wind"][i][1]))
        for rank, i in enumerate(order, 1):
            v, at, tid = bests["wind"][i]; records.append({"kind": "wind", "win": win, "rank": rank, "team_id": tid, "value": v, "at": at})
            g, _, _ = bests["gust"][i]
            if g is not None:
                records.append({"kind": "gust", "win": win, "rank": rank, "team_id": tid, "value": g, "at": at})
        for kind in ("wave", "calm"):
            for rank, (v, at, tid) in enumerate(sorted(bests[kind], key=lambda b: (-b[0], b[1])), 1):
                records.append({"kind": kind, "win": win, "rank": rank, "team_id": tid, "value": v, "at": at})
    return records
