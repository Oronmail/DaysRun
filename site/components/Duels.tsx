// site/components/Duels.tsx — the private races inside the fleet: neighbours in the ranking within 15 nm of each other, with the
// three-day history of their gap. Server-rendered; the numbers come from worker/ggrstats/duels.py.
import Link from "next/link";
import type { BoatStat, Duel } from "@/lib/db";
import { duelStory } from "@/lib/duels";
import { dayMon } from "@/lib/format";
import Tips from "./Tips";
import { duelTip } from "@/lib/tips";
function Spark({ series, a, b, width = 280, height = 78 }: { series: [number, number][]; a: string; b: string; width?: number; height?: number }) {
  if (series.length < 2) return null;
  const L = 6, R = 34, T = 8, B = 16, pw = width - L - R, ph = height - T - B;
  const t0 = series[0][0], t1 = series[series.length - 1][0], m = Math.max(5, ...series.map(p => Math.abs(p[1])));
  const X = (t: number) => L + (t1 === t0 ? 1 : (t - t0) / (t1 - t0)) * pw, Y = (g: number) => T + (1 - (g + m) / (2 * m)) * ph;
  const last = series[series.length - 1], step = pw / (series.length - 1);
  const targets = series.map(p => ({ x: X(p[0]) - step / 2, y: T, w: step, h: ph, dot: { x: X(p[0]), y: Y(p[1]) }, tip: duelTip(p[1], a, b, p[0]) }));
  return <Tips width={width} height={height} targets={targets}><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} role="img" aria-label="The gap between the two boats at each report of the last three days">
    <line x1={L} y1={Y(0)} x2={L + pw} y2={Y(0)} stroke="var(--graphite)" strokeDasharray="3 3" /><text x={L + pw + 4} y={Y(0) + 3} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">level</text>
    <path d={"M" + series.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" L")} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
    <circle cx={X(last[0])} cy={Y(last[1])} r={3.5} fill="var(--gold)" stroke="var(--panel)" strokeWidth={1.5} />
    <text x={L} y={height - 4} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{dayMon(new Date(t0 * 1000).toISOString())}</text>
    <text x={L + pw} y={height - 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{dayMon(new Date(t1 * 1000).toISOString())}</text>
  </svg></Tips>;
}
export default function Duels({ duels, boats }: { duels: Duel[]; boats: BoatStat[] }) {
  const by = new Map(boats.map(b => [b.team_id, b]));
  const rows = duels.map(d => ({ d, a: by.get(d.ahead_id), b: by.get(d.behind_id) })).filter(r => r.a && r.b).sort((x, y) => x.a!.rank - y.a!.rank);
  if (!rows.length) return null;
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="rule-title"><div className="label">Duels</div><div className="small" style={{ fontStyle: "italic" }}>neighbours in the ranking within 15 nm · the line is the gap over three days, above “level” when today’s leader of the pair was ahead</div></div>
    <div className="cards" style={{ gridTemplateColumns: undefined }}>{rows.map(({ d, a, b }) => { const A = a!.team.first_name ?? a!.team.name, B = b!.team.first_name ?? b!.team.name;
      return <div key={`${d.ahead_id}-${d.behind_id}`} className="panel" style={{ borderTop: "2px solid var(--gold)", display: "flex", flexDirection: "column", gap: 6, padding: "16px 18px" }}>
        <div className="mont" style={{ fontSize: 14, fontWeight: 600 }}><span className="num" style={{ fontWeight: 500, color: "var(--graphite)" }}>{a!.rank}</span> <Link className="who-link" href={`/skipper/${d.ahead_id}`}>{A}</Link> <span style={{ fontWeight: 500, color: "var(--graphite)" }}>ahead of</span> <span className="num" style={{ fontWeight: 500, color: "var(--graphite)" }}>{b!.rank}</span> <Link className="who-link" href={`/skipper/${d.behind_id}`}>{B}</Link></div>
        <div className="mont" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>{d.gap_nm < 1 ? "under 1" : Math.round(d.gap_nm)} nm</div>
        <Spark series={d.series_json ?? []} a={A} b={B} />
        <div style={{ fontSize: 14, lineHeight: 1.45 }}>{duelStory(d, A, B)}</div>
        <div className="small" style={{ fontSize: 12 }}>{d.water_nm == null ? "" : `${Math.round(d.water_nm)} nm apart on the water${d.side ? `, ${B} to the ${d.side}` : ""}.`}{d.water_nm != null && d.water_nm >= 40 ? " A split, not a match race: one of the two will be proved right." : ""}</div>
      </div>; })}</div>
  </div>;
}
