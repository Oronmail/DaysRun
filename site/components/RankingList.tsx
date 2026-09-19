// site/components/RankingList.tsx — the phone ranking from the approved MainPhone design: one compact row per boat, with the
// 7-day speed bars under the name and the three numbers that matter on the right. Shown under 700 px instead of the table.
// A client component only for its "Sort by" control (a native select: the phone's own picker); it receives the rows and calls nothing.
"use client";
import { useState } from "react";
import Link from "next/link";
import { sortBoats, defaultDir, phoneSortOptions, type SortKey, type SortDir } from "@/lib/sort";
import type { BoatStat } from "@/lib/db";
import type { RankRow } from "./RankingTable";
import { nm, kn, sgn, hhmm, dayMon } from "@/lib/format";
import SpeedBars from "./SpeedBars";
import { Tri, Course } from "./Who";
export default function RankingList({ boats, window = "24h" }: { boats: RankRow[]; window?: "4h" | "24h" | "7d" }) {
  const run = (b: BoatStat) => window === "4h" ? `${kn(b.spd4)} kt / 4 h` : window === "7d" ? `${nm(b.run7_nm)} nm / 7 d` : `${b.run24_bridged && b.run24_nm != null ? "\u2265\u2009" : ""}${nm(b.run24_nm)} nm / 24 h`;
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "rank", dir: "asc" });
  const rows = sortBoats(boats, sort.key, sort.dir, window);
  return <div>
    <div className="list-sort mont"><label htmlFor="list-sort">Sort by</label>
      <select id="list-sort" value={sort.key} onChange={e => { const key = e.target.value as SortKey; setSort({ key, dir: defaultDir(key) }); }}>{phoneSortOptions(window).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
      <button type="button" onClick={() => setSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })} aria-label={sort.dir === "asc" ? "Ascending: press for descending" : "Descending: press for ascending"}>{sort.dir === "asc" ? "▲" : "▼"}</button></div>
    <div className="small" style={{ fontSize: 11, textAlign: "right", paddingBottom: 4 }}>to go nm · run · vs VDH</div>
    {rows.map(b => <div key={b.team_id} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) auto", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--hair)", alignItems: "start" }}>
    <div className="num" style={{ fontSize: 15, fontWeight: 500, paddingTop: 1 }}>{b.rank}</div>
    <div style={{ minWidth: 0 }}>
      <div className="mont" style={{ fontSize: 14, fontWeight: 600 }}><Link href={`/skipper/${b.team_id}`} className="who-link">{b.team.name}</Link>{!!b.rank_change && <span className="num" style={{ fontSize: 11, marginLeft: 6 }}><Tri n={b.rank_change} /></span>}</div>
      <div style={{ fontStyle: "italic", fontSize: 13, color: "var(--graphite)" }}>{b.team.model}</div>
      {b.stale && <div className="mont loss" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6 }}>MISSED {hhmm(b.as_of)} · FIX {hhmm(b.last_fix_at)}</div>}
      {b.restart_at && <div className="mont" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: "var(--graphite)" }}>RESTARTED {dayMon(b.restart_at).toUpperCase()} AFTER REPAIRS</div>}
      <div style={{ marginTop: 6 }}><SpeedBars log={b.speed_log_json} width={168} height={18} /></div>
      <div className="small" style={{ fontSize: 12, marginTop: 4, whiteSpace: "nowrap" }}>{window !== "4h" && b.spd4 != null && !b.stale && <>latest leg {kn(b.spd4)} kt<Course deg={b.cmg4 ?? 0} /> · </>}{b.wind_ratio != null ? `${Math.round(b.wind_ratio * 100)}% for the wind` : "not rated for the wind yet"}</div>
    </div>
    <div className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
      <div style={{ fontSize: 14, fontWeight: b.rank === 1 ? 600 : 400 }}>{nm(b.dtf_nm)}</div>
      <div className="small" style={{ fontSize: 11, fontWeight: b.fleet_best24 && window === "24h" ? 600 : 400 }}>{run(b)}</div>
      {b.gain24_nm != null && <div className={Math.round(b.gain24_nm) === 0 ? "small" : b.gain24_nm > 0 ? "gain" : "loss"} style={{ fontSize: 11 }}>{sgn(b.gain24_nm, 0)} nm on leader</div>}
      <div className={(b.vs_vdh_days ?? 0) > 0 ? "gain" : "loss"} style={{ fontSize: 11 }}>{sgn(b.vs_vdh_days)} d VDH</div>
    </div>
  </div>)}</div>;
}
