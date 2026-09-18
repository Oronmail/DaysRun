// site/lib/slide.ts — the numbers and sentences of the daily slide (/dons-slide): one screen for the race's daily live, covering the
// 24 hours to the latest report. Pure, tested. The rules that matter on air: a run with a leg missing (the tracker was silent) is a
// straight line, a lower bound, so it is drawn as such and never counted as the biggest run or in the fleet's average; a boat
// without a current fix stands last and is compared with nobody.
const H4 = 4 * 3600 * 1000, DAY = 6 * H4;
const ms = (iso: string) => new Date(iso).getTime();
export type SlideLeg = { team_id: number; end_slot: string; dist_nm: number | null; speed_kn: number | null };
export type SlideBoat = { team_id: number; rank: number; stale: boolean; last_fix_at: string; run24_nm: number | null; best24_nm?: number | null; spd24: number | null; pb24: boolean; fleet_best24: boolean; gain24_nm: number | null; team: { first_name: string | null; name: string } };
export type Leg = { nm: number; kt: number } | null;
export type Column = { team_id: number; first: string; place: number; run: number | null; pb: boolean; stale: boolean; legs: Leg[]; bridgedNm: number; dayBefore: number | null;
  /** The report hour this column's 24 hours end at, set ONLY when that is not the board's own report: a boat that missed it. */
  endsAt: string | null };
const slotOf = (iso: string) => new Date(Math.round(ms(iso) / H4) * H4).toISOString();      // the 4-hour report a fix belongs to (the worker's grid)
const SLOT_TOL = 20 * 60 * 1000;      // the worker takes a fix within 20 minutes of a report hour and no other: off the grid, which window its run covers cannot be known
const NO_LEGS: Leg[] = [null, null, null, null, null, null];
const first = (b: SlideBoat) => b.team.first_name ?? b.team.name;

// The six 4-hour legs ending at the report, oldest first; null where a leg could not be measured.
export function sixLegs(legs: SlideLeg[], teamId: number, asOf: string): Leg[] {
  const end = ms(asOf), by = new Map(legs.filter(l => l.team_id === teamId).map(l => [ms(l.end_slot), l]));
  return [5, 4, 3, 2, 1, 0].map(back => { const l = by.get(end - back * H4); return l && l.dist_nm != null && l.speed_kn != null ? { nm: l.dist_nm, kt: l.speed_kn } : null; });
}
const complete = (six: Leg[]) => six.every(l => l != null);
/** A run is a personal best when it equals the boat's own best so far, to the mile as printed. The worker's pb24 says so for every
 *  boat EXCEPT the one with the fleet's longest run of the day (fleet_best24), which it leaves out on purpose: so that flag alone
 *  never means a personal best (18 Sep 2026: Henry's 159 nm, the longest of the day, was labelled one a day after his 180). */
export function isPersonalBest(b: { run24_nm: number | null; best24_nm?: number | null; pb24: boolean }): boolean {
  return b.pb24 || (b.run24_nm != null && b.best24_nm != null && Math.round(b.run24_nm) >= Math.round(b.best24_nm));
}
export function columns(now: SlideBoat[], before: SlideBoat[], legs: SlideLeg[], asOf: string): Column[] {
  const was = new Map(before.map(b => [b.team_id, b])), dayEarlier = new Date(ms(asOf) - DAY).toISOString();
  const cols = now.map(b => {
    // A boat that missed this report still has a whole 24-hour run: the one ending at ITS OWN last report (the worker anchors every
    // window on the boat's last 4-hour slot). The board draws that run, faded and labelled with that hour, rather than an empty
    // column — but only when it is fair to: a measured leg in the window, and a last report inside the last 24 hours. It is never
    // mixed into the figures that measure the same 24 hours for the whole fleet (the biggest run, the average, the leader line).
    const ends = b.stale ? slotOf(b.last_fix_at) : asOf, six = sixLegs(legs, b.team_id, ends), p = was.get(b.team_id);
    const fair = !b.stale || (b.run24_nm != null && Math.abs(ms(b.last_fix_at) - ms(ends)) <= SLOT_TOL && ms(asOf) - ms(ends) <= DAY);
    const run = fair ? b.run24_nm : null, known = six.reduce((n, l) => n + (l?.nm ?? 0), 0);
    return { team_id: b.team_id, first: first(b), place: b.rank, run, pb: isPersonalBest(b), stale: b.stale, legs: fair ? six : NO_LEGS,
      endsAt: b.stale && fair ? ends : null,
      bridgedNm: !fair || complete(six) || run == null ? 0 : Math.max(0, run - known),
      dayBefore: !b.stale && p && !p.stale && p.run24_nm != null && complete(sixLegs(legs, b.team_id, dayEarlier)) ? p.run24_nm : null }; });
  const key = (c: Column) => (c.run == null ? -1 : c.run);
  return cols.sort((a, c) => (a.stale !== c.stale ? (a.stale ? 1 : -1) : key(c) - key(a) || a.place - c.place));
}
/** A boat that is not moving: its newest measured 4-hour leg is under 0.8 nm, which is 0.2 kt. A boat stopped at a mark or in a
 *  marina reports a few metres of wander (Guy deBoer at Lanzarote on 18 Sep 2026: 0.28 nm in four hours), while a boat becalmed
 *  still drifts with the current, so the line is drawn low enough that weather alone never crosses it. Its own run, bar and place
 *  are its own and stay; it is the FLEET's average that leaves it out, for as long as it lies there and not a report longer. */
const STOPPED_KN = 0.2;
export function isStopped(c: Column): boolean {
  const newest = [...c.legs].reverse().find(l => l != null);
  return !c.stale && newest != null && newest.kt < STOPPED_KN;
}
const counted = (c: Column) => !c.stale && c.run != null && complete(c.legs);
export const biggestRun = (cols: Column[]): Column | null => cols.filter(counted).sort((a, c) => c.run! - a.run!)[0] ?? null;
export function fleetAverage(cols: Column[]): number | null { const r = cols.filter(c => counted(c) && !isStopped(c)).map(c => c.run!); return r.length ? r.reduce((a, c) => a + c, 0) / r.length : null; }
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
// Against the 2018 winner: YB replays Van Den Heede's voyage day for day, so on any race day his distance to finish can be set against
// the leader's. Miles on the same day are measured; the site's "days ahead" is partly an extrapolation and stays off the slide.
export function ghostLine(leader: string, vsVdhNm: number | null, aheadOfVdh: number, racing: number, raceDay: number): { head: string; rest: string } | null {
  if (vsVdhNm == null) return null;
  const n = Math.round(vsVdhNm), count = aheadOfVdh <= 0 ? "no boat is" : aheadOfVdh >= racing ? "the whole fleet is" : `${aheadOfVdh} of ${racing} boats ${aheadOfVdh === 1 ? "is" : "are"}`;
  const where = `where Van Den Heede, the 2018 winner, was on day ${raceDay} · ${count} ahead of that pace`;
  return n === 0 ? { head: `${leader} is level`, rest: `with ${where}` } : { head: `${leader} is ${Math.abs(n)} nm ${n > 0 ? "ahead" : "behind"}`, rest: n > 0 ? `of ${where}` : where };
}

// The day before, under each name: how many miles more or fewer than the run of 24 hours earlier. Rounded before judged, so the
// difference always agrees with the two figures as printed. Blank without a fair comparison: a boat that missed the report, no
// complete day before, or a run across a silent tracker (a minimum: a difference from it would be a guess).
export function runChange(c: { stale: boolean; run: number | null; dayBefore: number | null; bridgedNm: number }): number | null {
  return c.stale || c.run == null || c.dayBefore == null || c.bridgedNm > 0 ? null : Math.round(c.run) - Math.round(c.dayBefore);
}
/** The chart's scale: the longest run it draws, never tighter than 190 nm, so the bars of one day can be set against another's. */
export function scaleMax(cols: { run: number | null }[]): number {
  return Math.max(190, ...cols.flatMap(c => (c.run == null ? [] : [c.run])));
}
