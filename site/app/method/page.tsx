// site/app/method/page.tsx
import Shell, { NOTICE } from "@/components/Shell";
import { latestFleet } from "@/lib/db";
import { DEFINITIONS } from "@/lib/text";
export const revalidate = 3600;
export default async function Page() {
  const fleet = await latestFleet();
  return <Shell active="Method" dateline="HOW THE NUMBERS ARE MADE" title="METHOD" note="asked in the chat: what does each column mean?">
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div className="rule-title"><div className="label">Definitions</div></div>
        {DEFINITIONS.map(([k, v]) => <div key={k} style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: 24, padding: "14px 0", borderBottom: "1px solid var(--hair)" }}><div className="mont" style={{ fontSize: 14, fontWeight: 600 }}>{k}</div><div style={{ fontSize: 16, lineHeight: 1.55 }}>{v}</div></div>)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <div className="panel" style={{ borderLeft: "4px solid var(--loss)" }}><div className="label" style={{ color: "var(--loss)", fontSize: 13 }}>Do not relay</div><div style={{ fontSize: 16, lineHeight: 1.5, paddingTop: 8 }}>Skippers race without outside information. Under the race rules (NOR F.8.2) a skipper who receives another boat’s position from a tracker takes a 48-hour penalty, then disqualification. Please never pass anything from this site to a competitor.</div></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><div className="rule-title"><div className="label">Sources</div></div>
          {([["Positions, ranking, splits", "YB Tracking, with its permission. We store every report, because YB keeps only a thinned track after a few days."], ["Weather and sea", "Open-Meteo, licensed CC BY 4.0."], ["Past editions", "YB’s 2018 and 2022 archives and its ghost replays."]] as [string, string][]).map(([k, v]) => <div key={k} style={{ padding: "10px 0", borderBottom: "1px solid var(--hair)" }}><div className="mont" style={{ fontSize: 13, fontWeight: 600 }}>{k}</div><div className="small" style={{ fontSize: 14, lineHeight: 1.5 }}>{v}</div></div>)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><div className="rule-title"><div className="label">Known limits</div></div><div style={{ fontSize: 14, lineHeight: 1.55 }}>The 2018 and 2022 ghosts sailed slightly different courses; we use YB’s distances as given. YB doesn’t publish where its split checkpoints are. Records use the 4-hour grid, so they are comparable across boats but not with GPS logs. Data as of race day {fleet.race_day}.</div></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><div className="rule-title"><div className="label">Credits</div></div><div style={{ fontSize: 14, lineHeight: 1.55 }}>{NOTICE} Built by fans. Inspired by Jonathan Endersby’s GGR Underground statistics for the 2022 race.</div></div>
      </div>
    </div>
  </Shell>;
}
