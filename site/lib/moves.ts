// site/lib/moves.ts — who moved in the last 24 hours. A place gained or lost against a boat whose fix is older (a missed
// report) is an artefact, not a move (audit N6; Method → Place). Since 18 Sep 2026 the worker says so at its source
// (stats.place_changes): rank_change = places gained among the boats with a current fix now AND 24 hours ago, blank for any
// other boat. The site trusts that one figure everywhere: the table, the feed's line, the daily board's tile.
type Row = { team_id: number; rank: number; rank_change: number | null; stale: boolean };
// Places gained (+) or lost (−) in 24 hours by each boat that has the figure and a current fix.
export function placesGained<T extends Row>(boats: T[]): Map<number, number> {
  return new Map(boats.filter(b => !b.stale && b.rank_change != null).map(b => [b.team_id, b.rank_change as number] as const));
}
// The same, grouped for a line of text the way the feed groups it: [[2, ["Louis"]], [1, ["Henry", "Pär"]]] and the losses likewise.
export function placeGroups<T extends Row & { team: { first_name: string | null; name: string } }>(boats: T[]): { ups: [number, string[]][]; downs: [number, string[]][] } {
  const g = placesGained(boats), ups = new Map<number, string[]>(), downs = new Map<number, string[]>();
  for (const b of [...boats].sort((a, c) => a.rank - c.rank)) { const n = g.get(b.team_id) ?? 0; if (n) { const m = n > 0 ? ups : downs, k = Math.abs(n); m.set(k, [...(m.get(k) ?? []), b.team.first_name ?? b.team.name]); } }
  const out = (m: Map<number, string[]>) => [...m].sort((a, c) => c[0] - a[0]);
  return { ups: out(ups), downs: out(downs) };
}
export function movers<T extends Row>(boats: T[]): { ups: T[]; downs: T[]; biggest: number } {
  const g = placesGained(boats), fresh = boats.filter(b => g.has(b.team_id));
  const gained = (b: T) => g.get(b.team_id)!;
  const byRank = [...fresh].sort((a, c) => a.rank - c.rank);
  const ups = byRank.filter(b => gained(b) > 0), downs = byRank.filter(b => gained(b) < 0);
  return { ups, downs, biggest: ups.length ? Math.max(...ups.map(gained)) : 0 };
}
