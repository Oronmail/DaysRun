// site/__tests__/highest.test.ts — which bars of a chart are gold: the highest, as the reader sees it.
import { describe, it, expect } from "vitest";
import { highest } from "../lib/highest";
const kt = (v: number) => v.toFixed(1), nm = (v: number) => String(Math.round(v));   // the two charts' own label functions
describe("the gold bar", () => {
  it("is the highest bar, wherever it stands: not the last one", () => { expect([...highest([104, 134, 152, 127, 135], nm)]).toEqual([2]); });
  it("skips missed reports", () => { expect([...highest([null, 5.1, null, 6.6, 5.7], kt)]).toEqual([3]); });
  it("marks every bar that SHOWS the top figure: 6.84 and 6.76 both read 6.8, and one gold bar among equal numbers would look like a mistake", () => {
    expect([...highest([6.84, 6.1, 6.76, 6.74], kt)]).toEqual([0, 2]);
  });
  it("compares after rounding, as the figures are printed: 151.6 prints 152 and ties with 152.2", () => { expect([...highest([151.6, 140, 152.2], nm)]).toEqual([0, 2]); });
  it("marks nothing when there is nothing to show", () => { expect(highest([], kt).size).toBe(0); expect(highest([null, null], kt).size).toBe(0); });
  it("marks a lone bar", () => { expect([...highest([null, 3.2], kt)]).toEqual([1]); });
});
