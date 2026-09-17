// site/components/RaceChart.tsx — the race so far, in two views YB does not draw: every boat's place day by day (the lap chart
// of motor racing) and every boat's gap to the leader. Server-rendered SVG; a line and its labels light up on hover, in CSS.
import type { BoatStat, DailyPlace } from "@/lib/db";
import { dayMon } from "@/lib/format";
type Pt = { t: number; v: number };
function spread(ys: { id: number; y: number }[], min = 11) {            // keep right-hand labels from overprinting
  const s = [...ys].sort((a, b) => a.y - b.y); for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < min) s[i].y = s[i - 1].y + min;
  return new Map(s.map(p => [p.id, p.y]));
}
function Chart({ title, note, series, names, leaderId, ymax, yticks, ylab, invert, width = 640, height = 400 }: { title: string; note: string; series: Map<number, Pt[]>; names: Map<number, string>; leaderId: number; ymax: number; yticks: number[]; ylab: (v: number) => string; invert?: boolean; width?: number; height?: number }) {
  const L = 44, R = 74, T = 10, B = 26, pw = width - L - R, ph = height - T - B;
  const ts = [...series.values()].flat().map(p => p.t), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const X = (t: number) => L + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * pw;
  const Y = (v: number) => T + (invert ? (v - 1) / Math.max(1, ymax - 1) : v / Math.max(1, ymax)) * ph;
  const days = [...new Set(ts.filter(t => new Date(t).getUTCHours() === 0))].sort((a, b) => a - b), every = Math.ceil(days.length / 10);
  const ends = spread([...series.entries()].map(([id, p]) => ({ id, y: Y(p[p.length - 1].v) })));
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">{title}</div><div className="small" style={{ fontStyle: "italic" }}>{note}</div></div>
    <div className="panel"><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} role="img" aria-label={title}>
      {yticks.map(v => <g key={v}><line x1={L} y1={Y(v)} x2={L + pw} y2={Y(v)} stroke="var(--hair)" /><text x={L - 8} y={Y(v) + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{ylab(v)}</text></g>)}
      {days.filter((_, i) => i % every === 0).map(t => <text key={t} x={X(t)} y={height - 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{dayMon(new Date(t).toISOString())}</text>)}
      {[...series.entries()].sort((a, b) => (a[0] === leaderId ? 1 : 0) - (b[0] === leaderId ? 1 : 0)).map(([id, p]) => { const lead = id === leaderId, last = p[p.length - 1];
        return <g key={id} className="race-boat"><path d={"M" + p.map(q => `${X(q.t).toFixed(1)},${Y(q.v).toFixed(1)}`).join(" L")} fill="none" stroke={lead ? "var(--gold)" : "var(--bar)"} strokeWidth={lead ? 2.5 : 1.4} strokeLinejoin="round" />
          <circle cx={X(last.t)} cy={Y(last.v)} r={lead ? 3.5 : 2.5} fill={lead ? "var(--gold)" : "var(--bar)"} />
          <text x={X(last.t) + 8} y={(ends.get(id) ?? Y(last.v)) + 3} fontFamily="var(--font-sans)" fontSize={10.5} fontWeight={lead ? 700 : 500} fill="var(--ink)">{names.get(id)}</text></g>; })}
    </svg></div></div>;
}
export default function RaceChart({ days, boats }: { days: DailyPlace[]; boats: BoatStat[] }) {
  const names = new Map(boats.map(b => [b.team_id, b.team.first_name ?? b.team.name]));
  const now = boats[0] ? new Date(boats[0].as_of).getTime() : 0;
  const place = new Map<number, Pt[]>(), gap = new Map<number, Pt[]>();
  for (const d of days) { if (!names.has(d.team_id)) continue; const t = new Date(d.as_of).getTime();
    place.set(d.team_id, [...(place.get(d.team_id) ?? []), { t, v: d.rank }]); gap.set(d.team_id, [...(gap.get(d.team_id) ?? []), { t, v: d.gap_nm }]); }
  for (const b of boats) { const p = place.get(b.team_id) ?? []; if (!p.length || p[p.length - 1].t < now) { place.set(b.team_id, [...p, { t: now, v: b.rank }]); gap.set(b.team_id, [...(gap.get(b.team_id) ?? []), { t: now, v: b.gap_nm }]); } }
  if ([...place.values()].every(p => p.length < 2)) return null;
  const n = boats.length, gmax = Math.ceil(Math.max(...[...gap.values()].flat().map(p => p.v), 100) / 100) * 100, leaderId = boats[0].team_id;
  return <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40 }}>
    <Chart title="Places, day by day" note="at 00:00 UTC each day · hover a line" series={place} names={names} leaderId={leaderId} ymax={n} invert yticks={[1, 4, 8, 12, n]} ylab={v => String(v)} />
    <Chart title="Gap to the leader" note="nautical miles behind, by distance to finish" series={gap} names={names} leaderId={leaderId} ymax={gmax} yticks={[0, gmax / 4, gmax / 2, 3 * gmax / 4, gmax]} ylab={v => (v === 0 ? "0" : `−${Math.round(v)}`)} />
  </div>;
}
