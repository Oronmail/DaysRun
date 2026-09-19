// site/__tests__/yearlines.test.ts — the pure arithmetic behind the Past races charts: YearLines' axes, its clipping at both
// edges of the box, and the wind-shares bars' widths (the DOM itself is judged by looking at the chart, not by this file).
import { describe, it, expect } from "vitest";
import { scale, clip } from "../components/YearLines";
import { barPct } from "../components/WindShares";

describe("a year line's axes", () => {
  it("maps day 0 to the left margin and the top value to the top margin", () => {
    const { X, Y } = scale(640, 300, 30, 3600, 64);
    expect(X(0)).toBe(52); expect(X(30)).toBe(640 - 64); expect(Y(3600)).toBe(14); expect(Y(0)).toBe(300 - 28);
  });
  it("clips a value past ymax to the top of the chart's box, rather than letting the point escape it", () => {
    // 2022's leader can pass this year's course-length ymax on the shared axis; the point holds at the top rather than drawing above it
    const { Y } = scale(640, 300, 378, 27000, 64);
    expect(Y(30500)).toBe(Y(27000));
    expect(Y(27000)).toBe(14);
  });
  it("stops a line where its own data stops, short of xmax, for a race still being sailed", () => {
    expect(clip([[0, 0], [10, 500], [20, 900]], 45)).toEqual([[0, 0], [10, 500], [20, 900]]);
  });
  it("drops points beyond xmax rather than drawing past the chart's edge", () => {
    expect(clip([[0, 0], [10, 500], [50, 999]], 30)).toEqual([[0, 0], [10, 500]]);
  });
});

describe("the wind-shares bar widths", () => {
  it("sum to the full bar (100%) for a day with legs", () => {
    const [up, re, ru] = barPct({ year: "ggr2026", upwind: 14, reaching: 15, running: 71 });
    expect(up + re + ru).toBe(100);
  });
  it("are all zero for a day with no legs at all (a blank bar, never a guess)", () => {
    expect(barPct({ year: "ggr2026", upwind: 0, reaching: 0, running: 0 })).toEqual([0, 0, 0]);
  });
});
