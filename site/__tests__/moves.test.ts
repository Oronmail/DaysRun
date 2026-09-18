// site/__tests__/moves.test.ts
import { describe, it, expect } from "vitest";
import { movers, placesGained } from "../lib/moves";
const b = (team_id: number, rank: number, rank_change: number | null, stale = false) => ({ team_id, rank, rank_change, stale });
describe("movers", () => {
  it("trusts the worker's figure: places gained among the boats with a current fix now AND 24 hours ago (audit N6, at its source since 18 Sep 2026)", () => {
    // 18 Sep 12:00: Andrea's tracker had been silent 24 hours earlier. The worker now sends her change blank and the six boats
    // she had drifted behind as 0; Guido/Guy and Henry/Isa are genuine swaps.
    const boats = [b(6, 1, 0), b(10, 2, 0), b(16, 3, null, true), b(17, 4, 0), b(3, 7, 1), b(5, 8, -1), b(12, 11, 1), b(14, 12, -1)];
    const m = movers(boats);
    expect(m.ups.map(x => x.team_id)).toEqual([3, 12]);
    expect(m.downs.map(x => x.team_id)).toEqual([5, 14]);
    expect(m.biggest).toBe(1);
  });
  it("leaves out a boat whose change is blank, and a boat without a current fix even when her row still carries a number", () => {
    const g = placesGained([b(1, 1, 0), b(2, 2, null), b(3, 3, 6, true), b(4, 4, 2)]);
    expect([...g]).toEqual([[1, 0], [4, 2]]);
  });
  it("is empty when nothing moved", () => { expect(movers([b(1, 1, 0), b(2, 2, 0)])).toEqual({ ups: [], downs: [], biggest: 0 }); });
});
