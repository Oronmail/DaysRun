// site/__tests__/export.test.ts — the data files: which month a report belongs to, which months exist, what the worker's ping renews.
import { describe, it, expect } from "vitest";
import { filesToRenew, monthBounds, monthCanExist, monthFile, monthLabel, monthOf, monthsOfRace, parseFile, raceDayOf } from "../lib/export";
const START = "2026-09-06T12:30:00+00:00";
describe("the months of the data files", () => {
  it("puts a report in the month its hours were sailed in: 00:00 on the 1st closes the month before", () => {
    expect(monthOf("2026-10-01T00:00:00+00:00")).toBe("2026-09");
    expect(monthOf("2026-10-01T04:00:00+00:00")).toBe("2026-10");
    expect(monthOf("2026-09-06T16:00:00+00:00")).toBe("2026-09");
    expect(monthOf("2027-01-01T00:00:00Z")).toBe("2026-12");
  });
  it("bounds a month as after its 1st 00:00 UTC, up to and including the next 1st 00:00 UTC, so no report falls between two files", () => {
    expect(monthBounds("2026-09")).toEqual({ after: "2026-09-01T00:00:00.000Z", upTo: "2026-10-01T00:00:00.000Z" });
    expect(monthBounds("2026-10").after).toBe(monthBounds("2026-09").upTo);
    expect(monthBounds("2026-12")).toEqual({ after: "2026-12-01T00:00:00.000Z", upTo: "2027-01-01T00:00:00.000Z" });
  });
  it("lists every month from the start to the newest report, and none before the first report", () => {
    expect(monthsOfRace(START, "2026-09-17T20:00:00+00:00")).toEqual(["2026-09"]);
    expect(monthsOfRace(START, "2026-10-01T00:00:00+00:00")).toEqual(["2026-09"]);          // that report is still September's
    expect(monthsOfRace(START, "2026-10-01T04:00:00+00:00")).toEqual(["2026-09", "2026-10"]);
    expect(monthsOfRace(START, "2027-05-20T08:00:00+00:00")).toHaveLength(9);
    expect(monthsOfRace(START, "2026-08-30T00:00:00+00:00")).toEqual([]);
  });
  it("names a month's file and reads the name back, refusing anything else", () => {
    expect(monthFile("2026-09")).toBe("daysrun-ggr2026-2026-09.xlsx");
    expect(parseFile("daysrun-ggr2026-2026-09.xlsx")).toBe("2026-09");
    expect(parseFile(monthFile("2027-01"))).toBe("2027-01");
    for (const bad of ["daysrun-ggr2026-2026-13.xlsx", "daysrun-ggr2026-2026-00.xlsx", "daysrun-ggr2026-2026-9.xlsx", "daysrun-ggr2026-.xlsx", "daysrun-ggr2026-daily.xlsx", "x.xlsx", "daysrun-ggr2026-2026-09.csv", "../secret", ""]) expect(parseFile(bad), bad).toBeNull();
  });
  it("says a month in words", () => { expect(monthLabel("2026-09")).toBe("September 2026"); expect(monthLabel("2027-01")).toBe("January 2027"); });
  it("renews the month being sailed; on the 1st, also the month that has just closed", () => {
    expect(filesToRenew(Date.parse("2026-09-17T20:05:00Z"))).toEqual(["daysrun-ggr2026-2026-09.xlsx"]);
    expect(filesToRenew(Date.parse("2026-10-01T00:05:00Z"))).toEqual(["daysrun-ggr2026-2026-09.xlsx", "daysrun-ggr2026-2026-10.xlsx"]);
    expect(filesToRenew(Date.parse("2026-10-02T00:05:00Z"))).toEqual(["daysrun-ggr2026-2026-10.xlsx"]);
  });
  it("knows without asking the database which months can exist: from the month of the start to the month being sailed", () => {
    // An invented file name must cost nothing: the route answers 404 before any read. Only a handful of names ever reach the database.
    const now = Date.parse("2026-11-15T10:00:00Z");
    for (const m of ["2026-09", "2026-10", "2026-11"]) expect(monthCanExist(m, now), m).toBe(true);
    for (const m of ["2026-08", "2026-12", "2031-01", "1999-01"]) expect(monthCanExist(m, now), m).toBe(false);
    expect(monthCanExist("2026-10", Date.parse("2026-09-30T23:00:00Z"))).toBe(false);
    expect(monthCanExist("2026-10", Date.parse("2026-10-01T00:05:00Z"))).toBe(true);    // the calendar allows it; whether it has a report yet is the database's to say
  });
  it("numbers race days as GGR does: 6 September is day 0", () => {
    expect(raceDayOf("2026-09-06", START)).toBe(0); expect(raceDayOf("2026-09-16", START)).toBe(10); expect(raceDayOf("2027-01-01", START)).toBe(117);
  });
});
