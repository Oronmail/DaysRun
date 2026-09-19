// site/lib/xlsx.ts — one month of the race as an .xlsx: About, Standing, Daily, Every report, Boats, Columns.
// Thin on purpose: what a column is and how a value is made live in export-columns.ts; this file only lays them out.
// Every month's file has the same sheets and the same columns in the same order, so months stack: that is how a reader gets
// more than one month, and a test holds it. The library writes no author into the file (a test holds that too: the site is anonymous).
import writeExcelFile from "write-excel-file/node";
import { COLUMNS, SHEET_NAMES, SHEET_NOTES, cellsOf, columnsOf, type Cell, type Column, type ExportRaw, type Sheet } from "./export-columns";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const INK = "#1B1E24", GOLD = "#7A6000";
const FORMATS = { time: "yyyy-mm-dd hh:mm", date: "yyyy-mm-dd", degrees: "0.0000" } as const;
type Out = { value: string | number | boolean | Date; type?: unknown; format?: string; fontWeight?: "bold"; textColor?: string; backgroundColor?: string; wrap?: boolean; alignVertical?: "top"; fontSize?: number; fontStyle?: "italic" } | null;

const head = (keys: string[]): Out[] => keys.map(k => ({ value: k, fontWeight: "bold", textColor: "#FFFFFF", backgroundColor: INK }));
const cell = (c: Column, v: Cell): Out => (v == null ? null : c.kind ? { value: v, format: FORMATS[c.kind], ...(v instanceof Date ? { type: Date } : {}) } : { value: v });
const widthOf = (c: Column) => c.width ?? (c.kind === "time" ? 17 : Math.max(11, Math.min(30, c.key.length + 3)));

function dataSheet(sheet: Sheet, rows: ExportRaw[], startIso: string, stickyColumns: number) {
  const cols = columnsOf(sheet);
  return { sheet: SHEET_NAMES[sheet], stickyRowsCount: 1, stickyColumnsCount: stickyColumns, columns: cols.map(c => ({ width: widthOf(c) })),
    data: [head(cols.map(c => c.key)), ...rows.map(r => cellsOf(sheet, r, startIso).map((v, i) => cell(cols[i], v)))] };
}

export type WorkbookInput = { title: string; period: string; siteHost: string; startIso: string; madeIso: string; standing: ExportRaw[]; daily: ExportRaw[]; reports: ExportRaw[] };

export function aboutLines(w: Pick<WorkbookInput, "title" | "period" | "siteHost" | "madeIso"> & { newestIso: string }): [string, string][] {
  const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  return [
    ["DAY’S RUN", "Unofficial statistics for the Golden Globe Race 2026"], ["", ""],
    ["This file", w.title], ["Period", w.period], ["Newest report in it", utc(w.newestIso)], ["Made", utc(w.madeIso)], ["", ""],
    ["Unofficial", "Made by fans. Not affiliated with the Golden Globe Race or its organisers. To follow the boats live, use the race’s own tracker: goldengloberace.com/live-tracker"],
    ["Do not relay", "Nothing in this file may be relayed to a competitor (Notice of Race F.8.2)."], ["", ""],
    ...SHEET_NOTES,
    ["More than one month", `There is one file per month of the race, all with the same sheets and the same columns in the same order, so they stack: paste one month’s rows under another’s, or point Excel’s Get Data at a folder of them. Every row carries the figures that reach back past the month — the 7-day run, the totals since the start, the bests — so a September row and a May row compare directly. All the months: ${w.siteHost}/data`],
    ["Blank cells", "A blank cell means there is no value. It never means zero."],
    ["Missed reports", "A boat that missed a report keeps her last position, with its true time, and current_fix says FALSE. legs_complete says how many of a day’s six 4-hour legs are whole; filter on 6 for clean 24-hour runs."],
    ["Units", "Nautical miles (nm), knots (kt), degrees true, UTC. Latitude and longitude in decimal degrees, north and east positive."], ["", ""],
    ["Positions", "YB Tracking’s public feed: the same addresses the official tracker page loads."],
    ["Wind and sea", "Open-Meteo, licensed CC BY 4.0. Model values at each fix, not measured on board."],
    ["Method", `How every number is made: ${w.siteHost}/method`],
    ["Using it", `If you publish something made from this file, please credit Day’s Run (${w.siteHost}) for the statistics, YB Tracking for the positions and Open-Meteo for the weather. Use of the data is subject to those sources’ licences and approval; Day’s Run grants no rights over it.`],
  ];
}

export async function buildWorkbook(w: WorkbookInput): Promise<Buffer> {
  const newestIso = w.reports.reduce((m, r) => (r.as_of > m ? r.as_of : m), "");
  const about = aboutLines({ ...w, newestIso }).map(([k, v], i): Out[] => [
    k ? { value: k, fontWeight: "bold", textColor: i === 0 ? INK : GOLD, alignVertical: "top", ...(i === 0 ? { fontSize: 16 } : {}) } : null,
    v ? { value: v, wrap: true, alignVertical: "top", ...(i === 0 ? { fontStyle: "italic" as const, fontSize: 12 } : {}) } : null]);
  const boats = [...new Map(w.reports.map(r => [r.team_id, r])).values()].sort((a, b) => a.skipper.localeCompare(b.skipper));
  const boatCols = COLUMNS.filter(c => ["boat_id", "skipper", "yacht", "design", "country"].includes(c.key));
  const sheets = [
    { sheet: "About", data: about, columns: [{ width: 26 }, { width: 110 }], showGridLines: false },
    dataSheet("standing", w.standing, w.startIso, 3),
    dataSheet("daily", w.daily, w.startIso, 5),
    dataSheet("reports", w.reports, w.startIso, 4),
    { sheet: "Boats", stickyRowsCount: 1, columns: boatCols.map(c => ({ width: widthOf(c) })), data: [head(boatCols.map(c => c.key)), ...boats.map(b => boatCols.map(c => cell(c, c.value(b, w.startIso))))] },
    { sheet: "Columns", stickyRowsCount: 1, columns: [{ width: 30 }, { width: 12 }, { width: 30 }, { width: 110 }],
      data: [head(["column", "unit", "sheets", "meaning"]), ...COLUMNS.map((c): Out[] => [{ value: c.key }, c.unit ? { value: c.unit } : null,
        { value: c.sheets.map(s => SHEET_NAMES[s]).join(", ") }, { value: c.meaning, wrap: true, alignVertical: "top" }])] },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the library's cell type is wider than ours; the shapes above are the documented ones
  return await writeExcelFile(sheets as any, { fontFamily: "Arial", fontSize: 10 }).toBuffer();
}
