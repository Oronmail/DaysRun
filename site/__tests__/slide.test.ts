// site/__tests__/slide.test.ts — the daily slide's numbers and sentences (lib/slide.ts). The cases are the fleet of 17 Sep 2026 1600 UTC.
import { describe, it, expect } from "vitest";
import { sixLegs, columns, biggestRun, fleetAverage, fastestLeg, leaderLine, passLine, passesTile, meanWinds } from "../lib/slide";
import { placeGroups } from "../lib/moves";

const AS_OF = "2026-09-17T16:00:00+00:00", H4 = 4 * 3600 * 1000, T = new Date(AS_OF).getTime();
const slot = (k: number) => new Date(T - (5 - k) * H4).toISOString().replace(".000Z", "+00:00");       // k = 0 is the oldest of the six legs
const legs = (team_id: number, nms: (number | null)[]) => nms.map((nm, k) => ({ team_id, end_slot: slot(k), dist_nm: nm, speed_kn: nm == null ? null : nm / 4 }));
const boat = (team_id: number, first: string, rank: number, run: number | null, o: Record<string, unknown> = {}) =>
  ({ team_id, rank, rank_change: 0, stale: false, run24_nm: run, spd24: run == null ? null : run / 24, pb24: false, fleet_best24: false, gain24_nm: null as number | null, team: { first_name: first, name: first + " X" }, ...o });

const HENRY = legs(12, [28.6, 29.1, 30.0, 29.3, 28.6, 30.7]), DAMIEN = legs(6, [29.5, 28.7, 30.2, 29.4, 27.0, 26.6]);
const ANDREA = legs(16, [28.0, null, null, null, null, null]), MATT = legs(15, [null, null, 26.3, 25.3, 23.4, 23.3]);
const ALL = [...HENRY, ...DAMIEN, ...ANDREA, ...MATT, ...legs(12, [20, 20, 20, 20, 20, 20]).map(l => ({ ...l, end_slot: new Date(new Date(l.end_slot).getTime() - 6 * H4).toISOString() }))];
const NOW = [boat(6, "Damien", 1, 171, { pb24: true }), boat(16, "Andrea", 3, 158, { gain24_nm: -14 }), boat(12, "Henry", 10, 176, { pb24: true, gain24_nm: 10 }), boat(15, "Matt", 14, 150, { gain24_nm: -32 })];
const BEFORE = [boat(6, "Damien", 1, 111), boat(12, "Henry", 11, 173), boat(16, "Andrea", 4, 139, { stale: true }), boat(15, "Matt", 13, 157)];

describe("the six legs of a day", () => {
  it("takes the six 4-hour legs ending at the report, oldest first, and leaves a hole where the tracker was silent", () => {
    expect(sixLegs(ALL, 12, AS_OF).map(l => l?.nm)).toEqual([28.6, 29.1, 30.0, 29.3, 28.6, 30.7]);     // not the day before's legs
    expect(sixLegs(ALL, 16, AS_OF).map(l => l?.nm ?? null)).toEqual([28.0, null, null, null, null, null]);
    expect(sixLegs(ALL, 99, AS_OF)).toEqual([null, null, null, null, null, null]);
  });
});

describe("the columns", () => {
  const cols = columns(NOW, BEFORE, ALL, AS_OF, new Map([[12, 20], [6, 17]]));
  it("stand in order of the day's run, longest first", () => { expect(cols.map(c => c.first)).toEqual(["Henry", "Damien", "Andrea", "Matt"]); });
  it("carry what a column shows: miles, average speed, place, the day before, the wind", () => {
    const h = cols[0]; expect([h.run, h.place, h.dayBefore, h.wind, h.pb]).toEqual([176, 10, 173, 20, true]); expect(h.kt).toBeCloseTo(7.33, 2);
  });
  it("show a silent tracker as a bridged block: the run less the legs that are known", () => {
    const a = cols.find(c => c.first === "Andrea")!, m = cols.find(c => c.first === "Matt")!;
    expect(a.bridgedNm).toBeCloseTo(130, 5); expect(m.bridgedNm).toBeCloseTo(150 - 98.3, 5); expect(cols[0].bridgedNm).toBe(0);
  });
  it("draw no 'day before' tick from a day the boat had no current fix", () => { expect(cols.find(c => c.first === "Andrea")!.dayBefore).toBeNull(); });
  it("put a boat without a current fix last, whatever its run says", () => {
    const c = columns([...NOW, boat(1, "Gunnar", 2, 190, { stale: true })], BEFORE, ALL, AS_OF, new Map());
    expect(c[c.length - 1].first).toBe("Gunnar"); expect(c[c.length - 1].stale).toBe(true);
  });
});

describe("the three numbers at the top", () => {
  const cols = columns(NOW, BEFORE, ALL, AS_OF, new Map());
  it("the biggest run is the longest of the runs with all six legs", () => {
    expect(biggestRun(cols)?.first).toBe("Henry");
    expect(biggestRun(columns([boat(16, "Andrea", 3, 300)], [], ALL, AS_OF, new Map()))).toBeNull();      // a straight line across a silent tracker is not a record
  });
  it("the fleet average counts the same boats: a current fix and all six legs", () => { expect(fleetAverage(cols)).toBeCloseTo((176 + 171) / 2, 9); expect(fleetAverage([])).toBeNull(); });
  it("the fastest leg is the fastest single leg of the 24 hours, whoever sailed it", () => {
    expect(fastestLeg(ALL, NOW, AS_OF)).toEqual({ team_id: 12, first: "Henry", kt: 30.7 / 4, end_slot: slot(5) });
    expect(fastestLeg([], NOW, AS_OF)).toBeNull();
  });
});

describe("on the leader", () => {
  const fleet = (gains: [string, number | null][]) => [boat(6, "Damien", 1, 171), ...gains.map(([n, g], i) => boat(20 + i, n, i + 2, 150, { gain24_nm: g }))];
  it("says so when only one boat gained", () => {
    expect(leaderLine(fleet([["Henry", 10], ["Mara", -7], ["Selim", -54]]))).toEqual({ who: "Henry", nm: 10, text: "the only boat to gain on Damien", worst: { who: "Selim", nm: -54 } });
  });
  it("says how many gained when several did", () => {
    expect(leaderLine(fleet([["Henry", 42], ["Mara", 35], ["Selim", -10]]))?.text).toBe("gained the most on Damien, one of 2 boats to gain");
  });
  it("says who lost least when nobody gained, and never counts a boat without a current fix", () => {
    const l = leaderLine(fleet([["Henry", -3], ["Mara", -7], ["Andrea", null]]))!;
    expect([l.who, l.nm, l.text, l.worst]).toEqual(["Henry", -3, "lost the least on Damien: nobody gained", { who: "Mara", nm: -7 }]);
    expect(leaderLine(fleet([["Andrea", null]]))).toBeNull();
  });
  it("rounds before it judges, so +0.4 is not a gain", () => { expect(leaderLine(fleet([["Henry", 0.4], ["Mara", -7]]))?.text).toBe("lost the least on Damien: nobody gained"); });
});

describe("passes and places", () => {
  it("turns the feed's present tense into the slide's past, and keeps the chase", () => {
    expect(passLine("Louis passes Guy and leads by 2 nm, after trailing by 16 nm three days ago")).toBe("Louis passed Guy, after trailing by 16 nm");
    expect(passLine("Henry passes Mara and leads by 3 nm")).toBe("Henry passed Mara");
    expect(passLine("Something the pattern does not know")).toBe("Something the pattern does not know");
  });
  it("shows the two newest passes, or the closest duel on a day without one", () => {
    expect(passesTile(["Louis passes Guy and leads by 2 nm, after trailing by 16 nm three days ago", "Henry passes Mara and leads by 3 nm", "Pär passes Selim and leads by 5 nm"], null)).toEqual(["Louis passed Guy, after trailing by 16 nm", "Henry passed Mara"]);
    expect(passesTile([], { ahead: "Etienne", behind: "Daniel", gap_nm: 0.6 })).toEqual(["No pass in 24 hours", "Closest: Etienne leads Daniel by under 1 nm"]);
    expect(passesTile([], { ahead: "Guido", behind: "Louis", gap_nm: 8.5 })).toEqual(["No pass in 24 hours", "Closest: Guido leads Louis by 9 nm"]);
    expect(passesTile([], null)).toEqual(["No pass in 24 hours"]);
  });
  it("groups the places gained and lost like the feed does, among boats with a current fix", () => {
    const g = placeGroups([boat(1, "A", 1, 1, { rank_change: 0 }), boat(2, "B", 2, 1, { rank_change: 1 }), boat(3, "C", 3, 1, { rank_change: -1 }), boat(4, "D", 4, 1, { rank_change: 5, stale: true })]);
    expect(g).toEqual({ ups: [[1, ["B"]]], downs: [[1, ["C"]]] });
  });
});

describe("the wind under a column", () => {
  it("is the mean of the model wind at the day's reports", () => {
    const c = (team_id: number, h: number, wind_kn: number | null) => ({ team_id, fix_at: new Date(T - h * 3600 * 1000).toISOString(), wind_kn });
    const w = meanWinds([c(12, 0, 22), c(12, 4, 18), c(12, 30, 40), c(6, 8, null)], AS_OF);
    expect(w.get(12)).toBe(20); expect(w.has(6)).toBe(false);
  });
});
