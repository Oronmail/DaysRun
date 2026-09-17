// site/lib/sort.ts — ordering for the Fleet ranking table. Pure, so it is tested without a browser.
export type SortKey = "rank" | "change" | "name" | "lat" | "dtf" | "gap" | "run" | "spd7" | "vdh";
export type SortDir = "asc" | "desc";
export type Win = "4h" | "24h" | "7d";
type Row = { rank: number; rank_change: number; dtf_nm: number; gap_nm: number; lat: number; run24_nm: number | null; run7_nm: number | null; spd4: number | null; spd7: number | null; vs_vdh_days: number | null; team: { name: string } };
const surname = (name: string) => name.split(" ").slice(1).join(" ").toLowerCase() || name.toLowerCase();
const value = (b: Row, key: SortKey, win: Win): number | string | null =>
  key === "rank" ? b.rank : key === "change" ? b.rank_change : key === "name" ? surname(b.team.name) : key === "lat" ? b.lat : key === "dtf" ? b.dtf_nm
  : key === "gap" ? b.gap_nm : key === "run" ? (win === "4h" ? b.spd4 : win === "7d" ? b.run7_nm : b.run24_nm) : key === "spd7" ? b.spd7 : b.vs_vdh_days;
// Bigger is better for gains, runs, speed and the ghost gap, so those open longest or fastest first; the rest open ascending.
export const defaultDir = (key: SortKey): SortDir => (key === "change" || key === "run" || key === "spd7" || key === "vdh" ? "desc" : "asc");
export function sortBoats<T extends Row>(boats: T[], key: SortKey, dir: SortDir, win: Win): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...boats].sort((a, c) => {
    const x = value(a, key, win), y = value(c, key, win);
    if (x == null || y == null) return x == null && y == null ? a.rank - c.rank : x == null ? 1 : -1;   // a missing value is last either way
    const d = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return d !== 0 ? sign * d : a.rank - c.rank;
  });
}
