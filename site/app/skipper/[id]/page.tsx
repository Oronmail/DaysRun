// site/app/skipper/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import Tiles from "@/components/Tiles";
import SpeedLog from "@/components/SpeedLog";
import FleetMap, { type Marker } from "@/components/FleetMap";
import { VBars, LineChart } from "@/components/Charts";
import { latestFleet, boatStats, raceSetup, trackFor, boatHistory, splitsFor, conditionsAt, teams } from "@/lib/db";
import { fleetView } from "@/lib/geo";
import { nm, kn, sgn, hhmm, dayMon, dayMonTime } from "@/lib/format";
export const revalidate = 900;
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
export async function generateStaticParams() { return (await teams()).filter(t => !t.is_ghost).map(t => ({ id: String(t.id) })); }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const fleet = await latestFleet(); const boats = await boatStats(fleet.as_of);
  const b = boats.find(x => x.team_id === id); if (!b) notFound();
  const [setup, track, hist, splits, cond] = await Promise.all([raceSetup(), trackFor(id), boatHistory(id), splitsFor(id), conditionsAt([b])]);
  const c = cond.find(r => r.team_id === id);
  const daily = hist.filter(h => h.as_of.endsWith("T00:00:00+00:00")).slice(-10);
  const view = fleetView(boats, 506);
  const markers: Marker[] = boats.map(x => ({ lat: x.lat, lon: x.lon, kind: x.team_id === id ? "hi" : "dim", label: x.team_id === id ? x.team.first_name ?? undefined : undefined }));
  const lead = boats[0];
  return <Shell active="Skippers" dateline={`SKIPPERS · ${b.team.country_code} · SAIL ${b.team.sail}`} title={b.team.name.toUpperCase()} sub={<><i>{b.team.yacht}</i> · {b.team.model} · {ord(b.rank)} of {fleet.racing} at race day {fleet.race_day}</>} note={`${sgn(b.vs_kirsten_days)} days on Neuschäfer’s 2022 pace`}>
    <Tiles items={[
      { k: "Place", v: ord(b.rank), s: `${b.rank_change === 0 ? "no change" : (b.rank_change > 0 ? `up ${b.rank_change}` : `down ${-b.rank_change}`)} in 24 h · ${b.rank === 1 ? (boats[1] ? `${nm(boats[1].gap_nm)} nm ahead of ${boats[1].team.first_name}` : "leading") : `${nm(b.gap_nm)} nm behind ${lead.team.first_name}`}` },
      { k: "To go", v: `${nm(b.dtf_nm)} nm`, s: `${nm(b.made_good_nm)} nm made good since the start` },
      { k: "24-hour run", v: `${nm(b.run24_nm)} nm`, s: `personal best ${nm(b.best24_nm)} nm, window ending ${dayMonTime(b.best24_at)}` },
      { k: "Best 4-hour leg", v: `${kn(b.best4_kn)} kt`, s: `average speed, leg ending ${dayMonTime(b.best4_at)} UTC` }]} />
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "520px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Track since the start</div><div className="small" style={{ fontStyle: "italic" }}>fleet in grey · ghosts dashed</div></div>
        <div style={{ border: "1px solid var(--ink)", padding: 6, background: "var(--panel)" }}><FleetMap view={view} course={setup.raw_setup.course.nodes} markers={markers} track={track} /></div>
        <div className="small">Position at {hhmm(b.last_fix_at)} UTC: <span className="num">{b.position_text}</span> · sailed about {nm(b.sailed_nm)} nm along the track, measured on 4-hour legs</div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Speed, last 7 days</div><div className="small" style={{ fontStyle: "italic" }}>average on each 4-hour leg, 0–8 kt</div></div><div className="panel"><SpeedLog log={b.speed_log_json} endAt={b.last_fix_at} /></div><div className="small" style={{ fontSize: 12 }}>Knots on each bar. Gold = latest leg. – = missed report. Days are UTC.</div></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Daily runs</div><div className="small" style={{ fontStyle: "italic" }}>nm in each UTC day</div></div><div className="panel"><VBars vals={daily.map(d => d.run24_nm)} labels={daily.map(d => dayMon(new Date(new Date(d.as_of).getTime() - 86400000).toISOString()))} max={180} hi={daily.length - 1} /></div><div className="small" style={{ fontSize: 12 }}>Each bar is one UTC day, 0000 to 0000. – = not enough reports that day to measure a full 24 hours.</div></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Place in the fleet</div><div className="small" style={{ fontStyle: "italic" }}>at 0000 UTC each day</div></div><div className="panel"><LineChart series={[{ name: "rank", color: "var(--series-1)", vals: daily.map(d => -d.rank) }]} xs={daily.map((_, i) => i)} ymin={-16} ymax={-1} yticks={[-1, -4, -8, -12, -16]} ylab={v => String(Math.round(-v))} xlab={i => dayMon(daily[i].as_of)} height={170} /></div></div>
      </div>
    </div>
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Conditions at {hhmm(b.last_fix_at)} UTC</div></div>
        {c ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{([["Wind (mean)", `${Math.round(c.wind_kn)} kt from ${String(Math.round(c.wind_dir_deg)).padStart(3, "0")}°`], ["Gusts", `${Math.round(c.gust_kn)} kt`], ["Waves (significant)", `${c.wave_m.toFixed(1)} m`], ["Current sets", `${c.current_kn.toFixed(1)} kt toward ${String(Math.round(c.current_dir_deg)).padStart(3, "0")}°`], ["Sea temp", `${c.sst_c.toFixed(1)} °C`], ["Pressure", `${Math.round(c.mslp_hpa)} hPa`]] as [string, string][]).map(([k, v]) => <div key={k}><div className="small" style={{ fontSize: 12 }}>{k}</div><span className="num" style={{ fontSize: 18 }}>{v}</span></div>)}</div> : <div className="small">No model data for this fix yet.</div>}
        <div className="small" style={{ fontSize: 12 }}>Model values from Open-Meteo, not measured on board.</div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Against the ghosts</div></div>
        {([["Van Den Heede, 2018", b.vs_vdh_days, b.vs_vdh_nm], ["Neuschäfer, 2022", b.vs_kirsten_days, b.vs_kirsten_nm]] as [string, number | null, number | null][]).map(([n, d]) => <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15 }}>{n}</span><span className={`num ${(d ?? 0) > 0 ? "gain" : "loss"}`} style={{ fontSize: 18 }}>{sgn(d)} d</span></div>)}
        <div className="small" style={{ fontSize: 12 }}>{Math.abs(b.vs_vdh_nm ?? 0)} nm {(b.vs_vdh_nm ?? 0) > 0 ? "ahead" : "behind"} and {Math.abs(b.vs_kirsten_nm ?? 0)} nm {(b.vs_kirsten_nm ?? 0) > 0 ? "ahead" : "behind"} on the same race day.</div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Splits</div></div>
        {splits.map((s: { checkpoint_id: number; checkpoint_index: number; stop_at: string; duration_s: number; delta_best_s: number }) => <div key={s.checkpoint_id} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 15 }}>YB checkpoint {s.checkpoint_index}</span><span className="num">{Math.floor(s.duration_s / 86400)} d {Math.floor(s.duration_s % 86400 / 3600)} h {Math.floor(s.duration_s % 3600 / 60)} m</span></div>)}
        {splits.length === 0 && <div className="small">No checkpoint passed yet.</div>}</div>
    </div>
    <div className="mont" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 13, fontWeight: 600, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
      <span>{boats[b.rank - 2] ? <Link href={`/skipper/${boats[b.rank - 2].team_id}`}>← {ord(b.rank - 1)} · {boats[b.rank - 2].team.name}</Link> : null}</span>
      <Link href="/skippers">All skippers</Link>
      <span>{boats[b.rank] ? <Link href={`/skipper/${boats[b.rank].team_id}`}>{ord(b.rank + 1)} · {boats[b.rank].team.name} →</Link> : null}</span>
    </div>
  </Shell>;
}
