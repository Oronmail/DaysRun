// site/components/RecordsPage.tsx — the Records page body, shared by /records (whole race), /records/7d and /records/30d so that
// all three stay statically rendered; reading ?w= from searchParams would make the page render on every request.
import Shell from "@/components/Shell";
import Dateline from "@/components/Dateline";
import { latestFleet, boatStats, recordBoard } from "@/lib/db";
import { nm, kn, hhmm, dayMon, dayMonTime } from "@/lib/format";
import { WEATHER_BOARDS, weatherLine, type WeatherKind } from "@/lib/weatherRecords";
export type RecWin = "7d" | "30d" | "race";
export default async function RecordsPage({ win = "race" }: { win?: RecWin }) {
  const fleet = await latestFleet(); const [boats, recs] = await Promise.all([boatStats(fleet.as_of), recordBoard(fleet.as_of)]);
  const board = (kind: string, title: string, unit: string, fmt: (v: number) => string, valid: string) => {
    const rows = recs.filter(r => r.kind === kind && r.win === win);
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">{title}</div></div>
      <div style={{ display: "flex", gap: 6 }}>{(["7d", "30d", "race"] as const).map(w => <a key={w} href={w === "race" ? "/records" : `/records/${w}`} style={{ padding: "4px 10px", fontSize: 12, textDecoration: "none", ...(w === win ? { background: "var(--ink)", color: "var(--header-fg)" } : { border: "1px solid var(--rule)", color: "var(--graphite)" }) }}>{w === "race" ? "Race" : w === "7d" ? "7 days" : "30 days"}</a>)}</div>
      {rows.map((r, i) => <div key={r.rank} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", gap: 12, alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid var(--hair)" }}><span className="num" style={{ color: "var(--graphite)" }}>{r.rank}</span><div><div className="mont" style={{ fontSize: 14, fontWeight: 600 }}>{r.team.name}</div><div className="small" style={{ fontSize: 12 }}><i>{r.team.model}</i> · {kind === "best7" ? `to ${dayMon(r.at)}` : `ending ${dayMonTime(r.at)}`}</div></div><span className="num" style={{ fontSize: i === 0 ? 22 : 16 }}>{fmt(r.value)} {unit}</span></div>)}
      <div className="small" style={{ fontSize: 12 }}>{valid}</div></div>;
  };
  // The weather a boat met, according to the model: the worker ranks every boat (the table needs all), the board shows five.
  const gustOf = (teamId: number) => recs.find(r => r.kind === "gust" && r.win === win && r.team_id === teamId)?.value ?? null;
  const weatherBoard = ({ kind, title, valid }: { kind: WeatherKind; title: string; valid: string }) => {
    const rows = recs.filter(r => r.kind === kind && r.win === win).slice(0, 5);
    return <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">{title}</div></div>
      {rows.map((r, i) => { const l = weatherLine(kind, r.value, r.at, kind === "wind" ? gustOf(r.team_id) : null); return <div key={r.rank} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", gap: 12, alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid var(--hair)" }}><span className="num" style={{ color: "var(--graphite)" }}>{r.rank}</span><div><div className="mont" style={{ fontSize: 14, fontWeight: 600 }}>{r.team.name}</div><div className="small" style={{ fontSize: 12 }}>{l.detail && <>{l.detail} · </>}{l.when}</div></div><span className="num" style={{ fontSize: i === 0 ? 22 : 16 }}>{l.figure}</span></div>; })}
      {rows.length === 0 && <div className="small">Nothing in this window yet.</div>}
      <div className="small" style={{ fontSize: 12 }}>{valid}</div></div>;
  };
  const weatherOf = (teamId: number, kind: WeatherKind) => recs.find(r => r.kind === kind && r.win === "race" && r.team_id === teamId);
  const pbs = boats.filter(b => b.pb24 || b.fleet_best24).sort((a, b) => (b.run24_nm ?? 0) - (a.run24_nm ?? 0));
  const best = boats.reduce((a, b) => (b.best24_nm > a.best24_nm ? b : a), boats[0]);
  return <Shell active="Records" dateline={<Dateline asOf={fleet.as_of} raceDay={fleet.race_day} />} title="RECORDS" note={`${best.team.first_name}’s ${nm(best.best24_nm)} nm still leads`}>
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 32 }}>
      {board("best4", "Best 4-hour leg", "kt", v => kn(v), "Average speed on one 4-hour leg between two consecutive reports. Start day excluded; a leg spanning a missed report never counts.")}
      {board("best24", "Best 24-hour run", "nm", v => nm(v), "Six consecutive 4-hour legs, summed; none may be missing.")}
      {board("best7", "Best 7-day run", "nm", v => nm(v), "42 consecutive 4-hour legs at sea, none missing. Possible since race day 8; a boat that restarted needs seven days from its restart.")}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="rule-title"><div className="label">The weather they met · model values</div><div className="small" style={{ fontStyle: "italic" }}>what the forecast model puts at each boat’s report position, not what the skipper measured · the same window as above</div></div>
      <div className="stack" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 32 }}>{WEATHER_BOARDS.map(weatherBoard)}</div>
    </div>
    <div className="panel stack" style={{ borderLeft: "4px solid var(--gold)", display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 32 }}>
      <div><div className="label">The last 24 hours</div><div className="small">New marks set in the 24 hours to {hhmm(fleet.as_of)} UTC.</div></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>{pbs.map(b => <div key={b.team_id} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span className="mont" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: b.fleet_best24 ? "var(--gold-text)" : "var(--graphite)" }}>{b.fleet_best24 ? "FLEET BEST + PERSONAL BEST" : "PERSONAL BEST"}</span><span className="mont" style={{ fontSize: 15, fontWeight: 600 }}>{b.team.first_name}</span><span className="num" style={{ fontSize: 20 }}>{nm(b.run24_nm)} nm</span></div>)}{pbs.length === 0 && <span className="small">No new marks.</span>}</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Personal bests</div><div className="small" style={{ fontStyle: "italic" }}>all {fleet.racing}, alphabetical</div></div>
      <table className="data"><thead><tr><th>Skipper · design</th><th className="r">Best 4 h leg</th><th>Leg ending</th><th className="r">Best 24 h run</th><th>Window ending</th><th className="r">Best 7 d run</th><th className="r two">Strongest model wind</th><th className="r two">Highest waves</th><th className="r two">Longest calm</th></tr></thead>
        <tbody>{[...boats].sort((a, b) => a.team.name.split(" ").at(-1)!.localeCompare(b.team.name.split(" ").at(-1)!)).map(b => <tr key={b.team_id}><td><span className="mont" style={{ fontWeight: 600 }}>{b.team.name}</span> <i style={{ color: "var(--graphite)" }}>{b.team.model}</i></td><td className="num r">{kn(b.best4_kn)} kt</td><td className="num small" style={{ fontSize: 12 }}>{dayMonTime(b.best4_at)}</td><td className="num r">{nm(b.best24_nm)} nm</td><td className="num small" style={{ fontSize: 12 }}>{dayMonTime(b.best24_at)}</td><td className="num r">{b.best7_nm ? `${nm(b.best7_nm)} nm` : "—"}</td>{(["wind", "wave", "calm"] as WeatherKind[]).map(k => { const r = weatherOf(b.team_id, k); return <td key={k} className="num r" title={r ? weatherLine(k, r.value, r.at, null).when : undefined}>{r ? weatherLine(k, r.value, r.at, null).figure : "—"}</td>; })}</tr>)}</tbody></table></div>
  </Shell>;
}
