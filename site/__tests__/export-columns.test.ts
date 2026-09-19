// site/__tests__/export-columns.test.ts — what goes into a cell of the data files.
import { describe, it, expect } from "vitest";
import { COLUMNS, cellsOf, columnsOf, rd, type ExportRaw } from "../lib/export-columns";
const START = "2026-09-06T12:30:00+00:00";
// Selim at the 00:00 UTC report of 17 Sep 2026 (production values), a boat with a current fix and six whole legs.
const selim: ExportRaw = { as_of: "2026-09-17T00:00:00+00:00", team_id: 8, closes_day: true, skipper: "Selim Yalcin", yacht: "Help Disabled Children", design: "Endurance 35", country: "TUR",
  rank: 16, rank_change: -1, dtf_nm: 25092.24, gap_nm: 695.3, interval_nm: 12.1, last_fix_at: "2026-09-17T00:00:15+00:00", stale: false, lat: 38.60021, lon: -10.18364,
  spd24: 5.2605, run24_nm: 126.25, spd7: 5.1, run7_nm: 850.2, vmg7_kn: 4.6, sailed_nm: 1400.4, made_good_nm: 1250.9, best4_kn: 7.31, best24_nm: 150.2, best24_at: "2026-09-12T00:00:00+00:00", best7_nm: 880.1,
  pb24: false, fleet_best24: false, vs_vdh_nm: -310.2, vs_kirsten_nm: -120.4, next_mark: "Lanzarote", next_mark_nm: 640.2, next_mark_eta: "2026-09-22T10:00:00+00:00", restart_at: null,
  gain24_nm: -9.96, vs_near_nm: -30.04, near_n: 2, lever_nm: 210.5, lever_dir: "NE", wind_ratio: 0.3124, wind_legs: 40, sd7: 0.84, share5_7: 0.62, parked_h7: 0, night_delta: -0.11,
  leg_nm: 19.3, leg_kn: 4.83, leg_vmg_kn: 4.4, leg_cmg_deg: 201.6, wind_kn: 26.52, gust_kn: 38.1, wind_dir_deg: 12.4, mslp_hpa: 1018.26, wave_m: 3.14, swell_m: 2.2, swell_period_s: 9.5, current_kn: 0.31, current_dir_deg: 190, sst_c: 19.4,
  leg1_kn: 5.46, leg2_kn: 5.5, leg3_kn: 5.52, leg4_kn: 5.3, leg5_kn: 5.0, leg6_kn: 4.83, legs_complete: 6, run24_bridged: false, start_lat: 40.6733, start_lon: -9.9, start_dtf_nm: 25208.84, wind_mean_kn: 28.46, wind_max_kn: 31.2, wind_reports: 4 };
const andrea: ExportRaw = { ...selim, team_id: 16, skipper: "Andrea Lodolo", rank: 3, stale: true, last_fix_at: "2026-09-16T20:01:59+00:00", lat: 31.18331, lon: -12.59272, run24_nm: 167.1, legs_complete: 4, run24_bridged: true, start_lat: null, start_lon: null, start_dtf_nm: null };
const row = (sheet: "standing" | "daily" | "reports", r: ExportRaw) => Object.fromEntries(columnsOf(sheet).map((c, i) => [c.key, cellsOf(sheet, r, START)[i]]));

describe("the columns of the data files", () => {
  it("never repeats a heading, names the unit in it where there is one, and explains every column", () => {
    const keys = COLUMNS.map(c => c.key); expect(new Set(keys).size).toBe(keys.length);
    for (const c of COLUMNS) { expect(c.key, c.key).toMatch(/^[a-z0-9_]+$/); expect(c.meaning.length, c.key).toBeGreaterThan(8); expect(c.sheets.length, c.key).toBeGreaterThan(0); }
    for (const c of COLUMNS.filter(c => c.unit === "nm")) expect(c.key).toMatch(/_nm$/);
    for (const c of COLUMNS.filter(c => c.unit === "kt")) expect(c.key).toMatch(/_kn$/);
  });
  it("follows the site's vocabulary: wind is model wind, no SOG, no heading as a value, no gendered pronoun for a skipper", () => {
    for (const c of COLUMNS.filter(c => /wind|gust|wave|swell|current_(kn|to)|sea_temp|pressure/.test(c.key) && !/speed_for_wind/.test(c.key))) expect(c.key, c.key).toMatch(/^model_/);
    for (const c of COLUMNS) { expect(c.key).not.toMatch(/sog|heading/); expect(c.meaning, c.key).not.toMatch(/\b(SOG|his|he|him)\b/); }
  });
  it("puts the day that was SAILED on a daily row, with GGR's race day", () => {
    const d = row("daily", selim);
    expect(d.date_utc).toEqual(new Date("2026-09-16T00:00:00Z")); expect(d.race_day).toBe(10); expect(d.closing_report_utc).toEqual(new Date("2026-09-17T00:00:00Z"));
  });
  it("gives the position of the real fix with its true time, the start of the 24 hours, and both kinds of 24-hour distance", () => {
    const d = row("daily", selim);
    expect([d.lat, d.lon, d.start_lat, d.start_lon]).toEqual([38.6002, -10.1836, 40.6733, -9.9]);
    expect(d.fix_time_utc).toEqual(new Date("2026-09-17T00:00:15Z")); expect(d.current_fix).toBe(true);
    expect(d.run_24h_nm).toBe(126.3); expect(d.legs_complete).toBe(6); expect(d.run_crosses_silent_tracker).toBe(false); expect(d.made_good_24h_nm).toBe(116.6); expect(d.made_good_24h_kn).toBe(4.86);
    expect([d.leg1_kn, d.leg6_kn]).toEqual([5.46, 4.83]); expect(d.model_wind_mean_24h_kn).toBe(28.5); expect(d.model_wind_reports).toBe(4);
  });
  it("says when a run crossed a silent tracker, on every sheet, and blanks it with the run for a boat without a current fix", () => {
    const daniel = { ...selim, team_id: 4, skipper: "Daniel Pinsky", legs_complete: 4, run24_bridged: true, leg1_kn: null, leg2_kn: null };
    expect(row("daily", daniel).run_crosses_silent_tracker).toBe(true); expect(row("reports", daniel).run_crosses_silent_tracker).toBe(true);
    expect(row("daily", andrea).run_crosses_silent_tracker).toBeNull();
    const c = COLUMNS.find(c => c.key === "run_crosses_silent_tracker")!; expect(c.meaning).toMatch(/lower bound|minimum/i);
  });
  it("keeps a boat without a current fix in her place, at her last position with its older time, and blanks the last 24 hours and 7 days", () => {
    const d = row("daily", andrea);
    expect([d.place, d.lat, d.lon, d.current_fix]).toEqual([3, 31.1833, -12.5927, false]); expect(d.fix_time_utc).toEqual(new Date("2026-09-16T20:01:59Z"));
    for (const k of ["run_24h_nm", "legs_complete", "avg_speed_24h_kn", "made_good_24h_nm", "made_good_24h_kn", "leg1_kn", "leg6_kn", "gain_on_leader_24h_nm", "vs_boats_nearby_nm", "off_leader_track_nm", "run_7d_nm", "start_lat", "next_mark_eta_utc", "model_wind_kn", "model_wind_mean_24h_kn", "model_wind_reports"]) expect(d[k], k).toBeNull();
    expect(d.best_24h_run_nm).toBe(150.2);                                   // what she has done so far stays
  });
  it("puts the 4-hour leg on a report row, and the course made good as whole degrees", () => {
    const r = row("reports", selim);
    expect([r.leg_nm, r.leg_avg_speed_kn, r.leg_made_good_kn, r.leg_course_made_good_deg]).toEqual([19.3, 4.83, 4.4, 202]);
    expect(r.report_utc).toEqual(new Date("2026-09-17T00:00:00Z")); expect("date_utc" in r).toBe(false); expect("leg1_kn" in r).toBe(false);
  });
  it("rounds once: a blank stays blank, not-a-number is blank, and minus nothing is nothing", () => {
    expect(rd(null, 1)).toBeNull(); expect(rd(undefined, 1)).toBeNull(); expect(rd(NaN, 1)).toBeNull(); expect(rd(Infinity, 1)).toBeNull();
    expect(Object.is(rd(-0.04, 1), 0)).toBe(true); expect(rd(14.25, 1)).toBe(14.3); expect(rd(-9.96, 1)).toBe(-10); expect(rd(0, 1)).toBe(0);
  });
});
