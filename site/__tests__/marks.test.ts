// site/__tests__/marks.test.ts
import { describe, it, expect } from "vitest";
import { MARKS, marksInView, edgePointer, courseEntryIsNext } from "../lib/marks";

const view = { lon0: -22, lon1: -5, lat0: 23, lat1: 41, width: 358 };   // the Fleet chart on 17 Sep 2026

describe("marks", () => {
  it("lists the marks of NOR C.1.3 in course order, as the worker does", () => {
    expect(MARKS.map(m => m.name)).toEqual(["Lanzarote", "Trindade", "45°S 40°E", "45°S 65°E", "45°S 90°E", "45°S 110°E", "Cape Leeuwin", "Hobart Gate",
      "50°S 168°E", "49°S 150°W", "49°S 130°W", "49°S 110°W", "50°S 90°W", "Cape Horn", "Les Sables-d’Olonne"]);
  });
  it("draws the marks that lie inside the chart and no others", () => {
    expect(marksInView(view).map(m => m.name)).toEqual(["Lanzarote"]);
    expect(marksInView({ ...view, lat0: -30, lat1: -10, lon0: -40, lon1: -20 }).map(m => m.name)).toEqual(["Trindade"]);
    expect(marksInView({ ...view, lat0: 0, lat1: 20 })).toEqual([]);
  });
  it("points at a mark beyond the chart from the edge the fleet will leave by", () => {
    // a 100 x 200 chart, 10 px inset: from the middle toward a point far below and a little left
    const p = edgePointer([50, 100], [20, 400], 100, 200, 10)!;
    expect(p.y).toBe(190); expect(p.x).toBeCloseTo(41, 0); expect(p.deg).toBeCloseTo(185.7, 0);   // clockwise from up: 180 is straight down, a little left of that is a little more
    const right = edgePointer([50, 100], [500, 100], 100, 200, 10)!;
    expect(right.x).toBe(90); expect(right.y).toBe(100); expect(right.deg).toBeCloseTo(90, 5);
    expect(edgePointer([50, 100], [60, 120], 100, 200, 10)).toBeNull();                               // the mark is on the chart: no pointer
  });
  it("knows which line of the course list a next mark belongs to", () => {
    expect(courseEntryIsNext(["Trindade"], "Trindade")).toBe(true);
    expect(courseEntryIsNext(["45°S 40°E", "45°S 65°E", "45°S 90°E", "45°S 110°E"], "45°S 90°E")).toBe(true);
    expect(courseEntryIsNext(["Cape Horn"], "50°S 90°W")).toBe(false);
  });
});
