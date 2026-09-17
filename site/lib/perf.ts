// site/lib/perf.ts — putting one boat's performance numbers next to the fleet's. Pure, tested.
export type Band = "upwind" | "reaching" | "running";
type PosBand = { legs: number; share: number; speed_kn: number; wind_kn: number };
type PerfLike = { team_id: number; pos_json: Partial<Record<Band, PosBand>> };
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// The place of v among the values that exist, biggest first. Boats without a value (too few legs) are not counted.
export function rankOf(values: (number | null | undefined)[], v: number | null | undefined): { place: number; of: number } | null {
  if (v == null) return null;
  const rated = values.filter((x): x is number => x != null);
  return { place: rated.filter(x => x > v).length + 1, of: rated.length };
}
// The other boats' average speed on a point of sail, weighted by legs, so that a boat is compared with the rest of the
// fleet and not with itself. Null under ten legs in all: too little to call an average.
export function restOfFleetBandSpeed(perfs: PerfLike[], band: Band, exceptTeamId: number, minLegs = 10): number | null {
  let legs = 0, sum = 0;
  for (const p of perfs) { const z = p.pos_json[band]; if (p.team_id !== exceptTeamId && z) { legs += z.legs; sum += z.speed_kn * z.legs; } }
  return legs >= minLegs ? sum / legs : null;
}
// Miles sailed along the track over miles made good toward the finish, as a share above 1. Null for a boat that restarted:
// her miles sailed count from the restart and her miles made good from the start, so the two cannot be compared.
export function extraMiles(b: { sailed_nm: number; made_good_nm: number; restart_at: string | null }): number | null {
  return b.restart_at || !(b.made_good_nm > 0) ? null : b.sailed_nm / b.made_good_nm - 1;
}
// Miles `me` gained (+) or lost (−) on `other` in 24 hours. The worker stores every boat's gain on the leader, fix to fix
// (gain24_nm; blank for a boat without a current fix, and for the leader, whose gain on the leader is nought): the gain of one
// boat on another is the difference of the two. Null when either boat has no current fix.
type Gain = { rank: number; gain24_nm: number | null };
export function gainOn(me: Gain, other: Gain): number | null {
  const g = (b: Gain) => (b.rank === 1 ? 0 : b.gain24_nm);
  const a = g(me), c = g(other);
  return a == null || c == null ? null : a - c;
}
