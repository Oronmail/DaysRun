// site/__tests__/tips.test.ts — what a chart says about the bar or the point under the pointer.
import { describe, it, expect } from "vitest";
import { legTip, dayRunTip, placeTip, windTip, side, racePlaceTip, raceGapTip, duelTip, conditionsTip, designTip, boatTip } from "../lib/tips";
describe("the words in a chart's hover box", () => {
  it("names a 4-hour leg by its two report times, with the average speed (never SOG)", () => {
    expect(legTip(5.74, "2026-09-17T20:00:00+00:00", false)).toEqual({ title: "17 Sep · 16:00 to 20:00 UTC", lines: ["5.7 kt average speed"] });
    expect(legTip(6.62, "2026-09-17T04:00:00+00:00", true)).toEqual({ title: "17 Sep · 00:00 to 04:00 UTC", lines: ["6.6 kt average speed", "the fastest leg of the seven days"] });
  });
  it("names the day a leg STARTED when it runs over midnight", () => {
    expect(legTip(6.1, "2026-09-17T00:00:00+00:00", false).title).toBe("16 Sep 20:00 to 17 Sep 00:00 UTC");
  });
  it("says why a leg has no bar", () => { expect(legTip(null, "2026-09-16T04:00:00+00:00", false).lines).toEqual(["no speed: a report is missing at one end of this leg"]); });
  it("names a daily run by the day it covers: the run stored at 00:00 on the 17th is the 16th's", () => {
    expect(dayRunTip(159.6, "2026-09-17T00:00:00+00:00", true)).toEqual({ title: "16 Sep · 00:00 to 00:00 UTC", lines: ["160 nm sailed along the track", "the biggest day shown"] });
    expect(dayRunTip(null, "2026-09-10T00:00:00+00:00", false).lines).toEqual(["not enough reports that day to measure a full 24 hours"]);
  });
  it("says a place in words", () => { expect(placeTip(3, "2026-09-17T00:00:00+00:00")).toEqual({ title: "17 Sep · 00:00 UTC", lines: ["3rd place"] }); expect(placeTip(11, "2026-09-12T00:00:00+00:00").lines).toEqual(["11th place"]); });
  it("sets speed for the wind against the fleet's median, in points, and says model wind", () => {
    expect(windTip("Damien", 0.45, 55, 0.381)).toEqual({ title: "Damien", lines: ["45% of the model wind speed", "55 legs sailed in 8–25 kt since the start", "7 points above the fleet’s median"] });
    expect(windTip("Selim", 0.247, 35, 0.381).lines[2]).toBe("13 points below the fleet’s median");
    expect(windTip("Guido", 0.381, 38, 0.381).lines[2]).toBe("on the fleet’s median");
  });
  it("opens the box toward the middle of the chart, so it never leaves it", () => {
    expect(side(100, 40, 728, 176)).toBe("");            // left half, upper part: to the right, downward
    expect(side(600, 40, 728, 176)).toBe(" flip");       // right half: to the left
    expect(side(600, 150, 728, 176)).toBe(" flip up");   // and near the foot: upward
  });
  it("names the boat first on a chart of many lines", () => {
    expect(racePlaceTip("Damien", 1, "2026-09-12T00:00:00+00:00")).toEqual({ title: "Damien · 12 Sep 00:00 UTC", lines: ["1st place"] });
    expect(raceGapTip("Gunnar", 438.2, "2026-09-17T00:00:00+00:00")).toEqual({ title: "Gunnar · 17 Sep 00:00 UTC", lines: ["438 nm behind the leader"] });
    expect(raceGapTip("Damien", 0, "2026-09-17T00:00:00+00:00").lines).toEqual(["leading"]);
  });
  it("says who was ahead in a duel at that report, whichever of the two it was", () => {
    expect(duelTip(7.4, "Ertan", "Etienne", 1789732800)).toEqual({ title: "18 Sep · 12:00 UTC", lines: ["Ertan 7 nm ahead of Etienne"] });
    expect(duelTip(-3.2, "Ertan", "Etienne", 1789718400).lines).toEqual(["Etienne 3 nm ahead of Ertan"]);
    expect(duelTip(0.3, "Ertan", "Etienne", 1789718400).lines).toEqual(["level"]);
  });
  it("calls the wind model wind, gives where it blows from in three figures, and the sea", () => {
    expect(conditionsTip("Pär", { wind_kn: 25.6, gust_kn: 33.2, wind_dir_deg: 40, wave_m: 2.44 }, "force 6")).toEqual({ title: "Pär", lines: ["26 kt from 040°, gusts 33 kt", "force 6 · waves 2.4 m", "model values, not measured on board"] });
  });
  it("puts a boat's 7-day average speed beside her design and place", () => {
    expect(designTip("Damien", "Rustler 36", 5.93, 1)).toEqual({ title: "Damien · Rustler 36", lines: ["5.9 kt average speed, last 7 days", "1st place"] });
    expect(designTip("Pär", null, null, 15).lines).toEqual(["no 7-day average yet", "15th place"]);
  });
  it("says where a boat on the fleet chart stands: place, miles to go, the latest leg with its course made good, the position and its time", () => {
    const b = { team: { first_name: "Louis", name: "Louis Kerdelhué" }, rank: 8, dtf_nm: 24468.3, spd4: 1.74, cmg4: 107.2, stale: false, position_text: "28°55.1′N 013°36.4′W", last_fix_at: "2026-09-18T12:00:14+00:00", as_of: "2026-09-18T12:00:00+00:00" };
    expect(boatTip(b)).toEqual({ title: "Louis · 8th", lines: ["24,468 nm to go", "latest leg 1.7 kt, course made good 107°", "28°55.1′N 013°36.4′W at 12:00 UTC"] });
  });
  it("says so when the boat missed the report, and shows no leg for her", () => {
    const b = { team: { first_name: "Andrea", name: "Andrea Lodolo" }, rank: 3, dtf_nm: 24420, spd4: null, cmg4: null, stale: true, position_text: "28°49.7′N 013°48.5′W", last_fix_at: "2026-09-18T08:03:00+00:00", as_of: "2026-09-18T12:00:00+00:00" };
    expect(boatTip(b).lines).toEqual(["24,420 nm to go", "missed the 12:00 report", "28°49.7′N 013°48.5′W at 08:03 UTC"]);
  });
});
