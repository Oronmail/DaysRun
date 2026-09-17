// site/app/course/page.tsx
import Shell from "@/components/Shell";
import { Who } from "@/components/Who";
import { latestFleet, boatStats, sprintResults } from "@/lib/db";
import { COURSE, SPRINT_ORDER } from "@/lib/text";
import { dateline, nm, kn, dayMonTime, hoursText } from "@/lib/format";
export const revalidate = 900;
export default async function Page() {
  const fleet = await latestFleet(); const [boats, sprints] = await Promise.all([boatStats(fleet.as_of), sprintResults(fleet.as_of)]);
  const lead = boats[0];
  // Most advanced sprint first, in course order — not by whichever happens to hold the shortest time, which compares
  // different stretches of water. The pencil note names the fastest boat through the newest sprint (rows arrive sorted by hours).
  const names = [...SPRINT_ORDER].reverse().filter(n => sprints.some(s => s.sprint_name === n));
  const fastest = sprints.find(s => s.sprint_name === names[0]);
  return <Shell active="Course & sprints" dateline={dateline(fleet.as_of, fleet.race_day)} title="COURSE & SPRINTS" note={fastest ? `${fastest.team.first_name} fastest through ${fastest.sprint_name}` : undefined}>
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "330px minmax(0,1fr)", gap: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="rule-title"><div className="label">The course ahead</div><div className="small" style={{ fontStyle: "italic" }}>marks the fleet must pass; only Lanzarote and Hobart are gates</div></div>
        {COURSE.map(([n, r]) => { const next = n.includes(lead.next_mark); /* the worker says "Trindade", the course list "Island of Trindade" */ return <div key={n} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: 12 }}><svg width="14" height="14"><path d="M7 1 L13 7 L7 13 L1 7 Z" fill={next ? "var(--magenta)" : "none"} stroke={next ? "var(--magenta)" : "var(--graphite)"} strokeWidth="1.5" /></svg><div style={{ paddingBottom: 14 }}><div className="mont" style={{ fontSize: 14, fontWeight: 600 }}>{n}{next && <span style={{ fontSize: 10, letterSpacing: 1, color: "var(--magenta)" }}> NEXT</span>}</div><div className="small" style={{ fontStyle: "italic" }}>{r}{next && ` · ${nm(lead.next_mark_nm)} nm from the leader`}</div></div></div>; })}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Arrivals at the next mark</div><div className="small" style={{ fontStyle: "italic" }}>distance ÷ made-good speed over the last 7 days</div></div>
        <table className="data"><thead><tr><th>Place</th><th>Skipper</th><th>Next mark</th><th className="r">Distance nm</th><th className="r">Made good kt, 7 d</th><th className="r">ETA UTC</th></tr></thead>
          <tbody>{boats.map(b => <tr key={b.team_id}><td className="num">{b.rank}</td><td><Who b={b} sub={false} /></td><td style={{ fontStyle: "italic", fontSize: 13 }}>{b.next_mark}</td><td className="num r">{nm(b.next_mark_nm)}</td><td className="num r">{kn(b.vmg7_kn)}</td><td className="num r">{dayMonTime(b.next_mark_eta)}{b.stale ? " *" : ""}</td></tr>)}</tbody></table>
        <div className="small" style={{ fontSize: 12 }}>* position from an older fix.</div></div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="rule-title"><div className="label">Sprints</div><div className="small" style={{ fontStyle: "italic" }}>unofficial · elapsed time between crossing two parallels, interpolated between fixes</div></div>
      <div className="stack" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>{names.map(n => { const rows = sprints.filter(s => s.sprint_name === n); return <div className="panel" key={n} style={{ display: "flex", flexDirection: "column", gap: 8 }}><div className="label" style={{ fontSize: 13 }}>{n} sprint</div><div className="small" style={{ fontSize: 12 }}>{rows.length} of {fleet.racing} through</div>{rows.slice(0, 5).map((s, i) => <div key={s.team_id} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--hair)" }}><span className="num" style={{ color: "var(--graphite)" }}>{i + 1}</span><span className="mont" style={{ fontSize: 13, fontWeight: 600 }}>{s.team.name}</span><span className="num">{hoursText(s.hours)}</span></div>)}</div>; })}</div></div>
  </Shell>;
}
