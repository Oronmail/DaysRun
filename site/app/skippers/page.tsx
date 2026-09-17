// site/app/skippers/page.tsx — the way in to the sixteen skipper pages: one card per boat, in race order
import Link from "next/link";
import Shell from "@/components/Shell";
import SpeedBars from "@/components/SpeedBars";
import { Tri } from "@/components/Who";
import { latestFleet, boatStats } from "@/lib/db";
import { dateline, nm, sgn } from "@/lib/format";
export const revalidate = 900;
export default async function Page() {
  const fleet = await latestFleet(); const boats = await boatStats(fleet.as_of);
  return <Shell active="Skippers" dateline={dateline(fleet.as_of, fleet.race_day)} title="SKIPPERS" note="one page per boat: track, speed, runs, ghosts">
    <div style={{ fontSize: 19, lineHeight: 1.5, maxWidth: 860 }}>Sixteen skippers, sixteen boats. Each page follows one of them: the track since the start, average speed on every 4-hour leg of the last week, daily runs, place in the fleet day by day, the conditions at the boat, and the gap to the ghosts.</div>
    <div className="cards">{boats.map(b => <Link key={b.team_id} href={`/skipper/${b.team_id}`} className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}><span className="num" style={{ fontSize: 22, fontWeight: 500 }}>{b.rank}</span><span className="num" style={{ fontSize: 12 }}><Tri n={b.rank_change} /></span></div>
      <div className="mont" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{b.team.name} <span style={{ fontWeight: 500, color: "var(--graphite)", fontSize: 11 }}>{b.team.country_code}</span></div>
      <div style={{ fontSize: 13, color: "var(--graphite)" }}><i>{b.team.yacht}</i> · {b.team.model}</div>
      <div style={{ margin: "4px 0" }}><SpeedBars log={b.speed_log_json} width={210} height={22} /></div>
      <div className="num" style={{ fontSize: 13 }}>{nm(b.dtf_nm)} nm to go</div>
      <div className="num small" style={{ fontSize: 12 }}>{nm(b.run24_nm)} nm / 24 h · <span className={(b.vs_vdh_days ?? 0) > 0 ? "gain" : "loss"}>{sgn(b.vs_vdh_days)} d VDH</span></div>
      {b.stale && <div className="mont loss" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6 }}>MISSED THE LATEST REPORT</div>}
    </Link>)}</div>
  </Shell>;
}
