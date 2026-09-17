// site/lib/slide.ts — the numbers and sentences of the daily slide (/dons-slide): one screen for the race's daily live, covering the
// 24 hours to the latest report. Pure, tested. The rules that matter on air: a run with a leg missing (the tracker was silent) is a
// straight line, a lower bound, so it is drawn as such and never counted as the biggest run or in the fleet's average; a boat
// without a current fix stands last and is compared with nobody.
const H4 = 4 * 3600 * 1000, DAY = 6 * H4;
const ms = (iso: string) => new Date(iso).getTime();
export type SlideLeg = { team_id: number; end_slot: string; dist_nm: number | null; speed_kn: number | null };
export type SlideBoat = { team_id: number; rank: number; stale: boolean; run24_nm: number | null; spd24: number | null; pb24: boolean; fleet_best24: boolean; gain24_nm: number | null; team: { first_name: string | null; name: string } };
export type Leg = { nm: number; kt: number } | null;
export type Column = { team_id: number; first: string; place: number; run: number | null; kt: number | null; pb: boolean; stale: boolean; legs: Leg[]; bridgedNm: number; dayBefore: number | null; wind: number | null };
const first = (b: SlideBoat) => b.team.first_name ?? b.team.name;

// The six 4-hour legs ending at the report, oldest first; null where a leg could not be measured.
export function sixLegs(legs: SlideLeg[], teamId: number, asOf: string): Leg[] {
  const end = ms(asOf), by = new Map(legs.filter(l => l.team_id === teamId).map(l => [ms(l.end_slot), l]));
  return [5, 4, 3, 2, 1, 0].map(back => { const l = by.get(end - back * H4); return l && l.dist_nm != null && l.speed_kn != null ? { nm: l.dist_nm, kt: l.speed_kn } : null; });
}
const complete = (six: Leg[]) => six.every(l => l != null);
export function columns(now: SlideBoat[], before: SlideBoat[], legs: SlideLeg[], asOf: string, winds: Map<number, number>): Column[] {
  const was = new Map(before.map(b => [b.team_id, b])), dayEarlier = new Date(ms(asOf) - DAY).toISOString();
  const cols = now.map(b => { const six = sixLegs(legs, b.team_id, asOf), known = six.reduce((n, l) => n + (l?.nm ?? 0), 0), p = was.get(b.team_id);
    return { team_id: b.team_id, first: first(b), place: b.rank, run: b.run24_nm, kt: b.spd24, pb: b.pb24 || b.fleet_best24, stale: b.stale, legs: six,
      bridgedNm: complete(six) || b.run24_nm == null ? 0 : Math.max(0, b.run24_nm - known),
      dayBefore: p && !p.stale && p.run24_nm != null && complete(sixLegs(legs, b.team_id, dayEarlier)) ? p.run24_nm : null, wind: winds.get(b.team_id) ?? null }; });
  const key = (c: Column) => (c.stale || c.run == null ? -1 : c.run);
  return cols.sort((a, c) => (a.stale !== c.stale ? (a.stale ? 1 : -1) : key(c) - key(a) || a.place - c.place));
}
const counted = (c: Column) => !c.stale && c.run != null && complete(c.legs);
export const biggestRun = (cols: Column[]): Column | null => cols.filter(counted).sort((a, c) => c.run! - a.run!)[0] ?? null;
export function fleetAverage(cols: Column[]): number | null { const r = cols.filter(counted).map(c => c.run!); return r.length ? r.reduce((a, c) => a + c, 0) / r.length : null; }
export function fastestLeg(legs: SlideLeg[], boats: SlideBoat[], asOf: string): { team_id: number; first: string; kt: number; end_slot: string } | null {
  const end = ms(asOf), names = new Map(boats.map(b => [b.team_id, first(b)]));
  const best = legs.filter(l => l.speed_kn != null && names.has(l.team_id) && ms(l.end_slot) > end - DAY && ms(l.end_slot) <= end).sort((a, c) => c.speed_kn! - a.speed_kn!)[0];
  return best ? { team_id: best.team_id, first: names.get(best.team_id)!, kt: best.speed_kn!, end_slot: best.end_slot } : null;
}
// Miles gained or lost on the leader in 24 hours (gain24_nm: fix to fix, blank without a current fix). Rounded before judged.
export function leaderLine(boats: SlideBoat[]): { who: string; nm: number; text: string; worst: { who: string; nm: number } | null } | null {
  const leader = boats.find(b => b.rank === 1), rated = boats.filter(b => b.rank !== 1 && !b.stale && b.gain24_nm != null).map(b => ({ who: first(b), nm: Math.round(b.gain24_nm!) })).sort((a, c) => c.nm - a.nm);
  if (!leader || !rated.length) return null;
  const top = rated[0], gainers = rated.filter(r => r.nm > 0).length, last = rated[rated.length - 1], L = first(leader);
  const text = gainers === 1 ? `the only boat to gain on ${L}` : gainers > 1 ? `gained the most on ${L}, one of ${gainers} boats to gain` : `lost the least on ${L}: nobody gained`;
  return { who: top.who, nm: top.nm, text, worst: last !== top ? last : null };
}
// The feed says "Louis passes Guy and leads by 2 nm, after trailing by 16 nm three days ago"; a day later the slide says it in the past.
export function passLine(title: string): string {
  const m = title.match(/^(\S+) passes (\S+) and leads by \d+ nm(?:, (after trailing by \d+ nm) three days ago)?$/);
  return m ? `${m[1]} passed ${m[2]}${m[3] ? `, ${m[3]}` : ""}` : title;
}
// The passes tile: the two newest passes of the 24 hours (titles newest first); on a day without one, the closest duel instead.
export function passesTile(titles: string[], closest: { ahead: string; behind: string; gap_nm: number } | null): string[] {
  if (titles.length) return titles.slice(0, 2).map(passLine);
  return closest ? ["No pass in 24 hours", `Closest: ${closest.ahead} leads ${closest.behind} by ${closest.gap_nm < 1 ? "under 1" : Math.round(closest.gap_nm)} nm`] : ["No pass in 24 hours"];
}
// The mean model wind at each boat over the day's reports, in knots.
export function meanWinds(rows: { team_id: number; fix_at: string; wind_kn: number | null }[], asOf: string): Map<number, number> {
  const end = ms(asOf) + 20 * 60 * 1000, sums = new Map<number, [number, number]>();
  for (const r of rows) if (r.wind_kn != null && ms(r.fix_at) > end - DAY - 20 * 60 * 1000 && ms(r.fix_at) <= end) { const s = sums.get(r.team_id) ?? [0, 0]; sums.set(r.team_id, [s[0] + r.wind_kn, s[1] + 1]); }
  return new Map([...sums].map(([id, [sum, n]]) => [id, Math.round(sum / n)]));
}
