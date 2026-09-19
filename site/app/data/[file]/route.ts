// site/app/data/[file]/route.ts — the data files: one workbook per calendar month of the race, each holding that month in full.
// Static: a file is built once and served from the CDN until the worker's ping names it (api/revalidate renews the month being
// sailed). A finished month is rebuilt only by a deploy or a full re-derive, so it can never disagree with the site. A new month
// needs no deploy. A month's file is about 1 MB at most, far below the 4.5 MB a response may be; if one ever nears it, Sentry hears first.
import * as Sentry from "@sentry/nextjs";
import { exportReports, latestFleet, raceSetup } from "@/lib/db";
import { monthBounds, monthFile, monthLabel, monthsOfRace, parseFile } from "@/lib/export";
import { SITE_HOST } from "@/lib/format";
import { XLSX_TYPE, buildWorkbook } from "@/lib/xlsx";
export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = false;
const WARN_BYTES = 3_000_000;

export async function generateStaticParams() {
  const [fleet, setup] = await Promise.all([latestFleet(), raceSetup()]);
  return monthsOfRace(setup.start_at, fleet.as_of).map(m => ({ file: monthFile(m) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const month = parseFile(file);
  const [fleet, setup] = await Promise.all([latestFleet(), raceSetup()]);
  if (!month || !monthsOfRace(setup.start_at, fleet.as_of).includes(month)) return new Response("Not found", { status: 404 });

  const { after, upTo } = monthBounds(month);
  const reports = await exportReports(after, upTo);
  const newest = reports.reduce((m, r) => (r.as_of > m ? r.as_of : m), "");
  const complete = Date.parse(fleet.as_of) >= Date.parse(upTo);
  const buf = await buildWorkbook({
    siteHost: SITE_HOST, startIso: setup.start_at, madeIso: new Date().toISOString(),
    title: `Golden Globe Race 2026 · ${monthLabel(month)} · every number`,
    period: complete ? `${monthLabel(month)}, complete` : `${monthLabel(month)} so far: the month is still being sailed`,
    standing: reports.filter(r => r.as_of === newest), daily: reports.filter(r => r.closes_day), reports });

  if (buf.length > WARN_BYTES) {
    Sentry.captureMessage(`data file ${file} is ${(buf.length / 1e6).toFixed(1)} MB; a response may be 4.5 MB at most`, "warning");
    await Sentry.flush(2000);
  }
  return new Response(new Uint8Array(buf), { headers: { "content-type": XLSX_TYPE, "content-disposition": `attachment; filename="${file}"` } });
}
