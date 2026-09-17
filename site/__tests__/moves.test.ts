// site/__tests__/moves.test.ts
import { describe, it, expect } from "vitest";
import { movers } from "../lib/moves";
const b = (team_id: number, rank: number, rank_change: number, stale = false) => ({ team_id, rank, rank_change, stale });
describe("movers", () => {
  it("does not call a place gained against a boat with an older fix a move (audit N6)", () => {
    // 16 Sep 0000: Ertan 4→3 only because Andrea's fix is 3.9 h old; Guido/Guy and Henry/Isa are genuine swaps.
    const boats = [b(6, 1, 0), b(10, 2, 0), b(17, 3, 1), b(16, 4, -1, true), b(3, 7, 1), b(5, 8, -1), b(12, 11, 1), b(14, 12, -1)];
    const m = movers(boats);
    expect(m.ups.map(x => x.team_id)).toEqual([3, 12]);
    expect(m.downs.map(x => x.team_id)).toEqual([5, 14]);
    expect(m.biggest).toBe(1);
  });
  it("is empty when nothing moved", () => { expect(movers([b(1, 1, 0), b(2, 2, 0)])).toEqual({ ups: [], downs: [], biggest: 0 }); });
});
