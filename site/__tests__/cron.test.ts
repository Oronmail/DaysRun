// site/__tests__/cron.test.ts
import { describe, it, expect } from "vitest";
import { shouldDispatch } from "../lib/cron";
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
});
