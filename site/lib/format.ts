// site/lib/format.ts
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Day's Run";
export const STRAPLINE = "unofficial statistics for the Golden Globe Race 2026";
export const nm = (n: number | null | undefined) => n == null ? "—" : Math.round(n).toLocaleString("en-US");
export const kn = (n: number | null | undefined, d = 1) => n == null ? "—" : n.toFixed(d);
export function sgn(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  const r = Number(n.toFixed(d)), v = Math.abs(r).toFixed(d);          // sign of the ROUNDED value, so 0.4 at no decimals is ±0, not +0
  return r > 0 ? `+${v}` : r < 0 ? `−${v}` : `±${v}`;
}
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return "—"; const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
export function dayMon(iso: string | null | undefined): string {
  if (!iso) return "—"; const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`;
}
export function dayMonTime(iso: string | null | undefined): string { return iso ? `${dayMon(iso)} ${hhmm(iso)}` : "—"; }
export function dateline(iso: string, raceDay: number): string {
  const d = new Date(iso); const days = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
  return `RACE DAY ${raceDay} · ${days[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()].toUpperCase()} ${d.getUTCFullYear()} · ${hhmm(iso)} UTC`;
}
// The dateline of a page carries the time it is now (a reader takes a dateline for the present), and reportLabel beside it says
// which 4-hourly report the numbers belong to. The race day is GGR's: the UTC date minus the start date, so it moves on at
// midnight UTC even before the 0000 report is in. A clock behind the report (a visitor's clock set wrong) shows the report's time.
export function datelineNow(nowMs: number, asOfIso: string, raceDayAtAsOf: number): string {
  const asOf = new Date(asOfIso).getTime(), now = Math.max(nowMs, asOf), DAY = 86400000;
  const days = Math.floor(now / DAY) - Math.floor(asOf / DAY);
  return dateline(new Date(now).toISOString(), raceDayAtAsOf + days);
}
export function reportLabel(nowMs: number, asOfIso: string): string {
  const sameDay = Math.floor(Math.max(nowMs, new Date(asOfIso).getTime()) / 86400000) === Math.floor(new Date(asOfIso).getTime() / 86400000);
  return `POSITIONS FROM THE ${hhmm(asOfIso)} UTC REPORT${sameDay ? "" : `, ${dayMon(asOfIso).toUpperCase()}`}`;
}
export const hoursText = (h: number) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`; };   // whole minutes first, so 59.995 h is 60 h 00 m, not 59 h 60 m
