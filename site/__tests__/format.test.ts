// site/__tests__/format.test.ts
import { describe, it, expect } from "vitest";
import { nm, sgn, hhmm, dayMon, dateline, hoursText } from "../lib/format";
describe("format", () => {
  it("formats numbers and signs", () => {
    expect(nm(24523.4)).toBe("24,523"); expect(sgn(1.94)).toBe("+1.9"); expect(sgn(-0.6)).toBe("−0.6"); expect(sgn(0)).toBe("±0.0");
  });
  it("formats UTC times", () => {
    expect(hhmm("2026-09-16T00:00:00+00:00")).toBe("0000"); expect(dayMon("2026-09-12T20:00:00Z")).toBe("12 Sep");
    expect(dateline("2026-09-16T00:00:00Z", 10)).toBe("RACE DAY 10 · WEDNESDAY 16 SEP 2026 · 0000 UTC");
    expect(hoursText(59.1)).toBe("59 h 06 m");
    expect(hoursText(59.995)).toBe("60 h 00 m");   // minutes never print as 60
  });
});
