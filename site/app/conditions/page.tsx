// site/app/conditions/page.tsx
import Shell from "@/components/Shell";
import Dateline from "@/components/Dateline";
import Tiles from "@/components/Tiles";
import { Who } from "@/components/Who";
import { latestFleet, boatStats, conditionsAt } from "@/lib/db";
import { beaufort } from "@/lib/text";
import { hhmm } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import Tips from "@/components/Tips";
import { conditionsTip } from "@/lib/tips";
export const revalidate = 900;
export const metadata = pageMeta("/conditions");
const Arrow = ({ deg }: { deg: number }) => <svg width="16" height="16" viewBox="0 0 16 16" style={{ verticalAlign: "middle" }}><g transform={`rotate(${deg % 360} 8 8)`}><path d="M8 2 L8 14 M8 14 L4.5 10 M8 14 L11.5 10" stroke="var(--ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" /></g></svg>;
const older = (b: { last_fix_at: string }, c: { model_at: string }) => new Date(c.model_at).getTime() < new Date(b.last_fix_at).getTime();
export default async function Page() {
  const fleet = await latestFleet(); const boats = await boatStats(fleet.as_of); const cond = await conditionsAt(boats);
  const rows = boats.map(b => ({ b, c: cond.find(r => r.team_id === b.team_id && r.fix_at === b.last_fix_at) })).filter(r => r.c);
  const by = (f: (c: NonNullable<typeof rows[0]["c"]>) => number, max = true) => rows.reduce((a, r) => (max ? f(r.c!) > f(a.c!) : f(r.c!) < f(a.c!)) ? r : a, rows[0]);
  const strongest = by(c => c.wind_kn), lightest = by(c => c.wind_kn, false), sea = by(c => c.wave_m), gale = rows.filter(r => r.c!.wind_kn >= 34);
  const W = 820, L = 90, pw = W - L - 60, X = (v: number) => L + Math.min(v, 40) / 40 * pw, H = 16 * 24;
  return <Shell active="Conditions" dateline={<Dateline asOf={fleet.as_of} raceDay={fleet.race_day} tail=" · MODEL VALUES" />} title="CONDITIONS" note={strongest ? `${strongest.b.team.first_name} in ${Math.round(strongest.c!.wind_kn)} kt` : undefined}>
    {rows.length > 0 && <Tiles items={[
      { k: "Strongest wind", v: `${Math.round(strongest.c!.wind_kn)} kt`, s: `${strongest.b.team.first_name} · gusts ${Math.round(strongest.c!.gust_kn)} kt` },
      { k: "Lightest wind", v: `${Math.round(lightest.c!.wind_kn)} kt`, s: `${lightest.b.team.first_name}` },
      { k: "Highest waves", v: `${sea.c!.wave_m.toFixed(1)} m`, s: `${sea.b.team.first_name} · significant height · ${Math.round(sea.c!.swell_period_s)}-second swell` },
      { k: "In gale-force wind now", v: gale.length ? `${gale.length}` : "None", s: gale.length ? gale.map(r => r.b.team.first_name).join(", ") : "no boat at 34 kt or more at this report" }]} />}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "860px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Wind at each boat</div><div className="small" style={{ fontStyle: "italic" }}>mean / gust, in race order</div></div>
        <div className="panel"><Tips width={W} height={H + 30} targets={rows.map(({ b, c }, i) => ({ x: 0, y: 8 + 2 + i * 24, w: W, h: 24, row: true, tip: conditionsTip(b.team.first_name ?? b.team.name, c!, `force ${beaufort(c!.wind_kn)}`) }))}><svg width={W} height={H + 30} viewBox={`0 -8 ${W} ${H + 30}`} style={{ display: "block" }}>
          {[0, 10, 20, 30, 40].map(v => <g key={v}><line x1={X(v)} y1={0} x2={X(v)} y2={H} stroke="var(--hair)" /><text x={X(v)} y={H + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="var(--graphite)">{v} kt</text></g>)}
          <line x1={X(34)} y1={-4} x2={X(34)} y2={H} stroke="var(--loss)" strokeDasharray="4 3" /><text x={X(34) + 4} y={8} fontFamily="var(--font-mono)" fontSize={10} fill="var(--loss)">gale 34 kt</text>
          {rows.map(({ b, c }, i) => { const y = 6 + i * 24; return <g key={b.team_id}><text x={L - 10} y={y + 10} textAnchor="end" fontFamily="var(--font-sans)" fontWeight={600} fontSize={12} fill="var(--ink)">{b.team.first_name}</text><rect x={L} y={y + 2} width={X(c!.wind_kn) - L} height={12} rx={3} fill="var(--series-1)" /><line x1={X(c!.wind_kn)} y1={y + 8} x2={X(c!.gust_kn)} y2={y + 8} stroke="var(--series-1)" strokeWidth={1.5} /><circle cx={X(c!.gust_kn)} cy={y + 8} r={3} fill="var(--panel)" stroke="var(--series-1)" strokeWidth={1.5} /><text x={X(c!.gust_kn) + 8} y={y + 12} fontFamily="var(--font-mono)" fontSize={10} fill="var(--ink)">{Math.round(c!.wind_kn)}/{Math.round(c!.gust_kn)}</text></g>; })}
        </svg></Tips></div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="rule-title"><div className="label">About these numbers</div></div>
        <div className="small" style={{ fontSize: 14, lineHeight: 1.55 }}>Model values at each boat’s report time from Open-Meteo, not measured on board. Wind is the mean at 10 m with the direction it blows from; arrows point downwind. Waves are significant height, sea and swell combined. Current is given with the direction it sets toward. A gale day or light-wind day is counted when every report that day is at 34 kt or more, or under 6 kt.</div></div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Every boat</div></div>
      <table className="data"><thead><tr><th>Skipper</th><th>Wind from</th><th className="r">Mean kt</th><th className="r">Gust kt</th><th className="r">Force</th><th className="r">Waves m</th><th className="r">Swell</th><th className="r">Current sets</th><th className="r">Sea temp °C</th><th className="r">hPa</th></tr></thead>
        <tbody>{rows.map(({ b, c }) => <tr key={b.team_id}><td><Who b={b} sub={false} />{b.stale && <span className="small loss" style={{ fontSize: 11 }}>at the {hhmm(b.last_fix_at)} position</span>}{older(b, c!) && <span className="small" style={{ fontSize: 11 }}>† model values for the {hhmm(c!.model_at)} report</span>}</td><td className="num"><Arrow deg={c!.wind_dir_deg} /> {String(Math.round(c!.wind_dir_deg)).padStart(3, "0")}°</td><td className="num r">{Math.round(c!.wind_kn)}</td><td className="num r">{Math.round(c!.gust_kn)}</td><td className="num r">F{beaufort(Math.round(c!.wind_kn))}</td><td className="num r">{c!.wave_m.toFixed(1)}</td><td className="num r">{c!.swell_m.toFixed(1)} m · {Math.round(c!.swell_period_s)} s</td><td className="num r">{c!.current_kn.toFixed(1)} kt toward {String(Math.round(c!.current_dir_deg)).padStart(3, "0")}°</td><td className="num r">{c!.sst_c.toFixed(1)}</td><td className="num r">{Math.round(c!.mslp_hpa)}</td></tr>)}</tbody></table></div>
  </Shell>;
}
