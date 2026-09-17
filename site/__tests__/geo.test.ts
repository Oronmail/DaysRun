// site/__tests__/geo.test.ts
import { describe, it, expect } from "vitest";
import { project, viewHeight, landPaths } from "../lib/geo";
const v = { lon0: -20, lon1: -5, lat0: 27, lat1: 44, width: 358 };
describe("geo", () => {
  it("projects corners", () => {
    expect(project(44, -20, v)).toEqual([0, 0]);
    expect(project(27, -20, v)[1]).toBeCloseTo(viewHeight(v), 6);
  });
  it("finds Iberian land in the fleet view", () => { expect(landPaths(v).length).toBeGreaterThan(0); });
});
