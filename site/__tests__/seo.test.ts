// site/__tests__/seo.test.ts — what a search result, a browser tab and a share card say about each page.
import { describe, it, expect } from "vitest";
import { SITE_NAME } from "../lib/format";
import { PAGES, SITE_URL, SHARE_IMAGE, pageMeta, skipperMeta, sitemapPaths, robotsRules, websiteJsonLd, jsonLdText } from "../lib/seo";

const ROUTES = ["/", "/skippers", "/ghosts", "/records", "/records/7d", "/records/30d", "/course", "/performance", "/boats", "/conditions", "/data", "/method"];
const mara = { id: 11, name: "Mara Løvenskiold Kveseth", first_name: "Mara", yacht: "Showgirl", model: "Saltram Saga 36" };
// the longest real names, yachts and designs of the fleet: a skipper's words must fit too
const guido = { id: 3, name: "Guido Cantini", first_name: "Guido", yacht: "Hannah of Cowes", model: "Vancouver 34 Classic" };
const selim = { id: 8, name: "Selim Yalcin", first_name: "Selim", yacht: "Help Disabled Children", model: "Endurance 35" };
const all = () => [...ROUTES.map(r => PAGES[r]), ...[mara, guido, selim].map(t => skipperMeta(t).text)];

describe("the words", () => {
  it("has a title and a description for every page in the menu and every window route", () => {
    for (const r of ROUTES) { expect(PAGES[r], r).toBeDefined(); expect(PAGES[r].title.length, r).toBeGreaterThan(10); expect(PAGES[r].description.length, r).toBeGreaterThan(60); }
    expect(Object.keys(PAGES).sort()).toEqual([...ROUTES].sort());
  });
  it("never gives two pages the same title or the same description", () => {
    expect(new Set(ROUTES.map(r => PAGES[r].title)).size).toBe(ROUTES.length);
    expect(new Set(ROUTES.map(r => PAGES[r].description)).size).toBe(ROUTES.length);
  });
  it("keeps a title within what a search result shows, and names the site in it", () => {
    for (const t of all()) { expect(t.title.length, t.title).toBeLessThanOrEqual(65); expect(t.title).toContain(SITE_NAME); }
  });
  it("keeps a description within what a search result shows", () => {
    for (const t of all()) { expect(t.description.length, t.description).toBeLessThanOrEqual(165); }
  });
  it("says unofficial on every page, and names the race", () => {
    for (const t of all()) { expect(`${t.title} ${t.description}`, t.title).toMatch(/unofficial/i); expect(`${t.title} ${t.description}`, t.title).toContain("Golden Globe Race 2026"); }
  });
  it("carries no live number: a search result is read days after it was written", () => {
    for (const t of all()) expect(`${t.title} ${t.description}`, t.title).not.toMatch(/\d(st|nd|rd|th)\b|\d\s*(nm|kt|kn)\b|\bday \d|\d\.\d|\d:\d/);
  });
  it("follows the site's vocabulary: no preview, no SOG, no heading, no gendered pronoun, wind is model wind", () => {
    for (const t of all()) expect(`${t.title} ${t.description}`, t.title).not.toMatch(/preview|\bSOG\b|\bheading\b|\b(he|she|his|her|him|hers)\b/i);
    expect(`${PAGES["/conditions"].title} ${PAGES["/conditions"].description}`).toMatch(/model/i);
    expect(PAGES["/performance"].description).toMatch(/model wind/i);
  });
  it("has no apostrophe but the one in the site's name (the name is typed straight, the site's prose is not: never both in one line)", () => {
    for (const t of all()) expect(`${t.title} ${t.description}`.replaceAll(SITE_NAME, ""), t.title).not.toMatch(/['’]/);
  });
});

describe("a page's tags", () => {
  const m = pageMeta("/ghosts");
  it("gives the full title, untouched by any template, and the description", () => {
    expect(m.title).toEqual({ absolute: PAGES["/ghosts"].title }); expect(m.description).toBe(PAGES["/ghosts"].description);
  });
  it("names its own address as the canonical one, and the share card agrees", () => {
    expect(m.alternates).toEqual({ canonical: "/ghosts" });
    expect(m.openGraph).toMatchObject({ url: "/ghosts", title: PAGES["/ghosts"].title, description: PAGES["/ghosts"].description, siteName: SITE_NAME, type: "website" });
  });
  it("carries the share picture with its size and a description, as a large card", () => {
    expect(SHARE_IMAGE).toMatchObject({ url: "/og.png", width: 1200, height: 630 }); expect(SHARE_IMAGE.alt).toMatch(/unofficial/i);
    expect(m.openGraph).toMatchObject({ images: [SHARE_IMAGE] }); expect(m.twitter).toMatchObject({ card: "summary_large_image", images: [SHARE_IMAGE] });
  });
  it("refuses an address it has no words for", () => { expect(() => pageMeta("/nowhere")).toThrow(); });
  it("has one site address, without a slash at its end", () => { expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/); });
});

describe("a skipper's page", () => {
  const s = skipperMeta(mara);
  it("has the full name in the title, the yacht and the design in the description", () => {
    expect(s.text.title).toBe(`Mara Løvenskiold Kveseth · Golden Globe Race 2026 · ${SITE_NAME}`);
    expect(s.text.description).toContain("Showgirl"); expect(s.text.description).toContain("Saltram Saga 36");
  });
  it("points at its own address", () => { expect(s.meta.alternates).toEqual({ canonical: "/skipper/11" }); });
  it("still reads well for a boat whose yacht or design is not listed", () => {
    const d = skipperMeta({ id: 3, name: "A Skipper", first_name: "A", yacht: null, model: null }).text.description;
    expect(d).not.toMatch(/null|undefined|\(\)| on  | {2}/); expect(d).toContain("A Skipper");
  });
});

describe("the sitemap and the robots file", () => {
  const paths = sitemapPaths([1, 2, 17]);
  it("lists every page with words, and one page per skipper", () => { for (const r of ROUTES) expect(paths).toContain(r); expect(paths).toContain("/skipper/17"); expect(paths.length).toBe(ROUTES.length + 3); });
  it("leaves out the daily board and everything under /api", () => { expect(paths.join(" ")).not.toMatch(/dons-slide|board|api/); });
  it("lets a crawler read every page (the daily board says noindex itself, which a crawler must be able to read) but nothing under /api", () => {
    expect(robotsRules()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${SITE_URL}/sitemap.xml` });
  });
});

describe("the structured data on the Fleet page", () => {
  it("describes the site by its name, its address and the home page's description", () => {
    expect(websiteJsonLd()).toEqual({ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/`, description: PAGES["/"].description, inLanguage: "en" });
  });
  it("cannot close its own script tag", () => { expect(jsonLdText({ a: "</script><b>" })).not.toContain("<"); });
});
