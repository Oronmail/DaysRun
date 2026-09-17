// site/__tests__/health.test.ts — the verdict of /api/health, the one address an outside monitor watches.
import { describe, it, expect } from "vitest";
import { health } from "../lib/health";
const at = (iso: string) => Date.parse(iso);
describe("health", () => {
  it("is well when the worker synced within 130 minutes and the latest report is under 6.5 hours old", () => {
    expect(health("2026-09-17T16:06:00Z", "2026-09-17T16:00:00+00:00", at("2026-09-17T17:30:00Z"))).toEqual({ ok: true, last_sync: "2026-09-17T16:06:00Z", sync_age_min: 84, latest_report: "2026-09-17T16:00:00+00:00", report_age_h: 1.5, problems: [] });
  });
  it("says the worker has stopped when nothing synced for more than two hourly runs", () => {
    const h = health("2026-09-17T14:20:00Z", "2026-09-17T12:00:00+00:00", at("2026-09-17T16:31:00Z"));
    expect(h.ok).toBe(false); expect(h.problems).toEqual(["no sync with YB for 131 minutes (limit 130)"]);
  });
  it("says the data is stale when syncs go on but no new report is derived: one report may be late, two may not", () => {
    const h = health("2026-09-17T22:20:00Z", "2026-09-17T16:00:00+00:00", at("2026-09-17T22:31:00Z"));
    expect(h.ok).toBe(false); expect(h.problems).toEqual(["the latest report is 6.5 hours old (limit 6.5)"]);
    expect(health("2026-09-17T22:20:00Z", "2026-09-17T16:00:00+00:00", at("2026-09-17T22:29:00Z")).ok).toBe(true);     // 1600 + 0.2 late at 2000 is still fine until 2230
  });
  it("is unwell, and says why, when either time cannot be read", () => {
    expect(health(null, "2026-09-17T16:00:00+00:00", at("2026-09-17T16:10:00Z")).problems).toEqual(["no sync recorded"]);
    expect(health("2026-09-17T16:06:00Z", null, at("2026-09-17T16:10:00Z")).problems).toEqual(["no report derived"]);
  });
});
