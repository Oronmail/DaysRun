// site/lib/editions.ts — the Past races page's words and shapes, pure. Years read newest first everywhere; a sailor of a past race
// is named in full, this year's skippers by first name; no sentence carries a number that was not computed here.
import type { EditionDay, EditionBoatDay, EditionMilestone } from "./db";
import type { Tip } from "./tips";
import { dayMon, nm } from "./format";

export const YEARS = ["ggr2026", "ggr2022", "ggr2018"] as const;
export type Year = typeof YEARS[number];
export const YEAR_LABEL: Record<Year, string> = { ggr2026: "2026", ggr2022: "2022", ggr2018: "2018" };
export const YEAR_COLOR: Record<Year, string> = { ggr2026: "var(--year-2026)", ggr2022: "var(--year-2022)", ggr2018: "var(--year-2018)" };
export const YEAR_TEXT: Record<Year, string> = { ggr2026: "var(--gold-text)", ggr2022: "var(--year-2022)", ggr2018: "var(--year-2018)" };
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;

export const latestDay = (days: EditionDay[]) => days.filter(d => d.race_key === "ggr2026").sort((a, b) => b.race_day - a.race_day)[0];
export const sameDay = (days: EditionDay[], raceDay: number) => YEARS.map(y => days.find(d => d.race_key === y && d.race_day === raceDay)).filter((d): d is EditionDay => !!d);

type SeriesField = "leader_mg_nm" | "median_mg_nm" | "mean_run_nm" | "wind_kt";
/** [x, y] points from day 0 (the gun, 0 nm) to maxDay. A value is carried as a running maximum for the leader (a finisher's day
 *  counts as the course); the middle line stops before the first day on which fewer than minRacing boats are in the set
 *  (racing + finished). Rule 13: the whole-race lines — leader's and middle's alike — stop at, and include, the first race day
 *  on which any boat has finished (a finished fleet is not the fleet the "middle" or "leader" figures were built to describe).
 *  A day without the value is skipped, never bridged with a guess. */
export function series(days: EditionDay[], year: string, field: SeriesField, maxDay: number, minRacing = 3): [number, number][] {
  const out: [number, number][] = field === "mean_run_nm" || field === "wind_kt" ? [] : [[0, 0]];
  const wholeRace = field === "leader_mg_nm" || field === "median_mg_nm";
  let top = 0;
  for (const d of days.filter(d => d.race_key === year && d.race_day <= maxDay).sort((a, b) => a.race_day - b.race_day)) {
    if (field !== "leader_mg_nm" && d.racing + d.finished < minRacing) break;
    const v = d[field];
    if (v != null) {
      if (field === "leader_mg_nm") { top = Math.max(top, v); out.push([d.race_day, top]); } else out.push([d.race_day, v]);
    }
    if (wholeRace && d.finished > 0) break;
  }
  return out;
}

export const raceDayLabel = (raceDay: number, asOf: string) => `day ${raceDay} · ${dayMon(asOf)}`;

/** Miles of this year's course still to sail to the point where the earlier race ended (both figures on the 2026 line), said
 *  roughly: a course is not a ruler. */
export function toPass(nowMg: number, endMg: number): string {
  const d = endMg - nowMg;
  if (d <= 0) return "past that point";
  if (d < 500) return `about ${Math.round(d / 10) * 10} nm to that point`;
  return `about ${nm(Math.round(d / 100) * 100)} nm of this year’s course to go to that point`;
}

/** Rows of this year cut to the page's own as-of clock: the worker already leaves out a milestone passed after the report
 *  the page is dated to, but the site cuts again so a stale or re-derived table can never put a later rounding on an earlier
 *  page. A past race is finished and its rows are kept whole. */
export function milestonesAsOf(ms: EditionMilestone[], asOfISO: string): EditionMilestone[] {
  const asOf = new Date(asOfISO).getTime();
  return ms.filter(m => m.race_key !== "ggr2026" || new Date(m.passed_at).getTime() <= asOf);
}

/** The race's best 24-hour run so far (worker's edition_day.best_sofar_*), never the DAY's best run (best_run_nm/best_run_team_id,
 *  which stays for the runs chart). Blank when the worker has not set one yet, never guessed from a partial row. */
export function bestSoFar(day: EditionDay): { nm: number; teamId: number; at: string } | null {
  if (day.best_sofar_nm == null || day.best_sofar_team_id == null || day.best_sofar_at == null) return null;
  return { nm: day.best_sofar_nm, teamId: day.best_sofar_team_id, at: day.best_sofar_at };
}

type TeamWords = { name: string; first_name: string | null; yacht: string | null; model: string | null };
/** The hover box for a point on the chart of the ocean. The position comes straight off the row (b.position_text, the worker's
 *  own stats.position_text) — never reformatted here, so the site carries only one position formatter, the worker's. */
export function pointTip(b: EditionBoatDay, t: TeamWords, of: number): Tip {
  const year = YEAR_LABEL[b.race_key as Year], who = b.race_key === "ggr2026" ? (t.first_name ?? t.name) : t.name;
  const boat = [t.yacht, t.model].filter(Boolean).join(" · ");
  const pos = b.position_text ?? "no position";
  if (!b.fresh) return { title: `${who} · ${year}`, lines: [boat, pos, b.racing ? "missed the 00:00 report: last position shown" : b.finished ? "finished" : "out of the race"] };
  return {
    title: `${who} · ${year}`, lines: [boat, pos, `${ord(b.place!)} of ${of} on day ${b.race_day} · ${nm(b.mg_nm)} nm made good`,
      b.run24_nm == null ? "no 24-hour run: a report is missing inside the window" : `${Math.round(b.run24_nm)} nm in the 24 hours to the report`],
  };
}

/** A day's legs as shares of upwind / reaching / running that always add to exactly 100 (the remainder after rounding the other
 *  two goes to "reaching", the middle band), or all zero when the day has no legs at all. */
export function windShares(d: EditionDay): { upwind: number; reaching: number; running: number } {
  const n = d.legs_upwind + d.legs_reaching + d.legs_running;
  if (!n) return { upwind: 0, reaching: 0, running: 0 };
  const up = Math.round(d.legs_upwind / n * 100), run = Math.round(d.legs_running / n * 100);
  return { upwind: up, reaching: 100 - up - run, running: run };
}

const ahead = (a: number, b: number) => `${nm(Math.abs(a - b))} nm ${a >= b ? "ahead of" : "behind"}`;
/** Both past years are optional: this year's race outruns 2022's last finisher around day 278 and 2018's around day 322, and
 *  from there on there is nothing left on the course to compare against. When neither is given, the lead sentence still says
 *  where the leader stands on the day (no fabricated comparison), and the middle sentence — which exists only to compare —
 *  is the empty string, for the page to test for and leave out, rather than a guess. */
export function takeaways(x: { now: EditionDay; y2022?: EditionDay; y2018?: EditionDay; leaderFirst: string }): { lead: string; middle: string } {
  const d = x.now.race_day, L = x.now.leader_mg_nm ?? 0, M = x.now.median_mg_nm ?? 0;
  const compare = (v: number, k: "leader_mg_nm" | "median_mg_nm") =>
    [x.y2022 ? `${ahead(v, x.y2022[k] ?? 0)} 2022’s` : "", x.y2018 ? `${ahead(v, x.y2018[k] ?? 0)} 2018’s` : ""].filter(Boolean);
  const lp = compare(L, "leader_mg_nm"), mp = compare(M, "median_mg_nm");
  const lead = lp.length === 0
    ? `On day ${d} ${x.leaderFirst} is leading.`
    : `On day ${d} ${x.leaderFirst} is ${lp[0].replace("2022’s", "where 2022’s leader was")}${lp[1] ? `, and ${lp[1]}` : ""}.`;
  const middle = mp.length === 0 ? "" : `The middle of this fleet is ${mp[0]}${mp[1] ? ` and ${mp[1]}` : ""}.`;
  return { lead, middle };
}

// Kept identical to worker/ggrstats/editions_data.py (RETURNING, VETERAN_HULLS, MILESTONES) by a test that reads the Python
// source as text: the site cannot import a Python module, so these three are transcribed by hand and held to it there.
export const RETURNING: { team_2026: number; first: string; races: { race_key: Year; team_id: number }[] }[] = [
  { team_2026: 6, first: "Damien", races: [{ race_key: "ggr2022", team_id: 4 }] },
  { team_2026: 10, first: "Pat", races: [{ race_key: "ggr2022", team_id: 5 }] },
  { team_2026: 17, first: "Ertan", races: [{ race_key: "ggr2022", team_id: 13 }, { race_key: "ggr2018", team_id: 94 }] },
  { team_2026: 5, first: "Guy", races: [{ race_key: "ggr2022", team_id: 14 }] },
];
export const VETERAN_HULLS: { yacht_2026: string; team_2026: number; design: string; races: { race_key: Year; team_id: number; yacht_then: string; note: string }[]; source: string }[] = [
  { yacht_2026: "Miss Beagle", team_2026: 17, design: "Rustler 36", races: [{ race_key: "ggr2018", team_id: 8, yacht_then: "Matmut", note: "won the race" }], source: "https://goldengloberace.com/skippers/ertan-beskardes/" },
  { yacht_2026: "IE Charge", team_2026: 2, design: "Biscay 36 ketch", races: [{ race_key: "ggr2022", team_id: 9, yacht_then: "Nuri", note: "third" }, { race_key: "ggr2018", team_id: 888, yacht_then: "Métier Intérim", note: "retired, bound for Rio de Janeiro" }], source: "https://goldengloberace.com/skippers/louis-kerdelhue/" },
  { yacht_2026: "Silvermines Hydro", team_2026: 10, design: "Saltram Saga 36", races: [{ race_key: "ggr2022", team_id: 5, yacht_then: "Green Rebel", note: "retired at Cape Town" }], source: "https://www.yachtingmonthly.com/boat-events/golden-globe-race/unfinished-business-pat-lawless-says-of-his-return-for-the-2026-golden-globe-race-104046" },
  { yacht_2026: "Solarem", team_2026: 6, design: "Rustler 36", races: [{ race_key: "ggr2022", team_id: 4, yacht_then: "PRB", note: "retired at Cape Town" }], source: "https://figaronautisme.meteoconsult.fr/actus-nautisme-flash/2026-04-09/87470-mise-a-leau-du-bateau-de-damien-guillou-a-5-mois-du-depart-de-la-golden-globe-race" },
  { yacht_2026: "Spirit", team_2026: 5, design: "Tashiba 36", races: [{ race_key: "ggr2022", team_id: 14, yacht_then: "Spirit", note: "aground at Fuerteventura" }], source: "https://www.yachtingmonthly.com/boat-events/golden-globe-race/not-in-it-for-the-spiritual-experience-says-guy-deboer-ahead-of-the-golden-globe-race-im-a-true-competitor-105883" },
  { yacht_2026: "Olleanna", team_2026: 14, design: "OE 32", races: [{ race_key: "ggr2022", team_id: 8, yacht_then: "Olleanna", note: "finished, Chichester class" }, { race_key: "ggr2018", team_id: 7, yacht_then: "Olleanna", note: "dismasted" }], source: "https://goldengloberace.com/skippers/isa-rosli/" },
  { yacht_2026: "Lazy Otter", team_2026: 9, design: "Rustler 36", races: [{ race_key: "ggr2022", team_id: 13, yacht_then: "Lazy Otter", note: "retired at Cape Town" }, { race_key: "ggr2018", team_id: 94, yacht_then: "Lazy Otter", note: "retired at A Coruña" }], source: "https://goldengloberace.com/skippers/ertan-beskardes/" },
];
export const MILESTONE_ORDER = ["Lanzarote", "Equator", "Cape of Good Hope", "Hobart", "Cape Horn", "Finish"] as const;
