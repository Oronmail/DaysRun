// site/lib/tips.ts — the words a chart shows about the bar or the point under the pointer (or under a finger: a tap opens the
// same box). The site's vocabulary holds here too: average speed on a 4-hour leg, times as 20:00, a day named by its date.
import { dayMon, hhmm } from "./format";
export type Tip = { title: string; lines: string[] };
const H4 = 4 * 3600 * 1000;
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
export function legTip(kt: number | null, endISO: string, top: boolean): Tip {
  const end = new Date(endISO), start = new Date(end.getTime() - H4), s = start.toISOString(), e = end.toISOString();
  const title = dayMon(s) === dayMon(e) ? `${dayMon(s)} · ${hhmm(s)} to ${hhmm(e)} UTC` : `${dayMon(s)} ${hhmm(s)} to ${dayMon(e)} ${hhmm(e)} UTC`;
  return { title, lines: kt == null ? ["no speed: a report is missing at one end of this leg"] : [`${kt.toFixed(1)} kt average speed`, ...(top ? ["the fastest leg of the seven days"] : [])] };
}
/** A daily run is stored at the 00:00 report that ends it: the run stored on the 17th is the 16th's. */
export function dayRunTip(nmSailed: number | null, storedAtISO: string, top: boolean): Tip {
  const day = dayMon(new Date(new Date(storedAtISO).getTime() - 24 * 3600 * 1000).toISOString());
  return { title: `${day} · 00:00 to 00:00 UTC`, lines: nmSailed == null ? ["not enough reports that day to measure a full 24 hours"] : [`${Math.round(nmSailed)} nm sailed along the track`, ...(top ? ["the biggest day shown"] : [])] };
}
export const placeTip = (rank: number, atISO: string): Tip => ({ title: `${dayMon(atISO)} · ${hhmm(atISO)} UTC`, lines: [`${ord(rank)} place`] });
export function windTip(first: string, ratio: number, legs: number, median: number | null): Tip {
  const d = median == null ? null : Math.round(ratio * 100) - Math.round(median * 100);
  return { title: first, lines: [`${Math.round(ratio * 100)}% of the model wind speed`, `${legs} legs sailed in 8–25 kt since the start`,
    ...(d == null ? [] : [d === 0 ? "on the fleet’s median" : `${Math.abs(d)} point${Math.abs(d) === 1 ? "" : "s"} ${d > 0 ? "above" : "below"} the fleet’s median`])] };
}
const at = (iso: string) => `${dayMon(iso)} ${hhmm(iso)} UTC`;
export const racePlaceTip = (first: string, rank: number, atISO: string): Tip => ({ title: `${first} · ${at(atISO)}`, lines: [`${ord(rank)} place`] });
export const raceGapTip = (first: string, gapNm: number, atISO: string): Tip => ({ title: `${first} · ${at(atISO)}`, lines: [Math.round(gapNm) === 0 ? "leading" : `${Math.round(gapNm).toLocaleString("en-US")} nm behind the leader`] });
/** gap > 0: a (today's leader of the pair) was ahead at that report; gap < 0: b was. t in Unix seconds, as the worker stores the series. */
export function duelTip(gapNm: number, a: string, b: string, t: number): Tip {
  const iso = new Date(t * 1000).toISOString(), g = Math.round(Math.abs(gapNm));
  return { title: `${dayMon(iso)} · ${hhmm(iso)} UTC`, lines: [Math.abs(gapNm) < 0.5 ? "level" : `${gapNm > 0 ? a : b} ${g < 1 ? "under 1" : g} nm ahead of ${gapNm > 0 ? b : a}`] };
}
export function conditionsTip(first: string, c: { wind_kn: number; gust_kn: number; wind_dir_deg: number; wave_m: number }, force: string): Tip {
  return { title: first, lines: [`${Math.round(c.wind_kn)} kt from ${String(Math.round(c.wind_dir_deg) % 360).padStart(3, "0")}°, gusts ${Math.round(c.gust_kn)} kt`, `${force} · waves ${c.wave_m.toFixed(1)} m`, "model values, not measured on board"] };
}
export const designTip = (first: string, design: string | null, spd7: number | null, rank: number): Tip =>
  ({ title: design ? `${first} · ${design}` : first, lines: [spd7 == null ? "no 7-day average yet" : `${spd7.toFixed(1)} kt average speed, last 7 days`, `${ord(rank)} place`] });
type ChartBoat = { team: { first_name: string | null; name: string }; rank: number; dtf_nm: number; spd4: number | null; cmg4: number | null; stale: boolean; position_text: string; last_fix_at: string; as_of: string };
/** A boat on the fleet chart. The leg is blank for a boat that missed the report: a leg needs a position at both ends. */
export function boatTip(b: ChartBoat): Tip {
  return { title: `${b.team.first_name ?? b.team.name} · ${ord(b.rank)}`, lines: [`${Math.round(b.dtf_nm).toLocaleString("en-US")} nm to go`,
    b.stale ? `missed the ${hhmm(b.as_of)} report` : b.spd4 == null ? "no 4-hour leg to measure" : `latest leg ${b.spd4.toFixed(1)} kt, course made good ${String(Math.round(b.cmg4 ?? 0) % 360).padStart(3, "0")}°`,
    `${b.position_text} at ${hhmm(b.last_fix_at)} UTC`] };
}
/** Which way a box opens from a point at (x, y) in a chart of width × height: toward the middle, so it never leaves the chart. */
export const side = (x: number, y: number, width: number, height: number) => `${x > width / 2 ? " flip" : ""}${y > height * 0.6 ? " up" : ""}`;
