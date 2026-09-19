// site/__tests__/xlsx.test.ts — a month's workbook as a file: its sheets, that any two months stack, its notices, its size, and no author in it.
import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildWorkbook, aboutLines } from "../lib/xlsx";
import type { ExportRaw } from "../lib/export-columns";
const base = { as_of: "2026-09-17T00:00:00+00:00", team_id: 8, closes_day: true, skipper: "Selim Yalcin", yacht: "Help Disabled Children", design: "Endurance 35", country: "TUR", rank: 16, dtf_nm: 25092.2, last_fix_at: "2026-09-17T00:00:15+00:00", stale: false, lat: 38.6, lon: -10.18 } as ExportRaw;
const fleet = (asOf: string, n = 16): ExportRaw[] => Array.from({ length: n }, (_, i) => ({ ...base, as_of: asOf, team_id: i + 1, rank: i + 1, skipper: `Skipper ${String.fromCharCode(65 + i)}`, run24_nm: 120 + i, legs_complete: 6 }));
// A whole month: 31 days x 6 reports x 16 boats, the most a file ever holds.
const month = (y: number, m: number, days = 31) => Array.from({ length: days * 6 }, (_, i) => fleet(new Date(Date.UTC(y, m - 1, 1, 4 * (i + 1))).toISOString())).flat();
const input = (reports: ExportRaw[]) => ({ title: "Golden Globe Race 2026 · September 2026", period: "September 2026, complete", siteHost: "daysrun.net", startIso: "2026-09-06T12:30:00+00:00", madeIso: "2026-09-17T00:06:00.000Z", standing: reports.slice(-16), daily: reports.filter(r => r.as_of.slice(11, 13) === "00"), reports });
const files = (buf: Buffer) => unzipSync(new Uint8Array(buf));
const names = (buf: Buffer) => [...strFromU8(files(buf)["xl/workbook.xml"]).matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m => m[1]);
const firstRow = (buf: Buffer, sheetIndex: number) => (strFromU8(files(buf)[`xl/worksheets/sheet${sheetIndex}.xml`]).match(/<row[^>]*>[\s\S]*?<\/row>/) ?? [""])[0];

describe("a month’s data file", () => {
  it("is an .xlsx with the sheets in reading order", async () => {
    const buf = await buildWorkbook(input(month(2026, 9)));
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(names(buf)).toEqual(["About", "Standing", "Daily", "Every report", "Boats", "Columns"]);
  });
  it("gives every month the same columns in the same order, so two months stack", async () => {
    const [sep, may] = await Promise.all([buildWorkbook(input(month(2026, 9, 30))), buildWorkbook(input(month(2027, 5, 31)))]);
    for (const sheet of [2, 3, 4, 5]) expect(firstRow(may, sheet), `sheet ${sheet}`).toBe(firstRow(sep, sheet));   // the header rows, cell for cell
    expect(names(may)).toEqual(names(sep));
  });
  it("says unofficial, carries the do-not-relay notice of NOR F.8.2, names YB's public feed and Open-Meteo and asks only that their guidelines be followed, calls the wind a model, and says how to put months together", () => {
    const text = aboutLines({ title: "t", period: "p", siteHost: "daysrun.net", madeIso: "2026-09-17T00:06:00.000Z", newestIso: "2026-09-17T00:00:00+00:00" }).map(l => l.join(" ")).join("\n");
    for (const must of [/Unofficial/, /Not affiliated/, /may be relayed to a competitor \(Notice of Race F\.8\.2\)/, /YB Tracking’s public feed/, /Open-Meteo, licensed CC BY 4\.0/, /Model values/, /never means zero/, /they stack/, /daysrun\.net\/data/, /2026-09-17 00:00 UTC/, /please follow those sources’ guidelines/]) expect(text).toMatch(must);
    expect(text).not.toMatch(/with (its |their )?permission|free to use/i);      // the site has no permission from YB and must never say it has
    expect(text).not.toMatch(/please credit|grants no rights|approval/i);        // the owner, 19 Sep 2026: too harsh; no credit asked, only the sources' guidelines
  });
  it("names nobody: no author, no last-modified-by, anywhere in the file", async () => {
    const meta = Object.entries(files(await buildWorkbook(input(month(2026, 9, 2))))).filter(([f]) => f.startsWith("docProps/")).map(([, d]) => strFromU8(d)).join("");
    expect(meta).not.toMatch(/<dc:creator>[^<]+<|<cp:lastModifiedBy>[^<]+</);
  });
  it("stays far below the 4.5 MB a response may be, for the longest month there can be", async () => {
    const reports = month(2026, 12, 31);
    const buf = await buildWorkbook(input(reports));
    expect(reports).toHaveLength(2976); expect(buf.length).toBeLessThan(2_000_000);
  });
});
