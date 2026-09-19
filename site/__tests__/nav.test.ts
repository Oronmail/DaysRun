// site/__tests__/nav.test.ts — the menu: the owner's order (18 Sep 2026), and no entry without its words.
import { describe, it, expect } from "vitest";
import { NAV, DESKTOP_ONLY } from "../lib/nav";
import { PAGES } from "../lib/seo";
describe("the menu", () => {
  it("runs in the order the owner set: the race first, then how it is sailed, then the boats and the past, Method last", () => {
    expect(NAV.map(([name]) => name)).toEqual(["Fleet", "Skippers", "Course & sprints", "Records", "Performance", "Conditions", "Boats", "Ghost race", "Data", "Method"]);
  });
  it("shows Data on a desk only (the owner, 19 Sep 2026): a spreadsheet is no use on a phone, and the phone's one row is long enough", () => {
    expect(DESKTOP_ONLY).toEqual(["/data"]);
    for (const h of DESKTOP_ONLY) expect(NAV.map(([, href]) => href), h).toContain(h);
  });
  it("sends every entry to an address of its own that has a title and a description", () => {
    const hrefs = NAV.map(([, href]) => href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(PAGES[h], h).toBeDefined();
  });
});
