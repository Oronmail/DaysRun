// site/lib/editions.ts — the Past races page's words and shapes, pure. Years read newest first everywhere; a sailor of a past race
// is named in full, this year's skippers by first name; no sentence carries a number that was not computed here.
import type { EditionDay, EditionBoatDay, EditionMilestone } from "./db";
import type { Tip } from "./tips";
import { dayMon, hhmm, nm } from "./format";

export const YEARS = ["ggr2026", "ggr2022", "ggr2018"] as const;
export type Year = typeof YEARS[number];
export const YEAR_LABEL: Record<Year, string> = { ggr2026: "2026", ggr2022: "2022", ggr2018: "2018" };
export const YEAR_COLOR: Record<Year, string> = { ggr2026: "var(--year-2026)", ggr2022: "var(--year-2022)", ggr2018: "var(--year-2018)" };
export const YEAR_TEXT: Record<Year, string> = { ggr2026: "var(--gold-text)", ggr2022: "var(--year-2022)", ggr2018: "var(--year-2018)" };
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;

/** The day the page is about: this year's newest race day that HAS figures. The worker writes a row for a race day as soon as
 *  the day's 00:00 report is due, so the newest row can be one no boat has reported into yet (leader blank, fresh nought);
 *  the page steps back to the last measured day rather than print a page of dashes, and its dateline says which report that is. */
/** The length of each race's own course, nm, from YB's own RaceSetup (course_km ÷ 1.852): 2026 25,754.5, 2022 26,003.0,
 *  2018 25,099.9 — a spread of 903 nm. Since 19 Sep 2026 every fleet keeps YB's own distance to finish and is measured against
 *  ITS OWN course, so these three are what miles made good are counted off, and the share of the course says the same thing
 *  without a reader holding three lengths in mind. The worker reads them from the race row; the site cannot, and a test pins them. */
export const COURSE_NM: Record<Year, number> = { ggr2026: 25754.5, ggr2022: 26003.0, ggr2018: 25099.9 };
export const shareOfCourse = (mg: number | null | undefined, y: Year) => mg == null ? "—" : `${(mg / COURSE_NM[y] * 100).toFixed(1)}%`;

/** Each race's own gun, UTC, from YB's own RaceSetup (the worker reads it with config.race_start; the site cannot, and a test
 *  pins it). The three differ by four hours, which is why the same race day is not the same length of day in every fleet. */
export const START_AT: Record<Year, string> = { ggr2026: "2026-09-06T12:30:00+00:00", ggr2022: "2022-09-04T14:00:00+00:00", ggr2018: "2018-07-01T10:00:00+00:00" };
export function startWords(): string {
  const mins = (y: Year) => { const d = new Date(START_AT[y]); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const h = (Math.max(...YEARS.map(mins)) - Math.min(...YEARS.map(mins))) / 60;
  return `The starts were at ${hhmm(START_AT.ggr2018)} UTC in 2018, ${hhmm(START_AT.ggr2022)} in 2022 and ${hhmm(START_AT.ggr2026)} this year, so the same race day is up to ${Number.isInteger(h) ? `${NUM[h] ?? h} hours` : `${h} hours`} longer or shorter.`;
}

type Legs = { legs_upwind: number; legs_reaching: number; legs_running: number };
export type FleetWind = { kt: number | null; legs: number; run: number | null; upwind: number; reaching: number; running: number };
/** A fleet's weather from the gun to a race day, as one row: the model wind weighted by the legs each day carried (a day with
 *  four legs must not weigh as much as a day with ninety), the fleet's mean 24-hour run weighted by the boats each day measured,
 *  and the three shares of where the wind came from. Blank, never nought, for a fleet with no leg and no run yet. */
export function fleetWind(days: EditionDay[], year: string, maxDay: number): FleetWind {
  const rows = days.filter(d => d.race_key === year && d.race_day <= maxDay);
  const legs = rows.reduce((n, d) => n + d.wind_legs, 0), runs = rows.reduce((n, d) => n + d.runs_n, 0);
  const kt = legs ? rows.reduce((n, d) => n + (d.wind_kt ?? 0) * d.wind_legs, 0) / legs : null;
  const run = runs ? rows.reduce((n, d) => n + (d.mean_run_nm ?? 0) * d.runs_n, 0) / runs : null;
  const sum = (k: keyof Legs) => rows.reduce((n, d) => n + d[k], 0);
  return { kt, legs, run, ...windShares({ legs_upwind: sum("legs_upwind"), legs_reaching: sum("legs_reaching"), legs_running: sum("legs_running") }) };
}

const NUM = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
/** A share of legs said the way the site's prose says it. Twelve days of weather are shared by a whole fleet and a point either
 *  way is noise, so the sentence gives the size of the share, not a false precision. */
export function fraction(pct: number): string {
  if (pct <= 0) return "none";
  if (pct >= 70) return "most";
  if (pct >= 55) return "more than half";
  if (pct >= 45) return "about half";
  if (pct >= 30) return "a third";
  if (pct >= 22) return "a quarter";
  if (pct >= 18) return "a fifth";
  const n = Math.round(100 / pct);
  return `one in ${NUM[n] ?? n}`;
}

/** How hard the wind blew for each fleet, and — what matters more — where it came from. Two means within 1.5 kt are "about the
 *  same": a knot between two years of model wind over a whole fleet says nothing. The second sentence compares the legs on the
 *  nose, or, where no fleet has had one at all, the legs from behind. */
export function windWords(x: { raceDay: number; now: FleetWind; y2022?: FleetWind | null; y2018?: FleetWind | null }): string {
  const K = x.now.kt;
  if (K == null) return "";
  const past = ([["2022", x.y2022], ["2018", x.y2018]] as [string, FleetWind | null | undefined][]).filter((p): p is [string, FleetWind] => p[1]?.kt != null);
  const rel = (w: FleetWind) => Math.abs(w.kt! - K) <= 1.5 ? "about the same" : w.kt! > K ? "more" : "less";
  const clauses = past.map(([label, w]) => `${label} ${rel(w)} (about ${Math.round(w.kt!)} kt)`);
  const strength = `Through day ${x.raceDay} the model wind at the boats has averaged about ${Math.round(K)} kt this year${clauses.length ? `, ${clauses.slice(0, -1).concat(clauses.slice(-1)).join(" and ")}` : ""}.`;
  if (!past.length) return strength;
  const nose = past.some(([, w]) => w.upwind > 0) || x.now.upwind > 0;
  const band = (w: FleetWind) => nose ? w.upwind : w.running;
  const verb = nose ? "were upwind" : "came from behind";
  const [label, w] = [...past].sort((a, b) => Math.abs(band(b[1]) - band(x.now)) - Math.abs(band(a[1]) - band(x.now)))[0];
  const where = Math.abs(band(w) - band(x.now)) >= 3
    ? `What differed is where it came from: ${fraction(band(w))} of ${label}’s legs ${verb}, against ${fraction(band(x.now))} of this year’s.`
    : `Where it came from was much the same: ${fraction(band(w))} of ${label}’s legs ${verb}, and ${fraction(band(x.now))} of this year’s.`;
  return `${strength} ${where}`;
}

/** A latitude in degrees and decimal minutes, the way the worker writes a position (stats.position_text); the site has no other
 *  formatter for one, and a fleet's middle latitude is read beside the boats' own positions. */
export function latDM(lat: number): string {
  const d = Math.floor(Math.abs(lat)), m = (Math.abs(lat) - d) * 60;
  return `${String(d).padStart(2, "0")}°${m.toFixed(1).padStart(4, "0")}′${lat < 0 ? "S" : "N"}`;
}
export type RoadRow = { boats: number; midLat: number | null; spanNm: number | null };
/** Where a fleet lay on one race day, of the boats that reported: how many, the middle boat's latitude, and how far the fleet
 *  is stretched from its northernmost boat to its southernmost, in nautical miles of latitude. */
export function roadRow(rows: EditionBoatDay[]): RoadRow {
  const lats = rows.filter(r => r.fresh && r.lat != null).map(r => r.lat!).sort((a, b) => a - b);
  if (!lats.length) return { boats: 0, midLat: null, spanNm: null };
  const mid = lats.length % 2 ? lats[(lats.length - 1) / 2] : (lats[lats.length / 2 - 1] + lats[lats.length / 2]) / 2;
  return { boats: lats.length, midLat: mid, spanNm: Math.round((lats[lats.length - 1] - lats[0]) * 60) };
}
const LANDFALL: [string, number][] = [["Lanzarote", 28.96], ["Madeira", 32.75], ["Lisbon", 38.7]];
/** Each fleet's middle boat named against the nearest landfall of the passage south — a latitude means little on its own — and
 *  which fleet was the longest from north to south. */
export function roadWords(raceDay: number, r2026: RoadRow, r2022?: RoadRow | null, r2018?: RoadRow | null): string {
  const near = (lat: number) => {
    const [name, at] = [...LANDFALL].sort((a, b) => Math.abs(lat - a[1]) - Math.abs(lat - b[1]))[0];
    return `${Math.abs(lat - at).toFixed(1)}° ${lat >= at ? "north" : "south"} of ${name}`;
  };
  if (r2026.midLat == null) return "";
  const rest = ([["2022’s", r2022], ["2018’s", r2018]] as [string, RoadRow | null | undefined][]).filter(p => p[1]?.midLat != null).map(([label, r]) => `${label} ${near(r!.midLat!)}`);
  const where = `On day ${raceDay} the middle of this year’s fleet is ${near(r2026.midLat)}${rest.length ? `, ${rest.join(" and ")}` : ""}.`;
  const spans = ([["This year’s fleet", r2026], ["The 2022 fleet", r2022], ["The 2018 fleet", r2018]] as [string, RoadRow | null | undefined][]).filter(p => p[1]?.spanNm != null);
  const [label, longest] = [...spans].sort((a, b) => b[1]!.spanNm! - a[1]!.spanNm!)[0];
  return `${where} ${label} is the longest from north to south: ${nm(longest!.spanNm)} nm from the northernmost boat to the southernmost.`;
}

/** One boat's miles made good by race day, from the gun, to maxDay: a day the record has no distance for is skipped, never
 *  bridged with a guess (YB left Mark Slats without one for the last month of 2018). */
export function boatSeries(rows: EditionBoatDay[], maxDay: number): [number, number][] {
  return [[0, 0], ...rows.filter(r => r.race_day <= maxDay && r.mg_nm != null).sort((a, b) => a.race_day - b.race_day).map(r => [r.race_day, r.mg_nm!] as [number, number])];
}

/** A returning skipper's card: this year's miles made good against the same race day of that skipper's earlier race, where and
 *  how that race ended, and how much further there is to sail to have made good what it made good. The two figures are made good
 *  on courses up to 903 nm apart, so the difference is a rough distance still to go and names no point of anyone's line. */
export function attemptCard(now: EditionBoatDay[], past: EditionBoatDay[], team: { ended_how: string | null; ended_where: string | null }, raceDay: number):
  { diff: number | null; endDay: number | null; endMg: number | null; endText: string; pass: string } {
  const nowMg = now.find(r => r.race_day === raceDay)?.mg_nm ?? null, thenMg = past.find(r => r.race_day === raceDay)?.mg_nm ?? null;
  const inRace = past.filter(r => r.racing || r.finished).map(r => r.race_day);
  const endDay = inRace.length ? Math.max(...inRace) : null;
  const mgs = past.filter(r => r.mg_nm != null && (endDay == null || r.race_day <= endDay)).map(r => r.mg_nm!);
  const endMg = mgs.length ? Math.max(...mgs) : null;                        // the furthest that race ever got, not its last day's figure: a boat sailing into port loses miles made good
  return {
    diff: nowMg == null || thenMg == null ? null : Math.round(nowMg - thenMg), endDay, endMg,
    endText: `${team.ended_how ?? "ended"}${team.ended_where ? ` at ${team.ended_where}` : ""}${endDay != null ? `, day ${endDay}` : ""}`,
    pass: nowMg == null || endMg == null ? "" : toPass(nowMg, endMg),
  };
}

/** One milestone of one race: the first boat through, the passing of the middle of the fleet (the boat with as many boats ahead
 *  as behind, of the STARTERS — so it is blank until half the fleet is through), and how many boats are past. Empty where the
 *  race's own record holds no timing at all: YB's 2018 record has no Lanzarote row, although the race had the gate. */
export function milestoneCells(ms: EditionMilestone[], year: Year, name: string, starters: number):
  { first: EditionMilestone | null; middle: EditionMilestone | null; passed: number } {
  const rows = ms.filter(m => m.race_key === year && m.milestone === name).sort((a, b) => a.passed_at < b.passed_at ? -1 : 1);
  return { first: rows[0] ?? null, middle: rows[Math.floor(starters / 2)] ?? null, passed: rows.length };
}

/** A line smoothed over seven points, drawn from the seventh: over a whole race a day's mean run is spiky enough to hide the
 *  shape. Points, not days — a day the fleet had no run at all is not in the series to begin with. */
export function sevenDayMean(pts: [number, number][]): [number, number][] {
  return pts.flatMap((p, i) => i < 6 ? [] : [[p[0], pts.slice(i - 6, i + 1).reduce((n, q) => n + q[1], 0) / 7] as [number, number]]);
}

export const latestDay = (days: EditionDay[]) => {
  const mine = days.filter(d => d.race_key === "ggr2026").sort((a, b) => b.race_day - a.race_day);
  return mine.find(d => d.leader_mg_nm != null) ?? mine[0];
};
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

/** How much further this year's skipper has to sail to have made good what that skipper's earlier race made good before it ended,
 *  said roughly: a course is not a ruler. Since 19 Sep 2026 every fleet is measured on ITS OWN course, so the two figures are
 *  miles made good on courses 903 nm apart and the difference names no course at all — it is a rough distance still to go, not a
 *  point of anyone's line. */
export function toPass(nowMg: number, endMg: number): string {
  const d = endMg - nowMg;
  if (d <= 0) return "past that point";
  if (d < 500) return `about ${Math.round(d / 10) * 10} nm to go to where that race ended`;
  return `about ${nm(Math.round(d / 100) * 100)} nm to go to where that race ended`;
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
  const run = b.run24_nm == null ? "no 24-hour run: a report is missing inside the window" : `${Math.round(b.run24_nm)} nm in the 24 hours to the report`;
  // YB's record can carry a fix with no distance to finish at all (Mark Slats, the last month of 2018: 29 reports). The boat is
  // there, and her 24-hour runs are real; her place and her miles made good are not ours to invent, so the box says why.
  if (b.mg_nm == null || b.place == null) return { title: `${who} · ${year}`, lines: [boat, pos, `day ${b.race_day} · no distance to finish in YB’s record`, run] };
  return {
    title: `${who} · ${year}`, lines: [boat, pos, `${ord(b.place)} of ${of} on day ${b.race_day} · ${nm(b.mg_nm)} nm made good`, run],
  };
}

/** A day's legs as shares of upwind / reaching / running that always add to exactly 100 (the remainder after rounding the other
 *  two goes to "reaching", the middle band), or all zero when the day has no legs at all. */
export function windShares(d: Legs): { upwind: number; reaching: number; running: number } {
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
  // A past day whose leader or middle is blank (a fleet YB gave no distance for that day) drops its clause: a blank is not nought.
  const compare = (v: number, k: "leader_mg_nm" | "median_mg_nm") =>
    [x.y2022?.[k] != null ? `${ahead(v, x.y2022[k]!)} 2022’s` : "", x.y2018?.[k] != null ? `${ahead(v, x.y2018[k]!)} 2018’s` : ""].filter(Boolean);
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
