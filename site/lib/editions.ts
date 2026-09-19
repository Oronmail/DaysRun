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

/** The worker's own rules, named here so that a sentence on the page is BUILT from them and never typed into the JSX, where a
 *  figure drifts in silence (design rule 14). Each is held to the worker's Python source by a test, in the pattern of the
 *  RETURNING / VETERAN_HULLS drift guard: grid.SLOT_S, grid.SLOT_TOL_S, editions.fill_slots' max_gap_s, perf.STOPPED_KN, and
 *  the day divided by the grid for the legs of a 24-hour run. minRuns is the site's own floor (a mean of one boat is not a
 *  fleet's) and entered2018 is the race's own entry list: 18 entered, 17 crossed the line.  */
export const RULE = { legHours: 4, slotTolMin: 20, fillMaxGapMin: 200, stoppedKn: 0.2, legsPerRun: 6, minRuns: 3, entered2018: 18 } as const;
// The 2018 archive's own rhythm, the reason its race day 9 has almost no run (worker/ggrstats/editions.py, fill_slots).
const RHYTHM_2018 = { from: "the fourth", to: "the ninth of July 2018", everyHours: 3, silenceHours: 6 };
const hoursMin = (min: number) => `${NUM[Math.floor(min / 60)] ?? Math.floor(min / 60)} hours and ${NUM[min % 60] ?? min % 60} minutes`;

/** The race day of a date, GGR's own numbering: the UTC calendar date less the race's own start date. */
export function raceDayOf(iso: string | null | undefined, year: Year): number | null {
  if (!iso) return null;
  const DAY = 86400000;
  return Math.floor(new Date(iso).getTime() / DAY) - Math.floor(new Date(START_AT[year]).getTime() / DAY);
}

/** What the dateline cannot say. The dateline counts the reader's own clock day (a reader takes a dateline for the present), and
 *  every figure on this page is of the last measured race day — which is yesterday's whenever this year's newest row has not been
 *  reported into yet. So the page's own sub-line names that day and the report it comes from. (It goes there rather than in the
 *  dateline's tail because the tail makes the head row too wide for the note beside it at 1,440 px.) */
export const figuresLine = (raceDay: number, asOf: string) => `figures of race day ${raceDay}, the ${hhmm(asOf)} UTC report of ${dayMon(asOf)}`;

/** The span of race days a panel's figures are of, for the headings that carry it. */
export const spanWords = (raceDay: number) => raceDay <= 1 ? `day ${raceDay}` : `days 1 to ${raceDay}`;

/** The x axis of a whole-race chart: the last day any line reaches, rounded up to the next step. The lines stop where their own
 *  data stops (rule 13 stops them at the first boat home), so a fixed axis would leave bare space a reader reads as missing days. */
export function axisMax(lines: [number, number][][], step = 30): number {
  const last = Math.max(0, ...lines.flatMap(pts => (pts.length ? [pts[pts.length - 1][0]] : [])));
  return Math.max(step, Math.ceil(last / step) * step);
}

/** The day a fleet had 24-hour runs for fewer boats than the floor, although it was racing (2018's race day 9: one run of the
 *  sixteen boats still in the race, the fleet's reporting rhythm changing under it). A day with NO run at all is the start day
 *  or a day the whole fleet was silent, not this, and is left out. */
export function thinnestRunDay(days: EditionDay[], year: string, maxDay: number): { raceDay: number; runs: number; racing: number } | null {
  const thin = days.filter(d => d.race_key === year && d.race_day <= maxDay && d.runs_n > 0 && d.runs_n < RULE.minRuns).sort((a, b) => a.runs_n - b.runs_n)[0];
  return thin ? { raceDay: thin.race_day, runs: thin.runs_n, racing: thin.racing } : null;
}

/** How the page's figures are made, in words: every figure in them comes from RULE, never from the JSX. */
export function methodWords(): string[] {
  return [
    "Every fleet keeps YB Tracking’s own distance to finish, and miles made good are that race’s own course length less that distance — each fleet on the course it sailed, compared race day for race day. Nothing is laid on another year’s line. Early in a race the three fleets sail the same water, so their miles can be set side by side; once the courses part, after the equator, the share of each race’s own course is the fairer reading.",
    "A race day is the same day of each race, counted from that race’s own gun. A boat counts as racing until the day its race ended, as the race itself recorded it: where a tracker went on transmitting from a harbour or an abandoned hull, the recorded end wins over the track.",
    `A day’s figures come from the 00:00 UTC report, using each boat’s fix within ${NUM[RULE.slotTolMin] ?? RULE.slotTolMin} minutes of it. A 24-hour run is the miles sailed over the ${NUM[RULE.legsPerRun]} ${RULE.legHours}-hour legs to that report. The wind is model wind at the end of each leg, and the point of sail is the course the boat made good over those ${NUM[RULE.legHours]} hours, never its heading.`,
  ];
}

/** The note under the two charts of 24-hour runs. */
export const runsNote = () =>
  `A day counts only the boats that were moving and had all ${NUM[RULE.legsPerRun]} legs, and a fleet mean of fewer than ${NUM[RULE.minRuns]} runs is not drawn at all. What changes from race to race is how many of the days are bad ones.`;

/** "Read with care", built from the constants and the day's own rows: the three courses and their routes, the Lanzarote gate and
 *  the three guns, the 2018 entry list and the day its reporting rhythm changed, Mark Slats's missing distances, the middle of
 *  the fleet and the boat that is not moving, and the model wind. Nothing here is typed as a figure in the page. */
export function cautionWords(x: { raceDay: number; starters2018: number; thin: { raceDay: number; runs: number; racing: number } | null }): string[] {
  const t = x.thin;
  const rhythm = t == null ? "" : ` Only ${NUM[t.runs] ?? t.runs} boat${t.runs === 1 ? "" : "s"} of the ${NUM[t.racing] ?? t.racing} still racing has a 24-hour run on 2018’s race day ${NUM[t.raceDay] ?? t.raceDay}, when the fleet’s reporting rhythm changed through a ${NUM[RHYTHM_2018.silenceHours]}-hour silence: from ${RHYTHM_2018.from} to ${RHYTHM_2018.to} the fleet reported every ${NUM[RHYTHM_2018.everyHours]} hours. In a past race a missing ${NUM[RULE.legHours]}-hour slot is filled only where a tracker was reporting more often than the ${RULE.legHours}-hour grid, between two reports at most ${hoursMin(RULE.fillMaxGapMin)} apart — never this year.`;
  return [
    `The three fleets sailed three courses: ${nm(COURSE_NM.ggr2026)} nm this year, ${nm(COURSE_NM.ggr2022)} in 2022 and ${nm(COURSE_NM.ggr2018)} in 2018. 2018 did not round Trindade, and only 2022 had gates at Cape Town and Punta del Este. Trindade takes the fleet round the South Atlantic high and sets the angle for the Cape of Good Hope; it is a routing mark, not a different race. So the day is the comparison, and the miles are each race’s own.`,
    `All three races had a gate at Lanzarote, but YB’s record of 2018 holds no timing there, so 2018’s Lanzarote milestone is blank rather than guessed. ${startWords()}`,
    `2018 has ${x.starters2018} starters here, not the ${NUM[RULE.entered2018] ?? RULE.entered2018} boats that entered: Francesco Cappelletti never crossed the start line.${rhythm}`,
    "YB’s record carries no distance to finish for the last month of Mark Slats’s 2018 race, so the miles made good and the place are blank on those days, although the positions and the 24-hour runs are real; the 2018 leader and middle of the fleet are then of the boats that have a distance.",
    `The middle of the fleet is of the boats still racing that day, so it climbs as boats retire: late in a race it describes the survivors. A boat that is not moving — a ${RULE.legHours}-hour leg slower than ${RULE.stoppedKn} kt — is left out of the fleet’s mean and best run for as long as it lies there.`,
    `The wind is model wind, never measured on board: Open-Meteo’s archive of the ECMWF model for 2018 and 2022, and the model wind this site stores for this year. ${x.raceDay} days of weather are shared by a whole fleet, so read a knot between years as nothing.`,
  ];
}

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
  const strength = `Through day ${x.raceDay} the model wind at the boats has averaged about ${Math.round(K)} kt this year${clauses.length ? `, ${clauses.join(" and ")}` : ""}.`;
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

/** How far the three courses run over the same water: from Les Sables-d'Olonne to about the equator all three fleets sail the
 *  same ocean, so a mile made good in one is a mile made good in another. After it this year's course rounds Trindade and 2022's
 *  went by Cape Town, and miles made good on two courses are no longer of the same water. A card says how far there is still to
 *  sail only while the earlier race ended inside it. */
export const SHARED_WATER_NM = 3000;

/** A returning skipper's card: this year's miles made good against the same race day of that skipper's earlier race, where and
 *  how that race ended, and how much further there is to sail to have made good what it made good. The two figures are made good
 *  on courses up to 903 nm apart, so the difference is a rough distance still to go and names no point of anyone's line. */
export function attemptCard(now: EditionBoatDay[], past: EditionBoatDay[], team: { ended_how: string | null; ended_where: string | null; ended_at?: string | null }, raceDay: number, year: Year):
  { diff: number | null; endDay: number | null; endMg: number | null; endText: string; pass: string } {
  const nowMg = now.find(r => r.race_day === raceDay)?.mg_nm ?? null, thenMg = past.find(r => r.race_day === raceDay)?.mg_nm ?? null;
  const inRace = past.filter(r => r.racing || r.finished).map(r => r.race_day);
  // The curated end (team.ended_at, the race's own record) decides the day, not the last row the tracker sent: a tracker can go
  // on transmitting from a quay for weeks. The last row is only the fallback for a boat with no recorded end at all.
  const endDay = raceDayOf(team.ended_at ?? null, year) ?? (inRace.length ? Math.max(...inRace) : null);
  const mgs = past.filter(r => r.mg_nm != null && (endDay == null || r.race_day <= endDay)).map(r => r.mg_nm!);
  const endMg = mgs.length ? Math.max(...mgs) : null;                        // the furthest that race ever got, not its last day's figure: a boat sailing into port loses miles made good
  return {
    diff: nowMg == null || thenMg == null ? null : Math.round(nowMg) - Math.round(thenMg), endDay, endMg,
    endText: `${team.ended_how ?? "ended"}${team.ended_where ? ` at ${team.ended_where}` : ""}${endDay != null ? `, day ${endDay}` : ""}`,
    pass: nowMg == null || endMg == null || endMg > SHARED_WATER_NM ? "" : toPass(nowMg, endMg),
  };
}

/** One milestone of one race: the first boat through, the boat whose passing makes HALF THE STARTERS past (the ceil(starters / 2)th
 *  to pass — the 8th of sixteen, the 9th of seventeen, so that two fleets of different size are measured alike), and how many
 *  boats are past. Empty where the race's own record holds no timing at all: YB's 2018 record has no Lanzarote row, although the
 *  race had the gate. "Middle of the fleet" is NOT this: on the tiles and the charts that is the median of the boats still
 *  racing that day, and the two must not share a name. */
export function milestoneCells(ms: EditionMilestone[], year: Year, name: string, starters: number):
  { first: EditionMilestone | null; middle: EditionMilestone | null; middleText: string; passed: number } {
  const rows = ms.filter(m => m.race_key === year && m.milestone === name).sort((a, b) => a.passed_at < b.passed_at ? -1 : 1);
  const middle = rows[Math.ceil(starters / 2) - 1] ?? null;
  return { first: rows[0] ?? null, middle, middleText: middle ? "" : "fewer than half", passed: rows.length };
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
/** A race day the worker wrote a row for before any boat had reported into it (it writes the row when the report is due, not
 *  when it is read): nothing of that day may be drawn, whatever the field — the wind is the field that has a part-day value. */
const unmeasured = (d: EditionDay) => d.fresh === 0 && d.leader_mg_nm == null;
/** [x, y] points from day 0 (the gun, 0 nm) to maxDay. A value is carried as a running maximum for the leader (a finisher's day
 *  counts as the course); the middle line stops before the first day on which fewer than minRacing boats are in the set
 *  (racing + finished). Rule 13: the whole-race lines — leader's and middle's alike — stop at, and include, the first race day
 *  on which any boat has finished (a finished fleet is not the fleet the "middle" or "leader" figures were built to describe).
 *  A day without the value is skipped, never bridged with a guess. `lastDay` is the day the page's figures are of: this year's
 *  line must never reach a day the tiles do not show (the wind of a part-day would otherwise end the line beyond them), while a
 *  past race, whose whole record is in, is drawn to maxDay. A fleet mean of fewer than RULE.minRuns runs is not drawn at all:
 *  2018's race day 9 has exactly one, and one boat is not a fleet. */
export function series(days: EditionDay[], year: string, field: SeriesField, maxDay: number, minRacing = 3, lastDay = Infinity): [number, number][] {
  const out: [number, number][] = field === "mean_run_nm" || field === "wind_kt" ? [] : [[0, 0]];
  const wholeRace = field === "leader_mg_nm" || field === "median_mg_nm";
  let top = 0;
  for (const d of days.filter(d => d.race_key === year && d.race_day <= Math.min(maxDay, lastDay)).sort((a, b) => a.race_day - b.race_day)) {
    if (field !== "leader_mg_nm" && d.racing + d.finished < minRacing) break;
    if (unmeasured(d)) continue;
    if (field === "mean_run_nm" && d.runs_n < RULE.minRuns) continue;
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
  if (d <= 0) return "Past that point";
  if (d < 500) return `About ${Math.round(d / 10) * 10} nm to go to where that race ended`;
  return `About ${nm(Math.round(d / 100) * 100)} nm to go to where that race ended`;
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

/** A day's legs as shares of upwind / reaching / running that always add to exactly 100, by the largest-remainder method: each
 *  share is rounded DOWN and the spare points go to the largest fractions. Giving the remainder to the middle band instead (the
 *  first rule here) could round a share the wrong way — 14.72 / 17.69 / 67.59 printed 15 / 17 / 68, and 17.69 is not 17.
 *  All zero when the day has no legs at all. */
export function windShares(d: Legs): { upwind: number; reaching: number; running: number } {
  const n = d.legs_upwind + d.legs_reaching + d.legs_running;
  if (!n) return { upwind: 0, reaching: 0, running: 0 };
  const exact = [d.legs_upwind, d.legs_reaching, d.legs_running].map(v => v / n * 100);
  const out = exact.map(Math.floor);
  const spare = 100 - out.reduce((a, b) => a + b, 0);
  [...exact.keys()].sort((a, b) => (exact[b] - out[b]) - (exact[a] - out[a])).slice(0, spare).forEach(i => out[i]++);
  return { upwind: out[0], reaching: out[1], running: out[2] };
}

// The page prints both figures rounded, so the difference is of the ROUNDED figures: a reader who subtracts the two tiles
// must get the number in the sentence (1,212 − 987 = 225, not the 226 the raw values give).
const ahead = (a: number, b: number) => { const d = Math.round(a) - Math.round(b); return `${nm(Math.abs(d))} nm ${d >= 0 ? "ahead of" : "behind"}`; };
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
