// site/__tests__/perf.test.ts
import { describe, it, expect } from "vitest";
import { median, rankOf, restOfFleetBandSpeed, extraMiles, gainOn } from "../lib/perf";
const p = (team_id: number, legs: number, speed_kn: number) => ({ team_id, pos_json: { upwind: { legs, share: 0.1, speed_kn, wind_kn: 10 } } });
describe("perf helpers", () => {
  it("takes a median", () => { expect(median([3, 1, 2])).toBe(2); expect(median([4, 1, 3, 2])).toBe(2.5); expect(median([])).toBeNull(); });
  it("ranks a value among the rated boats, biggest first, ignoring the unrated", () => {
    expect(rankOf([0.47, 0.46, null, 0.41, undefined], 0.46)).toEqual({ place: 2, of: 3 });
    expect(rankOf([0.47, 0.46], 0.47)).toEqual({ place: 1, of: 2 });
    expect(rankOf([0.47, 0.46], null)).toBeNull();
  });
  it("averages the REST of the fleet on a point of sail, weighted by legs, and needs ten legs to speak", () => {
    const fleet = [p(6, 4, 5.0), p(10, 10, 4.0), p(3, 10, 3.0)];
    expect(restOfFleetBandSpeed(fleet, "upwind", 6)).toBeCloseTo(3.5, 9);          // Damien compared with the others, not with himself
    expect(restOfFleetBandSpeed(fleet, "upwind", 10)).toBeCloseTo((4 * 5 + 10 * 3) / 14, 9);
    expect(restOfFleetBandSpeed([p(6, 4, 5.0), p(10, 5, 4.0)], "upwind", 6)).toBeNull();
    expect(restOfFleetBandSpeed(fleet, "running", 6)).toBeNull();
  });
  it("gives the extra miles sailed as a share, and nothing for a restarted boat", () => {
    expect(extraMiles({ sailed_nm: 1493, made_good_nm: 1441, restart_at: null })).toBeCloseTo(0.036, 3);
    expect(extraMiles({ sailed_nm: 733, made_good_nm: 745, restart_at: "2026-09-09T20:00:00+00:00" })).toBeNull();   // sailed counts from the restart, made good from the start: not comparable
    expect(extraMiles({ sailed_nm: 10, made_good_nm: 0, restart_at: null })).toBeNull();
  });
  it("turns two boats' gains on the leader into the miles one gained on the other, fix to fix", () => {
    const lead = { rank: 1, gain24_nm: null }, pat = { rank: 2, gain24_nm: -8 }, dan = { rank: 3, gain24_nm: 1 }, stale = { rank: 4, gain24_nm: null };
    expect(gainOn(pat, lead)).toBe(-8);                 // the leader's own gain is nought by definition
    expect(gainOn(lead, pat)).toBe(8);
    expect(gainOn(dan, pat)).toBe(9);                   // Daniel gained 1 on the leader while Pat lost 8: nine on Pat
    expect(gainOn(pat, dan)).toBe(-9);
    expect(gainOn(pat, stale)).toBeNull(); expect(gainOn(stale, pat)).toBeNull();   // no current fix: no comparison, never a false loss
  });
});
