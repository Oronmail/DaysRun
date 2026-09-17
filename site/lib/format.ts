// site/lib/format.ts
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Day's Run";
export const STRAPLINE = "unofficial statistics for the Golden Globe Race 2026";
export const nm = (n: number | null | undefined) => n == null ? "—" : Math.round(n).toLocaleString("en-US");
export const kn = (n: number | null | undefined, d = 1) => n == null ? "—" : n.toFixed(d);
export function sgn(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  const v = Math.abs(n).toFixed(d);
  return n > 0 ? `+${v}` : n < 0 ? `−${v}` : `±${v}`;
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
export const hoursText = (h: number) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`; };   // whole minutes first, so 59.995 h is 60 h 00 m, not 59 h 60 m
