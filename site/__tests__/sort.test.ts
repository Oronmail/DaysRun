// site/__tests__/sort.test.ts
import { describe, it, expect } from "vitest";
import { sortBoats, defaultDir, phoneSortOptions } from "../lib/sort";
const b = (team_id: number, rank: number, o: Record<string, unknown> = {}) => ({ team_id, rank, rank_change: 0, dtf_nm: 24000 + rank, gap_nm: rank, gain24_nm: 0, vs_near_nm: 0, run24_nm: 100, run7_nm: 700, spd4: 5, spd7: 5, vs_vdh_days: 0, team: { name: "X" + rank }, ...o });
describe("sortBoats", () => {
  const boats = [b(6, 1, { run24_nm: 154, team: { name: "Damien Guillou" } }), b(10, 2, { run24_nm: 143, team: { name: "Pat Lawless" } }), b(12, 3, { run24_nm: 174, team: { name: "Henry Wootton" } }), b(16, 4, { run24_nm: null, team: { name: "Andrea Lodolo" } })];
  it("sorts the run column longest first and keeps a missing value last in either direction", () => {
    expect(sortBoats(boats, "run", "desc").map(x => x.team_id)).toEqual([12, 6, 10, 16]);
    expect(sortBoats(boats, "run", "asc").map(x => x.team_id)).toEqual([10, 6, 12, 16]);
  });
  it("sorts names by surname, as the Records page lists them", () => { expect(sortBoats(boats, "name", "asc").map(x => x.team_id)).toEqual([6, 10, 16, 12]); });
  it("never mutates its input and breaks ties by place", () => {
    const tied = [b(2, 2), b(1, 1)]; const out = sortBoats(tied, "run", "desc");
    expect(out.map(x => x.rank)).toEqual([1, 2]); expect(tied.map(x => x.rank)).toEqual([2, 1]);
  });
  it("puts the biggest gain on the leader first and a boat without a current fix last", () => {
    const g = [b(1, 1, { gain24_nm: null }), b(2, 2, { gain24_nm: -8 }), b(3, 3, { gain24_nm: 18 })];
    expect(sortBoats(g, "gain", defaultDir("gain")).map(x => x.team_id)).toEqual([3, 2, 1]);
  });
  it("opens each column in its natural direction", () => { expect(defaultDir("rank")).toBe("asc"); expect(defaultDir("run")).toBe("desc"); expect(defaultDir("vdh")).toBe("desc"); expect(defaultDir("name")).toBe("asc"); });
});

describe("the phone list's orderings", () => {
  it("offers only what a phone row shows, so that an order is never a mystery", () => {
    expect(phoneSortOptions().map(o => o.key)).toEqual(["rank", "change", "name", "dtf", "run", "run7", "leg", "wind", "gain", "vdh"]);   // no gap, vs nearby or 7-day speed bars: not on the row
  });
  it("names the paces plainly and in the table's order: the miles (24 hours, 7 days), then the speeds (latest leg, for the wind)", () => {
    const opts = phoneSortOptions(), label = (k: string) => opts.find(o => o.key === k)!.label;
    expect([label("run"), label("run7"), label("leg")]).toEqual(["24-hour run", "7-day run", "Latest 4-hour leg, kt"]);
  });
  it("sorts the 7-day run, a column of its own since the three window filters went (19 Sep 2026), longest first", () => {
    const rows = [b(1, 1, { run7_nm: 900 }), b(2, 2, { run7_nm: null }), b(3, 3, { run7_nm: 1010 })];
    expect(defaultDir("run7")).toBe("desc");
    expect(sortBoats(rows, "run7", "desc").map(r => r.team_id)).toEqual([3, 1, 2]);
    expect(sortBoats(rows, "run7", "asc").map(r => r.team_id)).toEqual([1, 3, 2]);
  });
  it("puts a blank change of place (no current fix at one end of the 24 hours) last, whichever way the column is sorted", () => {
    const rows = [b(1, 1, { rank_change: null }), b(2, 2, { rank_change: -1 }), b(3, 3, { rank_change: 2 })];
    expect(sortBoats(rows, "change", "desc").map(r => r.team_id)).toEqual([3, 2, 1]);
    expect(sortBoats(rows, "change", "asc").map(r => r.team_id)).toEqual([2, 3, 1]);
  });
  it("sorts by the latest 4-hour leg and by speed for the wind, fastest and best first, with a boat that has neither last", () => {
    const rows = [b(1, 1, { spd4: 4.9, wind_ratio: 0.45 }), b(2, 2, { spd4: null, wind_ratio: 0.41 }), b(3, 3, { spd4: 6.9, wind_ratio: null }), b(4, 4, { spd4: 1.7, wind_ratio: 0.38 })];
    expect(defaultDir("leg")).toBe("desc"); expect(defaultDir("wind")).toBe("desc");
    expect(sortBoats(rows, "leg", "desc").map(r => r.team_id)).toEqual([3, 1, 4, 2]);
    expect(sortBoats(rows, "leg", "asc").map(r => r.team_id)).toEqual([4, 1, 3, 2]);
    expect(sortBoats(rows, "wind", "desc").map(r => r.team_id)).toEqual([1, 2, 4, 3]);
  });
});
