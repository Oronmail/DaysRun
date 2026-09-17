// site/__tests__/cron.test.ts
import { describe, it, expect } from "vitest";
import { shouldDispatch, quietMinutesAt } from "../lib/cron";
const NOW = Date.parse("2026-09-17T13:20:00Z");
describe("shouldDispatch", () => {
  it("stays quiet when the worker ran recently, whoever started it", () => {
    expect(shouldDispatch("2026-09-17T13:12:30Z", NOW)).toBe(false);      // GitHub's own 1312 run fired: nothing to do
    expect(shouldDispatch("2026-09-17T12:40:10Z", NOW)).toBe(false);      // the hourly one, 40 minutes ago
  });
  it("starts the worker when nothing has run for 45 minutes, or ever", () => {
    expect(shouldDispatch("2026-09-17T12:14:54Z", NOW)).toBe(true);       // 65 minutes: GitHub's schedule did not fire
    expect(shouldDispatch(null, NOW)).toBe(true);
    expect(shouldDispatch("not a date", NOW)).toBe(true);
  });
  it("is impatient in the half hour after a 4-hourly report, so that a report is on the site in minutes", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(quietMinutesAt(at("2026-09-17T16:05:00Z"))).toBe(4); expect(quietMinutesAt(at("2026-09-17T00:10:00Z"))).toBe(4); expect(quietMinutesAt(at("2026-09-17T16:29:59Z"))).toBe(4);
    expect(quietMinutesAt(at("2026-09-17T16:30:00Z"))).toBe(45); expect(quietMinutesAt(at("2026-09-17T17:05:00Z"))).toBe(45);   // 1700 is not a report hour
    expect(shouldDispatch("2026-09-17T15:20:48Z", at("2026-09-17T16:05:00Z"), quietMinutesAt(at("2026-09-17T16:05:00Z")))).toBe(true);    // 44 min ago, but a report is due: go
    expect(shouldDispatch("2026-09-17T16:05:20Z", at("2026-09-17T16:10:00Z"), quietMinutesAt(at("2026-09-17T16:10:00Z")))).toBe(true);    // again at :10 for the late fixes
    expect(shouldDispatch("2026-09-17T16:08:30Z", at("2026-09-17T16:10:00Z"), quietMinutesAt(at("2026-09-17T16:10:00Z")))).toBe(false);   // someone just started one
  });
});
