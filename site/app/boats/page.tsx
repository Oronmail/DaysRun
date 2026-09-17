// site/app/boats/page.tsx
import Shell from "@/components/Shell";
import Dateline from "@/components/Dateline";
import { latestFleet, boatStats, boatPerf } from "@/lib/db";
import { kn, nm } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
export const revalidate = 900;
export const metadata = pageMeta("/boats");
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
export default async function Page() {
  const fleet = await latestFleet(); const [boats, perf] = await Promise.all([boatStats(fleet.as_of), boatPerf(fleet.as_of)]);
  const P = new Map(perf.map(p => [p.team_id, p]));
  // A design's figure is the legs-weighted mean over its boats, so a boat with three upwind legs does not count like one with thirty.
  const band = (bs: typeof boats, k: "upwind" | "reaching" | "running") => { let n = 0, v = 0; for (const b of bs) { const z = P.get(b.team_id)?.pos_json[k]; if (z) { n += z.legs; v += z.speed_kn * z.legs; } } return n >= 5 ? `${kn(v / n)} kt` : "—"; };
  const wind = (bs: typeof boats) => { const r = bs.map(b => P.get(b.team_id)?.wind_ratio).filter((x): x is number => x != null); return r.length ? `${Math.round(median(r) * 100)}%` : "—"; };
  const groups = new Map<string, typeof boats>(); for (const b of boats) groups.set(b.team.design_class ?? "Not listed", [...(groups.get(b.team.design_class ?? "Not listed") ?? []), b]);
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const W = 800, L = 190, pw = W - L - 40, lo = 3, hi = 6.5, X = (v: number) => L + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * pw;
  let y = 10; const rows: React.ReactNode[] = [];
  for (const [g, bs] of ordered) { const rh = bs.length > 1 ? 40 : 26; const cy = y + rh / 2;
    rows.push(<g key={g}><line x1={L} y1={cy} x2={L + pw} y2={cy} stroke="var(--hair)" /><text x={0} y={cy + 4} fontFamily="var(--font-sans)" fontWeight={700} fontSize={12} letterSpacing={1} fill="var(--ink)">{g.toUpperCase()}</text>
      {bs.sort((a, b) => (a.spd7 ?? 0) - (b.spd7 ?? 0)).map((b, i) => <g key={b.team_id}><circle cx={X(b.spd7 ?? 0)} cy={cy} r={6} fill={b.rank === 1 ? "var(--gold)" : "var(--series-1)"} stroke="var(--panel)" strokeWidth={2} /><text x={X(b.spd7 ?? 0)} y={i % 2 ? cy + 19 : cy - 11} textAnchor="middle" fontFamily="var(--font-sans)" fontWeight={600} fontSize={11} fill="var(--ink)">{b.team.first_name}</text></g>)}</g>);
    y += rh + 14; }
  const multi = ordered.filter(([, bs]) => bs.length > 1);
  return <Shell active="Boats" dateline={<Dateline asOf={fleet.as_of} raceDay={fleet.race_day} />} title="BOATS" note={multi.map(([g, bs]) => `${bs.length} ${g}s`).join(", ")}>
    <div style={{ maxWidth: 860, fontSize: 19, lineHeight: 1.5 }}>Which design is quickest? {multi.map(([g, bs]) => `${bs.length} ${g}s`).join(", ")} make the like-for-like comparison of this race. Everything else is one of a kind.</div>
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "840px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Average speed, last 7 days</div><div className="small" style={{ fontStyle: "italic" }}>all 4-hour legs, by design · gold = the leader</div></div>
        <div className="panel"><svg width={W} height={y + 14} viewBox={`0 0 ${W} ${y + 14}`} style={{ display: "block" }}>{[3, 4, 5, 6].map(v => <g key={v}><line x1={X(v)} y1={0} x2={X(v)} y2={y - 6} stroke="var(--hair)" /><text x={X(v)} y={y + 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="var(--graphite)">{v} kt</text></g>)}{rows}</svg></div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="rule-title"><div className="label">Read with care</div></div>
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>Boats a few hundred miles apart sail different winds; a week’s average smooths some of that out, not all of it.</div>
        {boats.filter(b => b.restart_at).map(b => <div key={b.team_id} style={{ fontSize: 15, lineHeight: 1.55 }}>{b.team.first_name}’s {b.team.design_class} restarted after repairs; its figures count only from the restart, so they cover fewer days than the rest.</div>)}
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>The comparison gets fairer over weeks. By the Southern Ocean each design will have a months-long record.</div></div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">By design</div><div className="small" style={{ fontStyle: "italic" }}>speed for the wind and point of sail: model wind, since the start · see <a href="/performance">Performance</a></div></div>
      <table className="data"><thead><tr><th>Design</th><th className="r">Boats</th><th className="r">Best place</th><th className="r">Median speed, 7 d</th><th className="r">Speed for the wind</th><th className="r">Upwind</th><th className="r">Reaching</th><th className="r">Running</th><th className="r">Best 24 h</th></tr></thead>
        <tbody>{[...multi, ["Whole fleet", boats] as [string, typeof boats]].map(([g, bs]) => { const best = bs.reduce((a, b) => (b.best24_nm > a.best24_nm ? b : a), bs[0]); return <tr key={g}><td><span className="mont" style={{ fontWeight: 600 }}>{g}</span></td><td className="num r">{bs.length}</td><td className="num r">{Math.min(...bs.map(b => b.rank))}</td><td className="num r">{kn(median(bs.map(b => b.spd7 ?? 0)))} kt</td><td className="num r">{wind(bs)}</td><td className="num r">{band(bs, "upwind")}</td><td className="num r">{band(bs, "reaching")}</td><td className="num r">{band(bs, "running")}</td><td className="num r">{nm(best.best24_nm)} nm · {best.team.first_name}</td></tr>; })}</tbody></table></div>
  </Shell>;
}
