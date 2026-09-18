// site/lib/sort.ts — ordering for the Fleet ranking table. Pure, so it is tested without a browser.
export type SortKey = "rank" | "change" | "name" | "dtf" | "gap" | "gain" | "near" | "run" | "leg" | "wind" | "spd7" | "vdh";
export type SortDir = "asc" | "desc";
export type Win = "4h" | "24h" | "7d";
type Row = { rank: number; rank_change: number | null; dtf_nm: number; gap_nm: number; gain24_nm: number | null; vs_near_nm: number | null; run24_nm: number | null; run7_nm: number | null; spd4: number | null; spd7: number | null; vs_vdh_days: number | null; wind_ratio?: number | null; team: { name: string } };
const surname = (name: string) => name.split(" ").slice(1).join(" ").toLowerCase() || name.toLowerCase();
const value = (b: Row, key: SortKey, win: Win): number | string | null =>
  key === "rank" ? b.rank : key === "change" ? b.rank_change : key === "name" ? surname(b.team.name) : key === "dtf" ? b.dtf_nm
  : key === "gap" ? b.gap_nm : key === "gain" ? b.gain24_nm : key === "near" ? b.vs_near_nm : key === "run" ? (win === "4h" ? b.spd4 : win === "7d" ? b.run7_nm : b.run24_nm) : key === "leg" ? b.spd4 : key === "wind" ? (b.wind_ratio ?? null) : key === "spd7" ? b.spd7 : b.vs_vdh_days;
// Bigger is better for gains, runs, speed and the ghost gap, so those open longest or fastest first; the rest open ascending.
export const defaultDir = (key: SortKey): SortDir => (key === "change" || key === "gain" || key === "near" || key === "run" || key === "leg" || key === "wind" || key === "spd7" || key === "vdh" ? "desc" : "asc");
export function sortBoats<T extends Row>(boats: T[], key: SortKey, dir: SortDir, win: Win): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...boats].sort((a, c) => {
    const x = value(a, key, win), y = value(c, key, win);
    if (x == null || y == null) return x == null && y == null ? a.rank - c.rank : x == null ? 1 : -1;   // a missing value is last either way
    const d = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return d !== 0 ? sign * d : a.rank - c.rank;
  });
}
// The phone's compact row shows fewer numbers than the table, and it only offers the orderings a reader can check against the row.
export function phoneSortOptions(win: Win): { key: SortKey; label: string }[] {
  return [{ key: "rank", label: "Place" }, { key: "change", label: "Places gained, 24 h" }, { key: "name", label: "Skipper" }, { key: "dtf", label: "To go" },
    { key: "run", label: win === "4h" ? "4-hour leg speed" : win === "7d" ? "7-day run" : "24-hour run" }, { key: "gain", label: "Gained on the leader, 24 h" }, ...(win === "4h" ? [] : [{ key: "leg" as SortKey, label: "Latest 4-hour leg" }]), { key: "wind", label: "Speed for the wind" }, { key: "vdh", label: "Against Van Den Heede" }];
}
