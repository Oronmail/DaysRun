// site/__tests__/nav.test.ts — the menu: the owner's order (18 Sep 2026), and no entry without its words.
import { describe, it, expect } from "vitest";
import { NAV } from "../lib/nav";
import { PAGES } from "../lib/seo";
describe("the menu", () => {
  it("runs in the order the owner set: the race first, then how it is sailed, then the boats and the past, Method last", () => {
    expect(NAV.map(([name]) => name)).toEqual(["Fleet", "Skippers", "Course & sprints", "Records", "Performance", "Conditions", "Boats", "Ghost race", "Method"]);
  });
  it("sends every entry to an address of its own that has a title and a description", () => {
    const hrefs = NAV.map(([, href]) => href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(PAGES[h], h).toBeDefined();
  });
});
