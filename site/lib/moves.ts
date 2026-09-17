// site/lib/moves.ts — who moved in the last 24 hours. A place gained or lost against a boat whose fix is older (a missed
// report) is an artefact, not a move (audit N6; Method → Place), so the order now is compared with the order 24 hours
// ago among the boats that have a current fix. rank_change = rank then − rank now.
type Row = { team_id: number; rank: number; rank_change: number; stale: boolean };
// Places gained (+) or lost (−) in 24 hours by each boat with a current fix, counted among those boats only.
export function placesGained<T extends Row>(boats: T[]): Map<number, number> {
  const fresh = boats.filter(b => !b.stale);
  const pos = (key: (b: T) => number) => new Map([...fresh].sort((a, c) => key(a) - key(c)).map((b, i) => [b.team_id, i] as const));
  const now = pos(b => b.rank), then = pos(b => b.rank + b.rank_change);
  return new Map(fresh.map(b => [b.team_id, then.get(b.team_id)! - now.get(b.team_id)!] as const));
}
// The same, grouped for a line of text the way the feed groups it: [[2, ["Louis"]], [1, ["Henry", "Pär"]]] and the losses likewise.
export function placeGroups<T extends Row & { team: { first_name: string | null; name: string } }>(boats: T[]): { ups: [number, string[]][]; downs: [number, string[]][] } {
  const g = placesGained(boats), ups = new Map<number, string[]>(), downs = new Map<number, string[]>();
  for (const b of [...boats].sort((a, c) => a.rank - c.rank)) { const n = g.get(b.team_id) ?? 0; if (n) { const m = n > 0 ? ups : downs, k = Math.abs(n); m.set(k, [...(m.get(k) ?? []), b.team.first_name ?? b.team.name]); } }
  const out = (m: Map<number, string[]>) => [...m].sort((a, c) => c[0] - a[0]);
  return { ups: out(ups), downs: out(downs) };
}
export function movers<T extends Row>(boats: T[]): { ups: T[]; downs: T[]; biggest: number } {
  const fresh = boats.filter(b => !b.stale), g = placesGained(boats);
  const gained = (b: T) => g.get(b.team_id)!;
  const byRank = [...fresh].sort((a, c) => a.rank - c.rank);
  const ups = byRank.filter(b => gained(b) > 0), downs = byRank.filter(b => gained(b) < 0);
  return { ups, downs, biggest: ups.length ? Math.max(...ups.map(gained)) : 0 };
}
