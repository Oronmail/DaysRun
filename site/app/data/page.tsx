// site/app/data/page.tsx — the numbers to take away: one Excel workbook for each month of the race, each holding that month in
// full, and what every column means. The list of columns is the one the workbooks are built from (lib/export-columns.ts).
import Shell from "@/components/Shell";
import { latestFleet, raceSetup } from "@/lib/db";
import { COLUMNS, SHEET_NAMES, SHEET_NOTES } from "@/lib/export-columns";
import { monthBounds, monthFile, monthLabel, monthOf, monthsOfRace } from "@/lib/export";
import { pageMeta } from "@/lib/seo";
export const revalidate = 900;
export const metadata = pageMeta("/data");
const row = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "baseline", padding: "12px 0", borderBottom: "1px solid var(--hair)" } as const;

export default async function Page() {
  const [fleet, setup] = await Promise.all([latestFleet(), raceSetup()]);
  const months = monthsOfRace(setup.start_at, fleet.as_of).reverse();                       // the month being sailed first
  const first = monthOf(setup.start_at);
  const covers = (m: string) => m === first ? "from the start of the race" : "the whole month";
  const state = (m: string) => Date.parse(fleet.as_of) >= Date.parse(monthBounds(m).upTo) ? "complete" : "so far: the month is still being sailed";

  return <Shell active="Data" dateline="EVERY NUMBER, TO TAKE AWAY" title="DATA" note="asked in the chat: can I have the numbers in Excel?">
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="rule-title"><div className="label">Choose a month</div><div className="small" style={{ fontStyle: "italic" }}>Excel workbooks · rebuilt with every 4-hourly report</div></div>
        {months.map(m => <div key={m} style={row}>
          <div><div className="mont" style={{ fontSize: 16, fontWeight: 600 }}>{monthLabel(m)}</div><div className="small">{covers(m)} · {state(m)}</div></div>
          <a className="mont" style={{ fontSize: 14, fontWeight: 600 }} href={`/data/${monthFile(m)}`} download>Download .xlsx</a></div>)}
        <div style={{ fontSize: 14, lineHeight: 1.55, paddingTop: 10 }}>Every file holds its month in full: one row per boat per day, and one row per boat per 4-hourly report. They all have the same columns in the same order, so months stack — for more than one month, take them all and paste the rows together, or point Excel’s Get Data at the folder. Every row carries the figures that reach further back than its month: the 7-day run, the totals since the start, the bests. A September row and a May row compare directly.</div>
        <div style={{ fontSize: 14, lineHeight: 1.55, paddingTop: 4 }}>Unofficial. Nothing in these files may be relayed to a competitor (NOR F.8.2). The positions are YB Tracking’s public feed; the wind and sea are Open-Meteo’s (CC BY 4.0), model values, not measured on board. If you publish something made from a file, please credit Day’s Run for the statistics and those sources for the data; use of the data is subject to their licences and approval, and Day’s Run grants no rights over it.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="rule-title"><div className="label">In every file</div></div>
        {SHEET_NOTES.map(([k, v]) => <div key={k} style={{ padding: "10px 0", borderBottom: "1px solid var(--hair)" }}><div className="mont" style={{ fontSize: 13, fontWeight: 600 }}>{k}</div><div className="small" style={{ fontSize: 14, lineHeight: 1.5 }}>{v}</div></div>)}
        <div style={{ fontSize: 14, lineHeight: 1.55, paddingTop: 8 }}>A blank cell means there is no value, never zero. A boat that missed a report keeps her last position with its true time, and <span className="num">current_fix</span> says FALSE. <span className="num">legs_complete</span> says how many of a day’s six 4-hour legs are whole: filter on 6 for clean 24-hour runs.</div>
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 48 }}>
      <div className="rule-title"><div className="label">The columns</div><div className="small" style={{ fontStyle: "italic" }}>{COLUMNS.length} columns · the same list is inside every file</div></div>
      {COLUMNS.map(c => <div key={c.key} className="stack" style={{ display: "grid", gridTemplateColumns: "260px 90px 190px minmax(0,1fr)", gap: 20, padding: "10px 0", borderBottom: "1px solid var(--hair)" }}>
        <div className="num" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{c.key}</div><div className="small">{c.unit}</div>
        <div className="small">{c.sheets.map(s => SHEET_NAMES[s]).join(", ")}</div><div style={{ fontSize: 14, lineHeight: 1.5 }}>{c.meaning}</div></div>)}
    </div>
  </Shell>;
}
