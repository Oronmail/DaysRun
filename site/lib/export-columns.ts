// site/lib/export-columns.ts — every column of the data files, once: its heading (a machine name that carries its unit and never
// changes during the race), its unit, what it means, the sheets it appears on, and how its value is made from a row of the
// database view `export_report`. The workbook and the Data page both read this list, so they cannot drift apart.
// Rules held by tests: a boat without a current fix keeps her place and her last position WITH its true time, and every column
// about the last 24 hours or 7 days is blank for her; a blank is never a zero; numbers are rounded here, once.
import { raceDayOf } from "./export";

export type ExportRaw = {
  as_of: string; team_id: number; closes_day: boolean; skipper: string; yacht: string | null; design: string | null; country: string | null;
  rank: number; rank_change: number | null; dtf_nm: number; gap_nm: number | null; interval_nm: number | null; last_fix_at: string; stale: boolean; lat: number; lon: number;
  spd24: number | null; run24_nm: number | null; spd7: number | null; run7_nm: number | null; vmg7_kn: number | null; sailed_nm: number | null; made_good_nm: number | null;
  best4_kn: number | null; best24_nm: number | null; best24_at: string | null; best7_nm: number | null; pb24: boolean | null; fleet_best24: boolean | null;
  vs_vdh_nm: number | null; vs_kirsten_nm: number | null; next_mark: string | null; next_mark_nm: number | null; next_mark_eta: string | null; restart_at: string | null;
  gain24_nm: number | null; vs_near_nm: number | null; near_n: number | null; lever_nm: number | null; lever_dir: string | null;
  wind_ratio: number | null; wind_legs: number | null; sd7: number | null; share5_7: number | null; parked_h7: number | null; night_delta: number | null;
  leg_nm: number | null; leg_kn: number | null; leg_vmg_kn: number | null; leg_cmg_deg: number | null;
  wind_kn: number | null; gust_kn: number | null; wind_dir_deg: number | null; mslp_hpa: number | null; wave_m: number | null; swell_m: number | null; swell_period_s: number | null; current_kn: number | null; current_dir_deg: number | null; sst_c: number | null;
  leg1_kn: number | null; leg2_kn: number | null; leg3_kn: number | null; leg4_kn: number | null; leg5_kn: number | null; leg6_kn: number | null; legs_complete: number | null; run24_bridged: boolean;
  start_lat: number | null; start_lon: number | null; start_dtf_nm: number | null;
  wind_mean_kn: number | null; wind_max_kn: number | null; wind_reports: number | null;
};
export type Sheet = "standing" | "daily" | "reports";
export type Cell = string | number | boolean | Date | null;
export type Column = { key: string; unit: string; meaning: string; sheets: Sheet[]; kind?: "time" | "date" | "degrees"; width?: number; value: (r: ExportRaw, startIso: string) => Cell };

// Round once, here. Not a number → blank (never 0); a rounded −0.04 is 0, not −0.
export const rd = (v: number | null | undefined, places: number): number | null => {
  if (v == null || !Number.isFinite(v)) return null;
  const p = 10 ** places; return Math.round(v * p) / p || 0;
};
const time = (iso: string | null): Date | null => (iso ? new Date(iso) : null);
const cur = (r: ExportRaw) => !r.stale;
const ifCur = <T,>(r: ExportRaw, v: T): T | null => (cur(r) ? v : null);
const sailedDay = (r: ExportRaw) => new Date(Date.parse(r.as_of) - 1000).toISOString().slice(0, 10);   // 00:00 on 1 Oct closes 30 Sep
const madeGood24 = (r: ExportRaw) => (cur(r) && r.start_dtf_nm != null ? r.start_dtf_nm - r.dtf_nm : null);
const ALL: Sheet[] = ["standing", "daily", "reports"], DAY: Sheet[] = ["standing", "daily"];
const leg = (n: 1 | 2 | 3 | 4 | 5 | 6, meaning: string): Column => ({ key: `leg${n}_kn`, unit: "kt", meaning, sheets: DAY, value: r => ifCur(r, rd(r[`leg${n}_kn`], 2)) });

export const COLUMNS: Column[] = [
  { key: "report_utc", unit: "UTC", kind: "time", sheets: ["standing", "reports"], meaning: "The 4-hourly report: 00:00, 04:00, 08:00, 12:00, 16:00 or 20:00 UTC. On Standing, the newest report in the file; the row covers the 24 hours that end at it.", value: r => time(r.as_of) },
  { key: "date_utc", unit: "date", kind: "date", sheets: ["daily"], meaning: "The UTC day that was sailed. The row covers its 24 hours and closes at the 00:00 UTC report that follows.", value: r => new Date(sailedDay(r) + "T00:00:00Z") },
  { key: "race_day", unit: "", sheets: ["daily", "reports"], meaning: "GGR’s numbering: 6 September is day 0.", value: (r, start) => raceDayOf(sailedDay(r), start) },
  { key: "closing_report_utc", unit: "UTC", kind: "time", sheets: ["daily"], meaning: "The report that closes the row.", value: r => time(r.as_of) },
  { key: "boat_id", unit: "", sheets: ALL, meaning: "YB’s number for the boat; the same in every file.", value: r => r.team_id },
  { key: "skipper", unit: "", width: 26, sheets: ALL, meaning: "The skipper’s name.", value: r => r.skipper },
  { key: "yacht", unit: "", width: 24, sheets: ALL, meaning: "The yacht’s name.", value: r => r.yacht },
  { key: "design", unit: "", width: 22, sheets: ALL, meaning: "The boat’s design.", value: r => r.design },
  { key: "country", unit: "", sheets: ALL, meaning: "Three-letter country code.", value: r => r.country },
  { key: "place", unit: "", sheets: ALL, meaning: "Rank by YB’s distance to finish at the report.", value: r => r.rank },
  { key: "places_gained_24h", unit: "places", sheets: ALL, meaning: "Places gained (+) or lost (−) since the report 24 hours earlier.", value: r => r.rank_change },
  { key: "to_finish_nm", unit: "nm", sheets: ALL, meaning: "Distance to finish, measured by YB along the course.", value: r => rd(r.dtf_nm, 1) },
  { key: "gap_to_leader_nm", unit: "nm", sheets: ALL, meaning: "This boat’s distance to finish minus the leader’s.", value: r => rd(r.gap_nm, 1) },
  { key: "gap_to_boat_ahead_nm", unit: "nm", sheets: ALL, meaning: "The same to the boat one place ahead. Blank for the leader.", value: r => rd(r.interval_nm, 1) },
  { key: "lat", unit: "° north +", kind: "degrees", sheets: ALL, meaning: "Latitude of the boat’s fix at the report, decimal degrees, north positive. A real fix from YB, never interpolated.", value: r => rd(r.lat, 4) },
  { key: "lon", unit: "° east +", kind: "degrees", sheets: ALL, meaning: "Longitude of the same fix, decimal degrees, east positive.", value: r => rd(r.lon, 4) },
  { key: "fix_time_utc", unit: "UTC", kind: "time", sheets: ALL, meaning: "The true time of that fix. Trackers do not all report on the second.", value: r => time(r.last_fix_at) },
  { key: "current_fix", unit: "TRUE/FALSE", sheets: ALL, meaning: "FALSE when the boat missed this report: the position is then her last known one, with its older time, and the columns about the last 24 hours and 7 days are blank.", value: r => cur(r) },
  { key: "leg_nm", unit: "nm", sheets: ["reports"], meaning: "Great-circle distance of the 4-hour leg that ends at this report. Blank: no fix at one end.", value: r => rd(r.leg_nm, 1) },
  { key: "leg_avg_speed_kn", unit: "kt", sheets: ["reports"], meaning: "That distance divided by the time between the two fixes: average speed over the ground.", value: r => rd(r.leg_kn, 2) },
  { key: "leg_made_good_kn", unit: "kt", sheets: ["reports"], meaning: "Speed made good toward the finish on the leg.", value: r => rd(r.leg_vmg_kn, 2) },
  { key: "leg_course_made_good_deg", unit: "° true", sheets: ["reports"], meaning: "The bearing from the leg’s first fix to its second. Not the heading.", value: r => rd(r.leg_cmg_deg, 0) },
  { key: "start_lat", unit: "° north +", kind: "degrees", sheets: DAY, meaning: "Latitude at the start of the 24 hours (the fix 24 hours earlier). Blank if either report was missed.", value: r => ifCur(r, rd(r.start_lat, 4)) },
  { key: "start_lon", unit: "° east +", kind: "degrees", sheets: DAY, meaning: "Longitude at the start of the 24 hours.", value: r => ifCur(r, rd(r.start_lon, 4)) },
  { key: "run_24h_nm", unit: "nm", sheets: ALL, meaning: "Miles sailed along the track over the six 4-hour legs of the 24 hours.", value: r => ifCur(r, rd(r.run24_nm, 1)) },
  { key: "legs_complete", unit: "of 6", sheets: ALL, meaning: "How many of the six 4-hour legs have a fix at both ends. With fewer than 6 the run holds a straight line across the silent stretch: a lower bound. Filter on 6 for clean runs.", value: r => ifCur(r, r.legs_complete) },
  { key: "run_crosses_silent_tracker", unit: "TRUE/FALSE", sheets: ALL, meaning: "TRUE when the 24-hour run crossed a report the tracker missed: the boat is credited with the straight line across the silence, so the run is a lower bound. The site marks such runs and keeps them out of the figures that compare boats.", value: r => ifCur(r, !!r.run24_bridged) },
  { key: "avg_speed_24h_kn", unit: "kt", sheets: DAY, meaning: "The run divided by its hours: average speed over the ground.", value: r => ifCur(r, rd(r.spd24, 2)) },
  { key: "made_good_24h_nm", unit: "nm", sheets: DAY, meaning: "The fall in distance to finish over the 24 hours. This is what YB’s own 24-hour column shows.", value: r => rd(madeGood24(r), 1) },
  { key: "made_good_24h_kn", unit: "kt", sheets: DAY, meaning: "The same as a speed.", value: r => { const m = madeGood24(r); return m == null ? null : rd(m / 24, 2); } },
  leg(1, "Average speed on the first 4-hour leg of the 24 hours (the oldest). Blank: no fix at one end."), leg(2, "Second leg."), leg(3, "Third leg."),
  leg(4, "Fourth leg."), leg(5, "Fifth leg."), leg(6, "Sixth leg (the newest)."),
  { key: "gain_on_leader_24h_nm", unit: "nm", sheets: ALL, meaning: "Miles gained (+) or lost (−) on the leader in 24 hours, fix to fix.", value: r => ifCur(r, rd(r.gain24_nm, 1)) },
  { key: "vs_boats_nearby_nm", unit: "nm", sheets: DAY, meaning: "The 24-hour run minus the median run of the boats within 150 nm, which sail much the same weather.", value: r => ifCur(r, rd(r.vs_near_nm, 1)) },
  { key: "boats_nearby", unit: "boats", sheets: DAY, meaning: "How many boats that median is made of. Under 2, the column before is blank.", value: r => ifCur(r, r.near_n) },
  { key: "off_leader_track_nm", unit: "nm", sheets: DAY, meaning: "Distance from the boat to the nearest point of the track the leader sailed.", value: r => ifCur(r, rd(r.lever_nm, 1)) },
  { key: "off_leader_track_side", unit: "compass", sheets: DAY, meaning: "The side of that track she lies on.", value: r => ifCur(r, r.lever_dir) },
  { key: "run_7d_nm", unit: "nm", sheets: ALL, meaning: "Miles sailed over the last 42 legs. A restarted boat counts from her restart.", value: r => ifCur(r, rd(r.run7_nm, 1)) },
  { key: "avg_speed_7d_kn", unit: "kt", sheets: DAY, meaning: "Average speed over those legs.", value: r => ifCur(r, rd(r.spd7, 2)) },
  { key: "made_good_7d_kn", unit: "kt", sheets: DAY, meaning: "Speed made good toward the finish over 7 days; it drives the ETAs.", value: r => ifCur(r, rd(r.vmg7_kn, 2)) },
  { key: "sailed_since_start_nm", unit: "nm", sheets: DAY, meaning: "The sum of all 4-hour legs since the start (or the restart).", value: r => rd(r.sailed_nm, 1) },
  { key: "made_good_since_start_nm", unit: "nm", sheets: DAY, meaning: "The fall in distance to finish since the start (or the restart).", value: r => rd(r.made_good_nm, 1) },
  { key: "best_24h_run_nm", unit: "nm", sheets: DAY, meaning: "The boat’s longest 24-hour run so far, no missed report inside it.", value: r => rd(r.best24_nm, 1) || null },
  { key: "best_24h_run_at_utc", unit: "UTC", kind: "time", sheets: DAY, meaning: "The report that closed it.", value: r => time(r.best24_at) },
  { key: "best_4h_leg_kn", unit: "kt", sheets: DAY, meaning: "The boat’s fastest 4-hour leg so far.", value: r => rd(r.best4_kn, 2) || null },
  { key: "best_7d_run_nm", unit: "nm", sheets: DAY, meaning: "The boat’s longest 7-day run so far.", value: r => rd(r.best7_nm, 1) },
  { key: "personal_best_today", unit: "TRUE/FALSE", sheets: DAY, meaning: "TRUE when this 24-hour run is the boat’s longest so far.", value: r => !!r.pb24 },
  { key: "fleet_best_today", unit: "TRUE/FALSE", sheets: DAY, meaning: "TRUE when it is also the longest of the whole fleet so far.", value: r => !!r.fleet_best24 },
  { key: "vs_van_den_heede_2018_nm", unit: "nm", sheets: DAY, meaning: "Miles ahead (+) or behind (−) where Van Den Heede, the 2018 winner, was on the same race day.", value: r => rd(r.vs_vdh_nm, 1) },
  { key: "vs_neuschafer_2022_nm", unit: "nm", sheets: DAY, meaning: "The same against Neuschäfer, the 2022 winner.", value: r => rd(r.vs_kirsten_nm, 1) },
  { key: "speed_for_wind", unit: "ratio", sheets: DAY, meaning: "Average leg speed divided by model wind speed, over legs sailed in 8–25 kt since the start. Needs ten legs.", value: r => rd(r.wind_ratio, 3) },
  { key: "speed_for_wind_legs", unit: "legs", sheets: DAY, meaning: "How many legs that ratio is made of.", value: r => r.wind_legs },
  { key: "steadiness_7d_kn", unit: "kt", sheets: DAY, meaning: "The spread (standard deviation) of 4-hour leg speeds over 7 days. Lower is steadier.", value: r => rd(r.sd7, 2) },
  { key: "share_legs_5kn_7d", unit: "share", sheets: DAY, meaning: "The share of legs at 5 kt or more over 7 days.", value: r => rd(r.share5_7, 2) },
  { key: "hours_parked_7d", unit: "h", sheets: DAY, meaning: "Hours on legs under 2 kt over 7 days.", value: r => r.parked_h7 },
  { key: "night_minus_day_kn", unit: "kt", sheets: DAY, meaning: "Average leg speed at night (20:00–06:00 local solar time) minus by day, since the start. Needs six legs of each.", value: r => rd(r.night_delta, 2) },
  { key: "next_mark", unit: "", width: 22, sheets: ALL, meaning: "The first mark of the course (NOR C.1.3) the boat has not yet passed.", value: r => r.next_mark },
  { key: "next_mark_nm", unit: "nm", sheets: ALL, meaning: "Great-circle distance to it.", value: r => rd(r.next_mark_nm, 1) },
  { key: "next_mark_eta_utc", unit: "UTC", kind: "time", sheets: ALL, meaning: "Distance to the mark divided by the 7-day made-good speed.", value: r => ifCur(r, time(r.next_mark_eta)) },
  { key: "restart_utc", unit: "UTC", kind: "time", sheets: DAY, meaning: "When a restarted boat left again (NOR C.1.2). Her runs and speeds count from then.", value: r => time(r.restart_at) },
  { key: "model_wind_kn", unit: "kt", sheets: ALL, meaning: "MODEL wind at the fix (Open-Meteo, hourly mean at 10 m). Not measured on board.", value: r => ifCur(r, rd(r.wind_kn, 1)) },
  { key: "model_gust_kn", unit: "kt", sheets: ALL, meaning: "Model gust.", value: r => ifCur(r, rd(r.gust_kn, 1)) },
  { key: "model_wind_from_deg", unit: "° true", sheets: ALL, meaning: "The direction the model wind blows from.", value: r => ifCur(r, rd(r.wind_dir_deg, 0)) },
  { key: "model_pressure_hpa", unit: "hPa", sheets: ALL, meaning: "Model sea-level pressure.", value: r => ifCur(r, rd(r.mslp_hpa, 1)) },
  { key: "model_wave_m", unit: "m", sheets: ALL, meaning: "Model significant wave height, sea and swell combined.", value: r => ifCur(r, rd(r.wave_m, 1)) },
  { key: "model_swell_m", unit: "m", sheets: ALL, meaning: "Model swell height.", value: r => ifCur(r, rd(r.swell_m, 1)) },
  { key: "model_swell_period_s", unit: "s", sheets: ALL, meaning: "Model swell period.", value: r => ifCur(r, rd(r.swell_period_s, 1)) },
  { key: "model_current_kn", unit: "kt", sheets: ALL, meaning: "Model current speed.", value: r => ifCur(r, rd(r.current_kn, 2)) },
  { key: "model_current_to_deg", unit: "° true", sheets: ALL, meaning: "The direction the model current sets toward.", value: r => ifCur(r, rd(r.current_dir_deg, 0)) },
  { key: "model_sea_temp_c", unit: "°C", sheets: ALL, meaning: "Model sea-surface temperature.", value: r => ifCur(r, rd(r.sst_c, 1)) },
  { key: "model_wind_mean_24h_kn", unit: "kt", sheets: DAY, meaning: "The mean of the model wind at the reports of the 24 hours that have a value.", value: r => ifCur(r, rd(r.wind_mean_kn, 1)) },
  { key: "model_wind_max_24h_kn", unit: "kt", sheets: DAY, meaning: "The highest of them.", value: r => ifCur(r, rd(r.wind_max_kn, 1)) },
  { key: "model_wind_reports", unit: "of 6", sheets: DAY, meaning: "How many of the six reports have a model value. The weather service does not always answer.", value: r => ifCur(r, r.wind_reports) },
];
export const columnsOf = (sheet: Sheet): Column[] => COLUMNS.filter(c => c.sheets.includes(sheet));
export const cellsOf = (sheet: Sheet, r: ExportRaw, startIso: string): Cell[] => columnsOf(sheet).map(c => c.value(r, startIso));
export const SHEET_NAMES: Record<Sheet, string> = { standing: "Standing", daily: "Daily", reports: "Every report" };
export const SHEET_NOTES: [string, string][] = [
  ["Standing", "One row per boat: the 24 hours to the newest report in the file. In a finished month, where the fleet stood as the month ended."],
  ["Daily", "One row per boat per UTC day. A row closes at the 00:00 UTC report that follows the day, and a day belongs to the month it was sailed in."],
  ["Every report", "One row per boat per 4-hourly report, with the 4-hour leg that ends at it."],
  ["Boats", "The fleet: skipper, yacht, design, country."],
  ["Columns", "What every column means, with its unit."],
];
