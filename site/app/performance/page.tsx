// site/app/performance/page.tsx — how each boat sails, not where she is: the numbers YB's leaderboard does not give
import Shell from "@/components/Shell";
import Dateline from "@/components/Dateline";
import Tiles from "@/components/Tiles";
import { Who } from "@/components/Who";
import { latestFleet, boatStats, boatPerf, type BoatPerf, type BoatStat } from "@/lib/db";
import { kn, nm, sgn } from "@/lib/format";
import { extraMiles } from "@/lib/perf";
import { pageMeta } from "@/lib/seo";
import Tips from "@/components/Tips";
import { windTip } from "@/lib/tips";
export const revalidate = 900;
export const metadata = pageMeta("/performance");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const BANDS = ["upwind", "reaching", "running"] as const;
export default async function Page() {
  const fleet = await latestFleet(); const [boats, perf] = await Promise.all([boatStats(fleet.as_of), boatPerf(fleet.as_of)]);
  const P = new Map(perf.map(p => [p.team_id, p]));
  const rows = boats.map(b => ({ b, p: P.get(b.team_id) })).filter((r): r is { b: BoatStat; p: BoatPerf } => !!r.p);
  const rated = rows.filter(r => r.p.wind_ratio != null).sort((a, c) => c.p.wind_ratio! - a.p.wind_ratio!);
  const top = rated[0], steady = [...rows].filter(r => r.p.share5_7 != null).sort((a, c) => c.p.share5_7! - a.p.share5_7!)[0];
  const parked = [...rows].filter(r => (r.p.parked_h7 ?? 0) > 0).sort((a, c) => c.p.parked_h7! - a.p.parked_h7!)[0];
  const upwind = [...rows].filter(r => (r.p.pos_json.upwind?.legs ?? 0) >= 3)   /* the same three-leg minimum as the table below */.sort((a, c) => c.p.pos_json.upwind!.speed_kn - a.p.pos_json.upwind!.speed_kn)[0];
  const sortedRatios = rated.map(r => r.p.wind_ratio!).sort((x, y) => x - y), medianRatio = sortedRatios.length ? (sortedRatios.length % 2 ? sortedRatios[(sortedRatios.length - 1) / 2] : (sortedRatios[sortedRatios.length / 2 - 1] + sortedRatios[sortedRatios.length / 2]) / 2) : null;
  const W = 760, L = 96, pw = W - L - 70, max = Math.max(0.5, ...rated.map(r => r.p.wind_ratio!)), X = (v: number) => L + v / max * pw;
  return <Shell active="Performance" dateline={<Dateline asOf={fleet.as_of} raceDay={fleet.race_day} />} title="PERFORMANCE" note={top ? `${top.b.team.first_name} gets the most from the wind` : undefined}>
    <div style={{ fontSize: 19, lineHeight: 1.5, maxWidth: 900 }}>The tracker says where each boat is. This page asks how she is being sailed: how much speed she makes from the wind she has, on which point of sail she wins or loses, how steady she is, and what the dark costs her.</div>
    {rows.length > 0 && <Tiles items={[
      { k: "Most speed for the wind", v: top ? `${pct(top.p.wind_ratio)}` : "—", s: top ? `${top.b.team.first_name} · boat speed as a share of wind speed` : "not enough legs yet" },
      { k: "Fastest upwind", v: upwind ? `${kn(upwind.p.pos_json.upwind!.speed_kn)} kt` : "—", s: upwind ? `${upwind.b.team.first_name} · average on ${upwind.p.pos_json.upwind!.legs} upwind legs` : "not enough upwind legs yet" },
      { k: "Steadiest, last 7 days", v: steady ? pct(steady.p.share5_7) : "—", s: steady ? `${steady.b.team.first_name} · share of 4-hour legs at 5 kt or more` : "" },
      { k: "Most hours parked, 7 days", v: parked ? `${parked.p.parked_h7} h` : "None", s: parked ? `${parked.b.team.first_name} · legs under 2 kt` : "no boat under 2 kt this week" }]} />}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "800px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Speed for the wind</div><div className="small" style={{ fontStyle: "italic" }}>boat speed ÷ model wind speed, legs sailed in 8–25 kt, since the start</div></div>
        <div className="panel"><Tips width={W} height={rated.length * 24 + 26} targets={rated.map(({ b, p }, i) => ({ x: 0, y: i * 24, w: W, h: 24, row: true, tip: windTip(b.team.first_name ?? b.team.name, p.wind_ratio!, p.wind_legs, medianRatio) }))}><svg width={W} height={rated.length * 24 + 26} viewBox={`0 0 ${W} ${rated.length * 24 + 26}`} style={{ display: "block" }} role="img" aria-label="Boat speed as a share of wind speed, by skipper">
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5].filter(v => v <= max + 0.05).map(v => <g key={v}><line x1={X(v)} y1={0} x2={X(v)} y2={rated.length * 24} stroke="var(--hair)" /><text x={X(v)} y={rated.length * 24 + 16} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="var(--graphite)">{Math.round(v * 100)}%</text></g>)}
          {rated.map(({ b, p }, i) => <g key={b.team_id}><text x={L - 10} y={i * 24 + 15} textAnchor="end" fontFamily="var(--font-sans)" fontWeight={600} fontSize={12} fill="var(--ink)">{b.team.first_name}</text><rect x={L} y={i * 24 + 5} width={X(p.wind_ratio!) - L} height={13} rx={3} fill={b.rank === 1 ? "var(--gold)" : "var(--series-1)"} /><text x={X(p.wind_ratio!) + 6} y={i * 24 + 15} fontFamily="var(--font-mono)" fontSize={11} fill="var(--ink)">{pct(p.wind_ratio)} <tspan fill="var(--graphite)" fontSize={9}>{p.wind_legs} legs</tspan></text></g>)}
        </svg></Tips></div>
        {rows.filter(r => r.p.wind_ratio == null).length > 0 && <div className="small" style={{ fontSize: 12 }}>Not rated yet (fewer than ten legs in 8–25 kt): {rows.filter(r => r.p.wind_ratio == null).map(r => r.b.team.first_name).join(", ")}.</div>}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="rule-title"><div className="label">Read with care</div></div>
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>The wind is Open-Meteo’s model wind at each report position, not measured on board. A boat in a local calm or squall the model misses will look slow or fast for her wind.</div>
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>Direction is the course made good over a 4-hour leg, not the heading, so “upwind” means the boat made ground within 60° of where the wind came from. It separates upwind work from running well; it cannot see a gybe angle.</div>
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>Heavier, longer-keeled designs are slower for the same wind. Compare like with like on the <a href="/boats">Boats</a> page. Everything counts from a boat’s restart, and the start day is left out.</div></div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Point of sail</div><div className="small" style={{ fontStyle: "italic" }}>share of 4-hour legs and average speed on each · upwind under 60° to the wind, running over 130°</div></div>
      <table className="data"><thead><tr><th>Skipper</th>{BANDS.map(k => <th key={k} className="r" colSpan={2}>{k}</th>)}<th className="r">Legs</th></tr></thead>
        <tbody>{rows.map(({ b, p }) => <tr key={b.team_id}><td><Who b={b} sub={false} /></td>{BANDS.map(k => { const z = p.pos_json[k]; return [<td key={k + "s"} className="num r" style={{ color: "var(--graphite)" }}>{z ? pct(z.share) : "—"}</td>, <td key={k + "v"} className="num r">{z && z.legs >= 3 ? `${kn(z.speed_kn)} kt` : "—"}</td>]; })}<td className="num r" style={{ color: "var(--graphite)" }}>{BANDS.reduce((n, k) => n + (p.pos_json[k]?.legs ?? 0), 0)}</td></tr>)}</tbody></table>
      <div className="small" style={{ fontSize: 12 }}>A speed is shown from three legs on a point of sail. Early in the race the samples are small.</div></div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Steadiness, the dark, and the long road</div><div className="small" style={{ fontStyle: "italic" }}>4-hour legs · last 7 days unless stated</div></div>
      <table className="data"><thead><tr><th>Skipper</th><th className="r">Spread ± kt</th><th className="r">Legs at 5 kt or more</th><th className="r">Hours under 2 kt</th><th className="r">Night − day kt</th><th className="r">Sailed nm</th><th className="r">Made good nm</th><th className="r">Extra</th></tr></thead>
        <tbody>{rows.map(({ b, p }) => <tr key={b.team_id}><td><Who b={b} sub={false} /></td><td className="num r">{p.sd7 == null ? "—" : `±${kn(p.sd7)}`}</td><td className="num r">{pct(p.share5_7)}</td><td className={`num r ${(p.parked_h7 ?? 0) >= 8 ? "loss" : ""}`}>{p.parked_h7 == null ? "—" : p.parked_h7}</td>
          <td className="num r" title={`${p.n_night} night legs, ${p.n_day} day legs since the start`}>{sgn(p.night_delta)}</td><td className="num r">{nm(b.sailed_nm)}</td><td className="num r">{nm(b.made_good_nm)}</td><td className="num r" title={b.restart_at ? "Not comparable after a restart: miles sailed count from the restart, miles made good from the start" : undefined}>{extraMiles(b) == null ? "—" : `${sgn(extraMiles(b)! * 100, 0)}%`}</td></tr>)}</tbody></table>
      <div className="small" style={{ fontSize: 12 }}>Night − day: average leg speed between 20:00 and 06:00 local solar time minus the rest, since the start; it needs six legs of each. Extra: miles sailed along the track over miles made good toward the finish, since the start; blank for a boat that restarted, whose two figures count from different moments.</div></div>
  </Shell>;
}
