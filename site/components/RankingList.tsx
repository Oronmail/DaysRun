// site/components/RankingList.tsx — the phone ranking from the approved MainPhone design: one compact row per boat, with the
// 7-day speed bars under the name and the three numbers that matter on the right. Shown under 700 px instead of the table.
import Link from "next/link";
import type { BoatStat } from "@/lib/db";
import { nm, kn, sgn, hhmm, dayMon } from "@/lib/format";
import SpeedBars from "./SpeedBars";
import { Tri } from "./Who";
export default function RankingList({ boats, window = "24h" }: { boats: BoatStat[]; window?: "4h" | "24h" | "7d" }) {
  const run = (b: BoatStat) => window === "4h" ? `${kn(b.spd4)} kt / 4 h` : window === "7d" ? `${nm(b.run7_nm)} nm / 7 d` : `${nm(b.run24_nm)} nm / 24 h`;
  return <div>{boats.map(b => <div key={b.team_id} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) auto", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--hair)", alignItems: "start" }}>
    <div className="num" style={{ fontSize: 15, fontWeight: 500, paddingTop: 1 }}>{b.rank}</div>
    <div style={{ minWidth: 0 }}>
      <div className="mont" style={{ fontSize: 14, fontWeight: 600 }}><Link href={`/skipper/${b.team_id}`} className="who-link">{b.team.name}</Link>{b.rank_change !== 0 && <span className="num" style={{ fontSize: 11, marginLeft: 6 }}><Tri n={b.rank_change} /></span>}</div>
      <div style={{ fontStyle: "italic", fontSize: 13, color: "var(--graphite)" }}>{b.team.model}</div>
      {b.stale && <div className="mont loss" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6 }}>MISSED {hhmm(b.as_of)} · FIX {hhmm(b.last_fix_at)}</div>}
      {b.restart_at && <div className="mont" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: "var(--graphite)" }}>RESTARTED {dayMon(b.restart_at).toUpperCase()} AFTER REPAIRS</div>}
      <div style={{ marginTop: 6 }}><SpeedBars log={b.speed_log_json} width={168} height={18} /></div>
    </div>
    <div className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
      <div style={{ fontSize: 14, fontWeight: b.rank === 1 ? 600 : 400 }}>{nm(b.dtf_nm)}</div>
      <div className="small" style={{ fontSize: 11, fontWeight: b.fleet_best24 && window === "24h" ? 600 : 400 }}>{run(b)}</div>
      {b.gain24_nm != null && <div className={Math.round(b.gain24_nm) === 0 ? "small" : b.gain24_nm > 0 ? "gain" : "loss"} style={{ fontSize: 11 }}>{sgn(b.gain24_nm, 0)} nm on leader</div>}
      <div className={(b.vs_vdh_days ?? 0) > 0 ? "gain" : "loss"} style={{ fontSize: 11 }}>{sgn(b.vs_vdh_days)} d VDH</div>
    </div>
  </div>)}</div>;
}
