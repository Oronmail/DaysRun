// site/__tests__/yearlines.test.ts — the pure arithmetic behind the Past races charts: YearLines' axes and its clipping at both
// edges of the box, its gold treatment on the "ended" marker, and the ocean chart's shared graticule labels (the DOM itself is
// judged by looking at the chart, not by this file).
import { describe, it, expect } from "vitest";
import { scale, clip, endedStyle } from "../components/YearLines";
import { latLabel, lonLabel } from "../lib/geo";

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

describe("the 'ended' marker's gold treatment", () => {
  it("mirrors the 'end' marker: a gold line moves its ✕ and label to the darker edge/text tokens", () => {
    expect(endedStyle("#1F6FA3", true)).toEqual({ stroke: "var(--gold-edge)", weight: 600, fill: "var(--gold-text)" });
  });
  it("a non-gold line keeps its own colour for the ✕ and the label", () => {
    expect(endedStyle("#1F6FA3", false)).toEqual({ stroke: "#1F6FA3", weight: 500, fill: "#1F6FA3" });
    expect(endedStyle("#1F6FA3")).toEqual({ stroke: "#1F6FA3", weight: 500, fill: "#1F6FA3" });
  });
});

describe("the ocean chart's graticule labels (shared by FleetMap and PointsChart)", () => {
  it("labels a view spanning the equator and the prime meridian correctly on all four sides", () => {
    expect(latLabel(-34)).toBe("34°S");
    expect(latLabel(34)).toBe("34°N");
    expect(lonLabel(18)).toBe("18°E");
    expect(lonLabel(-18)).toBe("18°W");
  });
});
