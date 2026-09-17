// site/__tests__/sort.test.ts
import { describe, it, expect } from "vitest";
import { sortBoats, defaultDir } from "../lib/sort";
const b = (team_id: number, rank: number, o: Record<string, unknown> = {}) => ({ team_id, rank, rank_change: 0, dtf_nm: 24000 + rank, gap_nm: rank, lat: 30, run24_nm: 100, run7_nm: 700, spd4: 5, spd7: 5, vs_vdh_days: 0, team: { name: "X" + rank }, ...o });
describe("sortBoats", () => {
  const boats = [b(6, 1, { run24_nm: 154, team: { name: "Damien Guillou" } }), b(10, 2, { run24_nm: 143, team: { name: "Pat Lawless" } }), b(12, 3, { run24_nm: 174, team: { name: "Henry Wootton" } }), b(16, 4, { run24_nm: null, team: { name: "Andrea Lodolo" } })];
  it("sorts the run column longest first and keeps a missing value last in either direction", () => {
    expect(sortBoats(boats, "run", "desc", "24h").map(x => x.team_id)).toEqual([12, 6, 10, 16]);
    expect(sortBoats(boats, "run", "asc", "24h").map(x => x.team_id)).toEqual([10, 6, 12, 16]);
  });
  it("sorts names by surname, as the Records page lists them", () => { expect(sortBoats(boats, "name", "asc", "24h").map(x => x.team_id)).toEqual([6, 10, 16, 12]); });
  it("never mutates its input and breaks ties by place", () => {
    const tied = [b(2, 2), b(1, 1)]; const out = sortBoats(tied, "run", "desc", "24h");
    expect(out.map(x => x.rank)).toEqual([1, 2]); expect(tied.map(x => x.rank)).toEqual([2, 1]);
  });
  it("opens each column in its natural direction", () => { expect(defaultDir("rank")).toBe("asc"); expect(defaultDir("run")).toBe("desc"); expect(defaultDir("vdh")).toBe("desc"); expect(defaultDir("name")).toBe("asc"); });
});
