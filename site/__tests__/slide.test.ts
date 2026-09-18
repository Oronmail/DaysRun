// site/__tests__/slide.test.ts — the daily slide's numbers and sentences (lib/slide.ts). The cases are the fleet of 17 Sep 2026 1600 UTC.
import { describe, it, expect } from "vitest";
import { sixLegs, columns, biggestRun, fleetAverage, fastestLeg, leaderLine, ghostLine, scaleMax, runChange } from "../lib/slide";
import { placeGroups } from "../lib/moves";

const AS_OF = "2026-09-17T16:00:00+00:00", H4 = 4 * 3600 * 1000, T = new Date(AS_OF).getTime();
const slot = (k: number) => new Date(T - (5 - k) * H4).toISOString().replace(".000Z", "+00:00");       // k = 0 is the oldest of the six legs
const legs = (team_id: number, nms: (number | null)[]) => nms.map((nm, k) => ({ team_id, end_slot: slot(k), dist_nm: nm, speed_kn: nm == null ? null : nm / 4 }));
const boat = (team_id: number, first: string, rank: number, run: number | null, o: Record<string, unknown> = {}) =>
  ({ team_id, rank, rank_change: 0, stale: false, last_fix_at: AS_OF, run24_nm: run, spd24: run == null ? null : run / 24, pb24: false, fleet_best24: false, gain24_nm: null as number | null, team: { first_name: first, name: first + " X" }, ...o });

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
  const cols = columns(NOW, BEFORE, ALL, AS_OF);
  it("stand in order of the day's run, longest first", () => { expect(cols.map(c => c.first)).toEqual(["Henry", "Damien", "Andrea", "Matt"]); });
  it("carry what a column shows: miles, place, the day before, a personal best", () => {
    const h = cols[0]; expect([h.run, h.place, h.dayBefore, h.pb]).toEqual([176, 10, 173, true]);
  });
  it("show a silent tracker as a bridged block: the run less the legs that are known", () => {
    const a = cols.find(c => c.first === "Andrea")!, m = cols.find(c => c.first === "Matt")!;
    expect(a.bridgedNm).toBeCloseTo(130, 5); expect(m.bridgedNm).toBeCloseTo(150 - 98.3, 5); expect(cols[0].bridgedNm).toBe(0);
  });
  it("draw no 'day before' tick from a day the boat had no current fix", () => { expect(cols.find(c => c.first === "Andrea")!.dayBefore).toBeNull(); });
  it("put a boat without a current fix last, whatever its run says", () => {
    const c = columns([...NOW, boat(1, "Gunnar", 2, 190, { stale: true })], BEFORE, ALL, AS_OF);
    expect(c[c.length - 1].first).toBe("Gunnar"); expect(c[c.length - 1].stale).toBe(true);
  });
});

describe("a boat that missed the report", () => {
  // 18 Sep 20:00 UTC: Andrea and Matt had no position at 20:00. Each had reported at 16:00, and each holds a whole 24-hour run
  // ending there (Andrea 113.8 nm, Matt 142.1 nm). The board draws that run, faded, labelled with its own hour.
  const EARLIER = T - 4 * H4, fix = (t: number) => new Date(t).toISOString();
  const ending = (team_id: number, end: number, nms: (number | null)[]) =>
    nms.map((nm, i) => ({ team_id, end_slot: fix(end - (5 - i) * H4), dist_nm: nm, speed_kn: nm == null ? null : nm / 4 }));
  const ANDREA_TO_16 = ending(16, EARLIER, [18, 19, 20, 19, 18, 19.8]);          // 113.8 nm to the 16:00 report
  const silent = (o: Record<string, unknown> = {}) => boat(16, "Andrea", 3, 113.8, { stale: true, last_fix_at: fix(EARLIER + 263000), ...o });   // the fix stamped 16:04:23

  it("draws the run its own last report measured, and says which hour that run ends at", () => {
    const c = columns([boat(6, "Damien", 1, 171), silent()], [], [...DAMIEN, ...ANDREA_TO_16], AS_OF).find(c => c.first === "Andrea")!;
    expect([c.run, c.endsAt, c.bridgedNm]).toEqual([113.8, fix(EARLIER), 0]);
    expect(c.legs.map(l => l?.nm)).toEqual([18, 19, 20, 19, 18, 19.8]);          // the six legs to 16:00, not the six to 20:00
    expect(runChange(c)).toBeNull();                                             // no fair comparison with the day before
  });
  it("draws nothing when that last report is more than 24 hours old", () => {
    const old = T - 28 * 3600 * 1000;                                            // on the grid, so only its age decides
    const c = columns([silent({ last_fix_at: fix(old), run24_nm: 150 })], [], ending(16, old, [10, 10, 10, 10, 10, 10]), AS_OF)[0];
    expect([c.run, c.endsAt]).toEqual([null, null]);
  });
  it("draws nothing when the last fix is off the 4-hour grid, where which window its run covers cannot be known", () => {
    const c = columns([silent({ last_fix_at: fix(EARLIER - 90 * 60 * 1000) })], [], [...ANDREA_TO_16], AS_OF)[0];
    expect([c.run, c.endsAt, c.legs.every(l => l == null)]).toEqual([null, null, true]);
  });
  it("stands after every boat with a current fix, and among those, in order of the run", () => {
    const cols = columns([boat(6, "Damien", 1, 100), silent(), boat(15, "Matt", 14, 142.1, { stale: true, last_fix_at: fix(EARLIER + 66000) })],
                         [], [...DAMIEN, ...ANDREA_TO_16, ...ending(15, EARLIER, [24, 24, 23, 23, 24, 24.1])], AS_OF);
    expect(cols.map(c => c.first)).toEqual(["Damien", "Matt", "Andrea"]);        // 100 nm to 20:00 first, then 142 and 114 to 16:00
  });
  it("is kept out of every figure that measures the same 24 hours for the whole fleet", () => {
    const cols = columns([boat(6, "Damien", 1, 100), silent()], [], [...DAMIEN, ...ANDREA_TO_16], AS_OF);
    expect(biggestRun(cols)?.first).toBe("Damien");                              // 114 to 16:00 is not the day's biggest run
    expect(fleetAverage(cols)).toBe(100);
    expect(scaleMax(cols)).toBe(190);                                            // but the chart's scale holds its bar
    expect(scaleMax([...cols, { run: 200 } as never])).toBe(200);
  });
});

describe("the three numbers at the top", () => {
  const cols = columns(NOW, BEFORE, ALL, AS_OF);
  it("the biggest run is the longest of the runs with all six legs", () => {
    expect(biggestRun(cols)?.first).toBe("Henry");
    expect(biggestRun(columns([boat(16, "Andrea", 3, 300)], [], ALL, AS_OF))).toBeNull();      // a straight line across a silent tracker is not a record
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

describe("against the 2018 winner, and places", () => {
  it("says where the leader stands against Van Den Heede's 2018 run on the same race day, in miles, and how many boats are ahead of it", () => {
    expect(ghostLine("Damien", 138.4, 2, 16, 11)).toEqual({ head: "Damien is 138 nm ahead", rest: "of where Van Den Heede, the 2018 winner, was on day 11 · 2 of 16 boats are ahead of that pace" });
    expect(ghostLine("Damien", -52.2, 0, 16, 40)).toEqual({ head: "Damien is 52 nm behind", rest: "where Van Den Heede, the 2018 winner, was on day 40 · no boat is ahead of that pace" });
    expect(ghostLine("Damien", 300, 16, 16, 12)?.rest).toBe("of where Van Den Heede, the 2018 winner, was on day 12 · the whole fleet is ahead of that pace");
    expect(ghostLine("Damien", 10, 1, 15, 12)?.rest).toBe("of where Van Den Heede, the 2018 winner, was on day 12 · 1 of 15 boats is ahead of that pace");
    expect(ghostLine("Damien", 0.3, 1, 16, 12)?.head).toBe("Damien is level");
    expect(ghostLine("Damien", null, 0, 16, 12)).toBeNull();          // no replay position for this day: say nothing
  });
  it("groups the places gained and lost like the feed does, among boats with a current fix", () => {
    const g = placeGroups([boat(1, "A", 1, 1, { rank_change: 0 }), boat(2, "B", 2, 1, { rank_change: 1 }), boat(3, "C", 3, 1, { rank_change: -1 }), boat(4, "D", 4, 1, { rank_change: 5, stale: true })]);
    expect(g).toEqual({ ups: [[1, ["B"]]], downs: [[1, ["C"]]] });
  });
  it("says how many miles more or fewer than the day before, judged on the figures as printed", () => {
    const col = (run: number | null, dayBefore: number | null, o: Record<string, unknown> = {}) => ({ stale: false, run, dayBefore, bridgedNm: 0, ...o });
    expect(runChange(col(158.8, 176.1))).toBe(-17);                                        // 18 Sep 16:00, Henry: 159 after 176
    expect(runChange(col(151.2, 140.0))).toBe(11);
    expect(runChange(col(140.4, 139.6))).toBe(0);                                          // both print as 140: "the same", not a gain of one
    expect(runChange(col(150, null))).toBeNull();                                          // no complete day before to compare with
    expect(runChange(col(null, 140))).toBeNull();
    expect(runChange(col(150, 140, { stale: true }))).toBeNull();                          // a boat that missed the report is compared with nothing
    expect(runChange(col(142, 150, { bridgedNm: 51.7 }))).toBeNull();                      // a run across a silent tracker is a minimum: a difference from it would be a guess
  });
  it("scales the chart to the runs it draws, never tighter than 190 nm, so the bars of one day can be set against another's", () => {
    expect(scaleMax([{ run: 204 }, { run: 151 }, { run: null }] as never[])).toBe(204);   // a boat that draws nothing does not count
    expect(scaleMax([{ run: 120 }] as never[])).toBe(190);
  });
  it("calls a run a personal best only when it equals the boat's own best, never because it is the fleet's longest run of the day", () => {
    // 18 Sep 16:00: Henry's 159 nm was the longest run of the last 24 hours (the worker's fleet_best24), a day after his 180: the board said "personal best".
    const legs: never[] = [];
    const henry = columns([boat(12, "Henry", 9, 158.8, { fleet_best24: true, best24_nm: 179.7 })], [], legs, "2026-09-18T16:00:00+00:00")[0];
    expect(henry.pb).toBe(false);
    const yesterday = columns([boat(12, "Henry", 10, 179.7, { fleet_best24: true, best24_nm: 179.7 })], [], legs, "2026-09-17T20:00:00+00:00")[0];
    expect(yesterday.pb).toBe(true);
    const pat = columns([boat(10, "Pat", 2, 155.2, { pb24: true, best24_nm: 155.2 })], [], legs, "2026-09-18T08:00:00+00:00")[0];
    expect(pat.pb).toBe(true);
    expect(columns([boat(3, "Guido", 7, null, { best24_nm: 165 })], [], legs, "2026-09-18T08:00:00+00:00")[0].pb).toBe(false);   // no run, no best
  });
});
