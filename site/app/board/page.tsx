// site/app/board/page.tsx — 1920×1080 dark board for the daily YouTube video; open at /board and screenshot at 1920×1080
import { latestFleet, boatStats, recordBoard, sprintResults, conditionsAt } from "@/lib/db";
import { nm, sgn, hhmm, dayMon, hoursText, kn, SITE_NAME } from "@/lib/format";
import { movers } from "@/lib/moves";
export const revalidate = 900;
const K = { bg: "#10161C", panel: "#18222C", line: "#26323D", text: "#ECE6D6", muted: "#9AA3AA", gold: "#DEB200", gain: "#5FB3A1", loss: "#E0604A", amber: "#F2A93B" };
const MONO = "var(--font-mono)", SANS = "var(--font-sans)";
export default async function Page() {
  const fleet = await latestFleet(); const [boats, recs, sprints] = await Promise.all([boatStats(fleet.as_of), recordBoard(fleet.as_of), sprintResults(fleet.as_of)]);
  const cond = await conditionsAt(boats); const lead = boats[0]; const pct = lead.made_good_nm / (lead.made_good_nm + lead.dtf_nm) * 100;
  const c = (id: number) => cond.find(r => r.team_id === id); const strongest = boats.filter(b => c(b.team_id)).sort((a, b) => c(b.team_id)!.wind_kn - c(a.team_id)!.wind_kn)[0];
  const best = boats.find(b => b.fleet_best24) ?? boats[0];   // no 24-hour window exists in the first hours of the race
  const pbs = boats.filter(b => b.pb24 || (b.fleet_best24 && Math.round(b.run24_nm ?? 0) >= Math.round(b.best24_nm)));
  const { ups, downs, biggest } = movers(boats);           // never counts a place gained against a missed report
  const rec = (kind: string) => recs.find(r => r.kind === kind && r.win === "race" && r.rank === 1);
  const tile = (k: string, v: string, lines: string[]) => <div key={k} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "20px 22px", background: K.panel, borderTop: `3px solid ${K.gold}` }}><div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, letterSpacing: 2, color: K.muted }}>{k}</div><div style={{ fontFamily: SANS, fontSize: 52, fontWeight: 600, lineHeight: 1 }}>{v}</div>{lines.map(l => <div key={l} style={{ fontSize: 19, lineHeight: 1.35 }}>{l}</div>)}</div>;
  const th = (t: string, al: "left" | "right" = "left") => <th key={t} style={{ textAlign: al, padding: "0 10px 10px", fontFamily: SANS, fontSize: 16, fontWeight: 600, letterSpacing: 2, color: K.muted, borderBottom: `2px solid ${K.gold}`, whiteSpace: "nowrap" }}>{t}</th>;
  return <div style={{ width: 1920, height: 1080, background: K.bg, color: K.text, display: "flex", flexDirection: "column", padding: "48px 72px 40px", boxSizing: "border-box", gap: 22, fontFamily: "var(--font-serif)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div><div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 600, letterSpacing: 4, color: K.gold }}>GOLDEN GLOBE RACE 2026 · RACE DAY {fleet.race_day} · {dayMon(fleet.as_of).toUpperCase()} · {hhmm(fleet.as_of)} UTC</div><div style={{ fontFamily: SANS, fontSize: 60, fontWeight: 700, letterSpacing: 6, lineHeight: 1 }}>FLEET BOARD</div></div>
      <div style={{ width: 560, display: "flex", flexDirection: "column", gap: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: K.muted }}><span>Leader’s progress, Les Sables to Les Sables</span><span style={{ fontFamily: MONO, color: K.text }}>{pct.toFixed(1)}%</span></div><div style={{ height: 10, background: K.line, borderRadius: 5 }}><div style={{ width: `${pct.toFixed(1)}%`, height: 10, background: K.gold, borderRadius: 5 }} /></div><div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 15, color: K.muted }}><span>{nm(lead.made_good_nm)} nm made good</span><span>{nm(lead.dtf_nm)} nm to go</span></div></div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1110px minmax(0,1fr)", gap: 36, flex: 1, minHeight: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{th("PLACE")}{th("±24H")}{th("SKIPPER")}{th("DESIGN")}{th("TO GO NM", "right")}{th("GAP", "right")}{th("24H RUN", "right")}{th("VS VDH 2018", "right")}</tr></thead>
        <tbody>{boats.map((b, i) => <tr key={b.team_id} style={{ background: i % 2 ? K.bg : K.panel }}>
          <td style={{ padding: "0 10px", height: 43, fontFamily: MONO, fontSize: 22, color: b.rank === 1 ? K.gold : K.text }}>{b.rank}</td>
          <td style={{ padding: "0 10px", fontFamily: MONO, fontSize: 18, color: b.rank_change > 0 ? K.gain : b.rank_change < 0 ? K.loss : K.muted }}>{b.rank_change > 0 ? `▲${b.rank_change}` : b.rank_change < 0 ? `▼${-b.rank_change}` : "–"}</td>
          <td style={{ padding: "0 10px", fontFamily: SANS, fontSize: 21, fontWeight: 600, whiteSpace: "nowrap" }}>{b.team.name}{b.stale && <span style={{ fontFamily: SANS, fontSize: 13, letterSpacing: 1, color: K.amber, border: `1px solid ${K.amber}`, padding: "2px 6px", marginLeft: 10 }}>MISSED {hhmm(fleet.as_of)}</span>}{b.restart_at && <span style={{ fontFamily: SANS, fontSize: 13, letterSpacing: 1, color: K.muted, border: `1px solid ${K.muted}`, padding: "2px 6px", marginLeft: 10 }}>RESTARTED {dayMon(b.restart_at).toUpperCase()}</span>}</td>
          <td style={{ padding: "0 10px", fontSize: 18, fontStyle: "italic", color: K.muted, whiteSpace: "nowrap" }}>{b.team.design_class === "Not listed" ? "—" : b.team.design_class}</td>
          <td style={{ padding: "0 10px", textAlign: "right", fontFamily: MONO, fontSize: 22 }}>{nm(b.dtf_nm)}</td>
          <td style={{ padding: "0 10px", textAlign: "right", fontFamily: MONO, fontSize: 20, color: K.muted }}>{b.gap_nm ? `+${nm(b.gap_nm)}` : "—"}</td>
          <td style={{ padding: "0 10px", textAlign: "right", fontFamily: MONO, fontSize: 22 }}><span style={{ color: b.fleet_best24 ? K.gold : K.text }}>{nm(b.run24_nm)}</span>{(b.pb24 || b.fleet_best24) ? <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: b.fleet_best24 ? K.gold : K.gain, marginLeft: 6 }}>PB</span> : <span style={{ display: "inline-block", width: 26 }} />}</td>
          <td style={{ padding: "0 10px", textAlign: "right", fontFamily: MONO, fontSize: 20, color: (b.vs_vdh_days ?? 0) > 0 ? K.gain : K.loss }}>{sgn(b.vs_vdh_days)} d</td></tr>)}</tbody></table>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3, minmax(0,1fr))", gap: 14 }}>
        {tile("LONGEST RUN · LAST 24 H", `${nm(best.run24_nm)} nm`, [best.team.name, `${best.team.design_class} · ${best.pb24 || (best.run24_nm ?? 0) >= best.best24_nm ? "personal best" : ""}`])}
        {tile(`NEXT MARK · ${lead.next_mark.toUpperCase()}`, `${nm(lead.next_mark_nm)} nm`, [`${lead.team.first_name} · ETA ${hhmm(lead.next_mark_eta)} UTC`, boats[1] ? `${boats[1].team.first_name} · ${nm(boats[1].next_mark_nm)} nm · ETA ${hhmm(boats[1].next_mark_eta)}` : ""])}
        {tile("STRONGEST WIND", strongest ? `${Math.round(c(strongest.team_id)!.wind_kn)} kt` : "—", strongest ? [`${strongest.team.first_name} · gusts ${Math.round(c(strongest.team_id)!.gust_kn)}`] : [])}
        {tile("AGAINST THE GHOSTS", `${fleet.ahead_vdh} of ${fleet.racing}`, ["ahead of Van Den Heede 2018", `${fleet.ahead_kirsten} of ${fleet.racing} ahead of Neuschäfer 2022`])}
        {tile("PERSONAL BESTS · 24 H", `${pbs.length} today`, [pbs.slice(0, 2).map(b => `${b.team.first_name} ${nm(b.run24_nm)}`).join(" · "), pbs.slice(2, 4).map(b => `${b.team.first_name} ${nm(b.run24_nm)}`).join(" · ")])}
        {tile("MOVERS · 24 H", ups.length ? `+${biggest} × ${ups.length}` : "none", [`up ${ups.map(b => b.team.first_name).join(" · ") || "—"}`, `down ${downs.map(b => b.team.first_name).join(" · ") || "—"}`])}
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 20px", background: K.panel, borderLeft: `4px solid ${K.gold}`, fontSize: 19, whiteSpace: "nowrap", overflow: "hidden" }}><span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, letterSpacing: 2, color: K.gold }}>RACE RECORDS</span>
      {rec("best24") && <span><span style={{ color: K.muted }}>Best 24 h</span> <span style={{ fontFamily: MONO }}>{nm(rec("best24")!.value)} nm</span> {rec("best24")!.team.first_name}</span>}{rec("best4") && <span><span style={{ color: K.muted }}>Best 4 h</span> <span style={{ fontFamily: MONO }}>{kn(rec("best4")!.value)} kt</span> {rec("best4")!.team.first_name}</span>}{rec("best7") && <span><span style={{ color: K.muted }}>Best 7 days</span> <span style={{ fontFamily: MONO }}>{nm(rec("best7")!.value)} nm</span> {rec("best7")!.team.first_name}</span>}
      {[...new Set(sprints.map(s => s.sprint_name))].map(n => { const s = sprints.filter(x => x.sprint_name === n)[0]; return <span key={n}><span style={{ color: K.muted }}>{n} sprint</span> <span style={{ fontFamily: MONO }}>{hoursText(s.hours)}</span> {s.team.first_name}</span>; })}</div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: K.muted }}><span>Unofficial fleet statistics · {SITE_NAME} · not affiliated with the Golden Globe Race</span><span>Positions: YB Tracking · Weather: Open-Meteo · PB = personal best · gold run = longest of the day</span></div>
  </div>;
}
