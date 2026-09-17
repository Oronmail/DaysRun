// site/lib/moves.ts — who moved in the last 24 hours. A place gained or lost against a boat whose fix is older (a missed
// report) is an artefact, not a move (audit N6; Method → Place), so the order now is compared with the order 24 hours
// ago among the boats that have a current fix. rank_change = rank then − rank now.
type Row = { team_id: number; rank: number; rank_change: number; stale: boolean };
export function movers<T extends Row>(boats: T[]): { ups: T[]; downs: T[]; biggest: number } {
  const fresh = boats.filter(b => !b.stale);
  const pos = (key: (b: T) => number) => new Map([...fresh].sort((a, c) => key(a) - key(c)).map((b, i) => [b.team_id, i] as const));
  const now = pos(b => b.rank), then = pos(b => b.rank + b.rank_change);
  const gained = (b: T) => then.get(b.team_id)! - now.get(b.team_id)!;
  const byRank = [...fresh].sort((a, c) => a.rank - c.rank);
  const ups = byRank.filter(b => gained(b) > 0), downs = byRank.filter(b => gained(b) < 0);
  return { ups, downs, biggest: ups.length ? Math.max(...ups.map(gained)) : 0 };
}
