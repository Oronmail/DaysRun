// site/__tests__/editions.test.ts — the words and shapes for the Past races page: every sentence with a number lives here,
// tested, so the page file itself never carries one untested.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { YEARS, YEAR_LABEL, latestDay, sameDay, series, toPass, pointTip, windShares, takeaways, raceDayLabel, milestonesAsOf, bestSoFar, RETURNING, VETERAN_HULLS, MILESTONE_ORDER } from "../lib/editions";
import type { EditionDay, EditionBoatDay, EditionMilestone } from "../lib/db";

const day = (race_key: string, race_day: number, o: Partial<EditionDay> = {}): EditionDay => ({
  race_key, race_day, as_of: "2026-09-18T00:00:00+00:00", racing: 16, finished: 0, fresh: 16,
  leader_team_id: 6, leader_mg_nm: 1519, median_mg_nm: 1212, last_mg_nm: 761,
  best_run_nm: 178, best_run_team_id: 12, best_sofar_nm: 180, best_sofar_team_id: 12, best_sofar_at: "2026-09-17T00:00:00+00:00",
  mean_run_nm: 140, runs_n: 15,
  wind_kt: 12.7, wind_legs: 90, legs_upwind: 13, legs_reaching: 13, legs_running: 64, straight_pct: 108, ...o,
});

describe("years", () => {
  it("read newest first with their colours", () => {
    expect(YEARS).toEqual(["ggr2026", "ggr2022", "ggr2018"]);
    expect(YEAR_LABEL.ggr2018).toBe("2018");
  });
});

describe("the day the page is about", () => {
  it("is the latest 00:00 report of this year, and the same race day of the others", () => {
    const days = [day("ggr2026", 11), day("ggr2026", 12), day("ggr2022", 12, { median_mg_nm: 981 }), day("ggr2022", 13), day("ggr2018", 12, { median_mg_nm: 1218 })];
    expect(latestDay(days).race_day).toBe(12);
    expect(sameDay(days, 12).map(d => d.race_key)).toEqual(["ggr2026", "ggr2022", "ggr2018"]);
  });
});

describe("series", () => {
  it("draws a series only to the days a race has, and the middle's line stops where fewer than three boats race", () => {
    const days = [day("ggr2018", 1, { median_mg_nm: 60 }), day("ggr2018", 2, { median_mg_nm: 120 }), day("ggr2018", 3, { median_mg_nm: 200, racing: 2 })];
    expect(series(days, "ggr2018", "median_mg_nm", 30, 3)).toEqual([[0, 0], [1, 60], [2, 120]]);
    expect(series(days, "ggr2018", "leader_mg_nm", 2)).toEqual([[0, 0], [1, 1519], [2, 1519]]);
  });
  it("stops the whole-race line — leader's and middle's alike — at the first finish, inclusive (rule 13)", () => {
    const days = [day("ggr2018", 100, { median_mg_nm: 900 }), day("ggr2018", 101, { median_mg_nm: 950, finished: 1 }), day("ggr2018", 102, { median_mg_nm: 1000 })];
    expect(series(days, "ggr2018", "median_mg_nm", 200)).toEqual([[0, 0], [100, 900], [101, 950]]);
    expect(series(days, "ggr2018", "leader_mg_nm", 200)).toEqual([[0, 0], [100, 1519], [101, 1519]]);
  });
  it("skips a day whose value is missing rather than bridging it with a guess", () => {
    const days = [day("ggr2018", 1, { median_mg_nm: 60 }), day("ggr2018", 2, { median_mg_nm: null }), day("ggr2018", 3, { median_mg_nm: 180 })];
    expect(series(days, "ggr2018", "median_mg_nm", 3)).toEqual([[0, 0], [1, 60], [3, 180]]);
  });
  it("does NOT stop the day-run or the wind line at a finish — only the whole-race lines (leader's, middle's) do", () => {
    const days = [day("ggr2018", 100, { mean_run_nm: 130, wind_kt: 10 }), day("ggr2018", 101, { mean_run_nm: 140, wind_kt: 11, finished: 1 }), day("ggr2018", 102, { mean_run_nm: 150, wind_kt: 12 })];
    expect(series(days, "ggr2018", "mean_run_nm", 200).map(p => p[0])).toEqual([100, 101, 102]);
    expect(series(days, "ggr2018", "wind_kt", 200).map(p => p[0])).toEqual([100, 101, 102]);
  });
});

describe("milestonesAsOf", () => {
  it("cuts this year's milestones to the page's own clock, but keeps a past race's whole", () => {
    const ms: EditionMilestone[] = [
      { race_key: "ggr2026", team_id: 1, milestone: "Lanzarote", passed_at: "2026-09-10T00:00:00+00:00", race_day: 4 },
      { race_key: "ggr2026", team_id: 1, milestone: "Equator", passed_at: "2026-09-20T00:00:00+00:00", race_day: 14 },
      { race_key: "ggr2018", team_id: 8, milestone: "Finish", passed_at: "2019-01-29T09:12:00+00:00", race_day: 212 },
    ];
    expect(milestonesAsOf(ms, "2026-09-18T00:00:00+00:00").map(m => m.milestone)).toEqual(["Lanzarote", "Finish"]);
  });
});

describe("bestSoFar", () => {
  it("reads the fleet's best-so-far run from the worker's own columns, never the day's best run", () => {
    expect(bestSoFar(day("ggr2026", 12))).toEqual({ nm: 180, teamId: 12, at: "2026-09-17T00:00:00+00:00" });
  });
  it("is blank, never guessed, before the race has a best-so-far", () => {
    expect(bestSoFar(day("ggr2026", 1, { best_sofar_nm: null, best_sofar_team_id: null, best_sofar_at: null }))).toBeNull();
  });
});

describe("words", () => {
  it("says how far a returning skipper is from where the earlier race ended, or that the point is passed", () => {
    // Each figure is miles made good on its OWN race's course, so the difference names no course at all.
    expect(toPass(1519, 7008)).toBe("about 5,500 nm to go to where that race ended");
    expect(toPass(1203, 1299)).toBe("about 100 nm to go to where that race ended");
    expect(toPass(1400, 1299)).toBe("past that point");
  });
  it("labels a race day with its date", () => {
    expect(raceDayLabel(12, "2026-09-18T00:00:00+00:00")).toBe("day 12 · 18 Sep");
  });
  it("builds a hover box with the full name of a past sailor and this year's first name, the position as the worker sent it", () => {
    const b: EditionBoatDay = { race_key: "ggr2018", team_id: 85, race_day: 12, as_of: "2018-07-13T00:00:00+00:00", racing: true, finished: false, fresh: true, fix_at: "2018-07-13T00:00:02+00:00", lat: 27.43, lon: -15.04, position_text: "27°25.8′N 015°02.4′W", togo_nm: 24350, mg_nm: 1405, sailed_nm: 1546, run24_nm: 163, best24_nm: 175, best24_at: "2018-07-11T00:00:00+00:00", place: 1 };
    const tip = pointTip(b, { name: "Philippe Péché", first_name: null, yacht: "PRB", model: "Rustler 36" }, 16);
    expect(tip.title).toBe("Philippe Péché · 2018");
    expect(tip.lines).toEqual(["PRB · Rustler 36", "27°25.8′N 015°02.4′W", "1st of 16 on day 12 · 1,405 nm made good", "163 nm in the 24 hours to the report"]);
    const silent = pointTip({ ...b, fresh: false, run24_nm: null, mg_nm: null, place: null }, { name: "Philippe Péché", first_name: null, yacht: "PRB", model: "Rustler 36" }, 16);
    expect(silent.lines[2]).toBe("missed the 00:00 report: last position shown");
  });
  it("says finished for a stale row that came home — she is in port, not silent", () => {
    const b: EditionBoatDay = { race_key: "ggr2018", team_id: 8, race_day: 212, as_of: "2019-01-30T00:00:00+00:00", racing: false, finished: true, fresh: false, fix_at: "2019-01-29T09:12:00+00:00", lat: 46.4966, lon: -1.7833, position_text: "46°29.8′N 001°47.0′W", togo_nm: 0, mg_nm: null, sailed_nm: null, run24_nm: null, best24_nm: null, best24_at: null, place: 1 };
    const tip = pointTip(b, { name: "Jean-Luc Van Den Heede", first_name: null, yacht: "Matmut", model: "Rustler 36" }, 17);
    expect(tip.title).toBe("Jean-Luc Van Den Heede · 2018");
    expect(tip.lines).toEqual(["Matmut · Rustler 36", "46°29.8′N 001°47.0′W", "finished"]);
  });
  it("says out of the race for a stale row that neither races, nor finished, nor answered the report", () => {
    const b: EditionBoatDay = { race_key: "ggr2018", team_id: 94, race_day: 5, as_of: "2018-07-07T00:00:00+00:00", racing: false, finished: false, fresh: false, fix_at: "2018-07-06T00:00:00+00:00", lat: 43.3623, lon: -8.4115, position_text: "43°21.7′N 008°24.7′W", togo_nm: null, mg_nm: null, sailed_nm: null, run24_nm: null, best24_nm: null, best24_at: null, place: null };
    const tip = pointTip(b, { name: "Ertan Beskardes", first_name: "Ertan", yacht: "Lazy Otter", model: "Rustler 36" }, 18);
    expect(tip.title).toBe("Ertan Beskardes · 2018");
    expect(tip.lines).toEqual(["Lazy Otter · Rustler 36", "43°21.7′N 008°24.7′W", "out of the race"]);
  });
  // A fresh row always carries a fix (editions.py: "fresh" IS having one), so "no position" is only ever reached on a STALE
  // row where the archive has no fix at all — a rare gap, not the common no-report case, which still shows the last position.
  it("says no position rather than guessing one, for the rare archived row with no fix at all", () => {
    const b: EditionBoatDay = { race_key: "ggr2018", team_id: 85, race_day: 40, as_of: "2018-08-10T00:00:00+00:00", racing: true, finished: false, fresh: false, fix_at: null, lat: null, lon: null, position_text: null, togo_nm: null, mg_nm: null, sailed_nm: null, run24_nm: null, best24_nm: null, best24_at: null, place: null };
    const tip = pointTip(b, { name: "Philippe Péché", first_name: null, yacht: "PRB", model: "Rustler 36" }, 16);
    expect(tip.lines).toEqual(["PRB · Rustler 36", "no position", "missed the 00:00 report: last position shown"]);
  });
  it("turns a day's legs into shares that add to 100", () => {
    expect(windShares(day("ggr2026", 12))).toEqual({ upwind: 14, reaching: 15, running: 71 });
  });
  it("rounds awkward thirds so the shares still add to 100", () => {
    expect(windShares(day("ggr2026", 12, { legs_upwind: 1, legs_reaching: 1, legs_running: 1 }))).toEqual({ upwind: 33, reaching: 34, running: 33 });
  });
  it("is all zero when the day has no legs to share, never a division by zero", () => {
    expect(windShares(day("ggr2026", 1, { legs_upwind: 0, legs_reaching: 0, legs_running: 0 }))).toEqual({ upwind: 0, reaching: 0, running: 0 });
  });
  it("generates the take-away from the values, years named, newest first", () => {
    const s = takeaways({ now: day("ggr2026", 12), y2022: day("ggr2022", 12, { leader_mg_nm: 1143, median_mg_nm: 981 }), y2018: day("ggr2018", 12, { leader_mg_nm: 1386, median_mg_nm: 1218 }), leaderFirst: "Damien" });
    expect(s.lead).toBe("On day 12 Damien is 376 nm ahead of where 2022’s leader was, and 133 nm ahead of 2018’s.");
    expect(s.middle).toBe("The middle of this fleet is 231 nm ahead of 2022’s and 6 nm behind 2018’s.");
  });
  it("drops the 2018 clause when only 2022 is given, without a trailing 'leader was' it never earned", () => {
    const s = takeaways({ now: day("ggr2026", 12), y2022: day("ggr2022", 12, { leader_mg_nm: 1143, median_mg_nm: 981 }), leaderFirst: "Damien" });
    expect(s.lead).toBe("On day 12 Damien is 376 nm ahead of where 2022’s leader was.");
    expect(s.middle).toBe("The middle of this fleet is 231 nm ahead of 2022’s.");
  });
  it("drops the 2022 clause when only 2018 is given", () => {
    const s = takeaways({ now: day("ggr2026", 12), y2018: day("ggr2018", 12, { leader_mg_nm: 1386, median_mg_nm: 1218 }), leaderFirst: "Damien" });
    expect(s.lead).toBe("On day 12 Damien is 133 nm ahead of 2018’s.");
    expect(s.middle).toBe("The middle of this fleet is 6 nm behind 2018’s.");
  });
  it("says only where the leader stands, and leaves the middle sentence empty, once both past races are behind this year's course", () => {
    const s = takeaways({ now: day("ggr2026", 278), leaderFirst: "Damien" });
    expect(s.lead).toBe("On day 278 Damien is leading.");
    expect(s.middle).toBe("");
  });
});

describe("the duplicated lists stay identical to the worker's own", () => {
  const py = fs.readFileSync(path.join(__dirname, "../../worker/ggrstats/editions_data.py"), "utf8");
  // Each list is sliced out of the source first (up to ITS OWN closing "]" on its own line — the inner "races" arrays never
  // close on a line by themselves) so a check can't accidentally pass against the OTHER list: both carry a "team_2026" key,
  // and the same skipper (Ertan, id 17) appears in both RETURNING (this race) and VETERAN_HULLS (Miss Beagle's 2018 record).
  const veteranBlock = py.match(/VETERAN_HULLS = \[([\s\S]*?)\n\]/)?.[1];
  const returningBlock = py.match(/RETURNING = \[([\s\S]*?)\n\]/)?.[1];
  if (veteranBlock == null || returningBlock == null) throw new Error("could not find VETERAN_HULLS or RETURNING in the Python source — the drift guard cannot run blind");

  it("holds VETERAN_HULLS to the Python source, entry by entry — one glued string per hull so a field can only match within its own entry", () => {
    // "design": "Rustler 36" is shared verbatim by Miss Beagle, Solarem and Lazy Otter, and the ertan-beskardes "source" URL is
    // shared verbatim by Miss Beagle and Lazy Otter — checking yacht_2026/team_2026/design/source as four INDEPENDENT
    // substrings (as an earlier round of this test did) would let one hull's design or source drift to a wrong value while a
    // sibling hull's identical, still-correct value keeps the check green. So every field of a hull, its races included, is
    // glued into ONE exact string in the order the Python line writes them, and THAT is what must occur in the source.
    const count = (veteranBlock.match(/"yacht_2026"/g) ?? []).length;
    expect(VETERAN_HULLS.length).toBe(count);   // the count itself is Python-derived, not a second hardcoded number
    for (const h of VETERAN_HULLS) {
      const races = h.races.map(r => `{"race_key": "${r.race_key}", "team_id": ${r.team_id}, "yacht_then": "${r.yacht_then}", "note": "${r.note}"}`).join(", ");
      expect(veteranBlock).toContain(`{"yacht_2026": "${h.yacht_2026}", "team_2026": ${h.team_2026}, "design": "${h.design}", "races": [${races}], "source": "${h.source}"}`);
    }
  });
  it("holds RETURNING to the Python source, entry by entry — team_2026, first and every past race glued into one string per skipper", () => {
    // team_2026 and first happen to be unique across today's four rows, so checking them as independent substrings would pass
    // by luck, not by a guard; gluing them to their own entry's races closes that regardless of future uniqueness.
    const count = (returningBlock.match(/"team_2026"/g) ?? []).length;
    expect(RETURNING.length).toBe(count);
    for (const r of RETURNING) {
      const races = r.races.map(race => `{"race_key": "${race.race_key}", "team_id": ${race.team_id}}`).join(", ");
      expect(returningBlock).toContain(`{"team_2026": ${r.team_2026}, "first": "${r.first}", "races": [${races}]}`);
    }
  });
  it("holds MILESTONE_ORDER to the six names in the Python source's order", () => {
    const idx = MILESTONE_ORDER.map(name => py.indexOf(`("${name}",`));
    expect(idx.every(i => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});
