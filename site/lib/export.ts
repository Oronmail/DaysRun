// site/lib/export.ts — the data files of the Data page: one workbook per calendar month of the race, and nothing else. Which
// month a report belongs to, what a month's file is called, and which files a ping renews.
// A report belongs to the month in which its hours were SAILED: the 00:00 UTC report of 1 October closes 30 September, so it is
// September's last row. Hence a month holds the reports AFTER its 1st at 00:00 UTC, UP TO AND INCLUDING the next 1st at 00:00 UTC.
export const FILE_PREFIX = "daysrun-ggr2026";
export const monthFile = (month: string) => `${FILE_PREFIX}-${month}.xlsx`;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const monthOf = (asOfIso: string): string => new Date(Date.parse(asOfIso) - 1000).toISOString().slice(0, 7);
export const monthLabel = (month: string): string => `${NAMES[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`;
export function monthBounds(month: string): { after: string; upTo: string } {
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  return { after: new Date(Date.UTC(y, m - 1, 1)).toISOString(), upTo: new Date(Date.UTC(y, m, 1)).toISOString() };
}
// Every month of the race so far, oldest first. None before the first report.
export function monthsOfRace(startIso: string, latestReportIso: string): string[] {
  const out: string[] = [], last = monthOf(latestReportIso);
  for (const d = new Date(Date.UTC(+startIso.slice(0, 4), +startIso.slice(5, 7) - 1, 1)); ; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const m = d.toISOString().slice(0, 7);
    if (m > last) return out;
    out.push(m);
  }
}
// A file name back to its month, or nothing at all. Anything else — another prefix, a month that is not 01…12, a path — is not a file.
export function parseFile(name: string): string | null {
  const m = name.startsWith(`${FILE_PREFIX}-`) && name.endsWith(".xlsx") ? name.slice(FILE_PREFIX.length + 1, -".xlsx".length) : "";
  return MONTH.test(m) ? m : null;
}
// Whether a month's file can exist at all, WITHOUT asking the database: from the month of the start to the month being sailed.
// The file route asks this first, so an invented name costs nothing; before it did, every new name cost two reads (found 19 Sep 2026).
export const FIRST_MONTH = "2026-09";
export const monthCanExist = (month: string, nowMs: number): boolean => month >= FIRST_MONTH && month <= monthOf(new Date(nowMs).toISOString());
// What the worker's ping renews: the month being sailed, and the month of 24 hours ago. The last one matters on the 1st: the
// 00:00 report closes the month before, and its model weather may arrive an hour or two later.
export function filesToRenew(nowMs: number): string[] {
  const months = new Set([monthOf(new Date(nowMs).toISOString()), monthOf(new Date(nowMs - 24 * 3600 * 1000).toISOString())]);
  return [...months].sort().map(monthFile);
}
// GGR's numbering: the UTC date minus the start date (6 September = day 0).
export const raceDayOf = (dateIso: string, startIso: string): number =>
  Math.round((Date.parse(dateIso.slice(0, 10) + "T00:00:00Z") - Date.parse(startIso.slice(0, 10) + "T00:00:00Z")) / 86400000);
