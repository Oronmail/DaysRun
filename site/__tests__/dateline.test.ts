// site/__tests__/dateline.test.ts
import { describe, it, expect } from "vitest";
import { datelineNow, reportLabel } from "../lib/format";

const at = (iso: string) => new Date(iso).getTime();

describe("the dateline carries the time it is, and says which report the numbers are from", () => {
  it("shows the present UTC date and time with the race day", () => {
    expect(datelineNow(at("2026-09-17T15:34:40Z"), "2026-09-17T12:00:00+00:00", 11)).toBe("RACE DAY 11 · THURSDAY 17 SEP 2026 · 1534 UTC");
  });
  it("moves the race day on at midnight UTC, before the 0000 report is in", () => {
    expect(datelineNow(at("2026-09-18T00:10:00Z"), "2026-09-17T20:00:00+00:00", 11)).toBe("RACE DAY 12 · FRIDAY 18 SEP 2026 · 0010 UTC");
    expect(datelineNow(at("2026-10-01T03:00:00Z"), "2026-09-30T20:00:00+00:00", 24)).toBe("RACE DAY 25 · THURSDAY 1 OCT 2026 · 0300 UTC");
  });
  it("never runs behind the report it stands next to", () => {                       // a visitor's clock set wrong, or a cached page
    expect(datelineNow(at("2026-09-17T11:00:00Z"), "2026-09-17T12:00:00+00:00", 11)).toBe("RACE DAY 11 · THURSDAY 17 SEP 2026 · 1200 UTC");
  });
  it("names the report, with its date only when that is not today's", () => {
    expect(reportLabel(at("2026-09-17T15:34:00Z"), "2026-09-17T12:00:00+00:00")).toBe("POSITIONS FROM THE 1200 UTC REPORT");
    expect(reportLabel(at("2026-09-18T00:10:00Z"), "2026-09-17T20:00:00+00:00")).toBe("POSITIONS FROM THE 2000 UTC REPORT, 17 SEP");
  });
});
