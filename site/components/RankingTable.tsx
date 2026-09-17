// site/components/RankingTable.tsx — the Fleet ranking. A client component only so that a column title can re-order the rows;
// it receives the rows from the server and calls nothing.
"use client";
import { useState } from "react";
import type { BoatStat } from "@/lib/db";
import { nm, kn, sgn } from "@/lib/format";
import { sortBoats, defaultDir, type SortKey, type SortDir } from "@/lib/sort";
import SpeedBars from "./SpeedBars";
import { Tri, Who } from "./Who";
type Sort = { key: SortKey; dir: SortDir };
const signClass = (n: number | null) => (n == null || Math.round(n) === 0 ? "" : n > 0 ? "gain" : "loss");
// Top level, not inside the table's render: a component defined during render is a new type every time, so React would
// remount the header cells on each sort and the keyboard focus would be lost after every press.
function Th({ k, sort, setSort, children, right, pad, two }: { k: SortKey; sort: Sort; setSort: (s: Sort) => void; children: React.ReactNode; right?: boolean; pad?: boolean; two?: boolean }) {
  const on = sort.key === k;
  return <th className={[right ? "r" : "", two ? "two" : ""].join(" ").trim() || undefined} style={pad ? { paddingLeft: 12 } : undefined} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" className="th-sort" onClick={() => setSort(on ? { key: k, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: k, dir: defaultDir(k) })} title="Sort by this column">
      {children}<span aria-hidden="true" className="th-arrow">{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>;
}
export default function RankingTable({ boats, window = "24h" }: { boats: BoatStat[]; window?: "4h" | "24h" | "7d" }) {
  const [sort, setSort] = useState<Sort>({ key: "rank", dir: "asc" });
  const h = { sort, setSort };
  const col = window === "4h" ? { h: "4 h leg kt", v: (b: BoatStat) => kn(b.spd4) } : window === "7d" ? { h: "7 d run nm", v: (b: BoatStat) => nm(b.run7_nm) } : { h: "24 h run nm", v: (b: BoatStat) => nm(b.run24_nm) };
  const rows = sortBoats(boats, sort.key, sort.dir, window);
  return <table className="data"><thead><tr><Th k="rank" {...h}>Place</Th><Th k="change" {...h}>± 24 h</Th><Th k="name" {...h}>Skipper · design</Th><Th k="dtf" {...h} right>To go nm</Th><Th k="gap" {...h} right>Gap</Th><Th k="gain" {...h} right two>On leader 24 h</Th><Th k="near" {...h} right two>vs nearby</Th><Th k="run" {...h} right two>{col.h}</Th><Th k="spd7" {...h} pad>Speed · 7 days</Th><Th k="vdh" {...h} right>vs VDH</Th></tr></thead>
    <tbody>{rows.map(b => <tr key={b.team_id}>
      <td className="num" style={{ fontSize: 15, fontWeight: 500 }}>{b.rank}</td><td className="num" style={{ fontSize: 12 }}><Tri n={b.rank_change} /></td>
      <td><Who b={b} /></td>
      <td className="num r">{nm(b.dtf_nm)}</td><td className="num r" style={{ color: "var(--graphite)" }}>{b.gap_nm ? `+${nm(b.gap_nm)}` : "—"}</td>
      <td className={`num r ${signClass(b.gain24_nm)}`} title="Nautical miles gained (+) or lost (−) on the leader in 24 hours, fix to fix">{sgn(b.gain24_nm, 0)}</td>
      <td className={`num r ${signClass(b.vs_near_nm)}`} title={b.near_n ? `24-hour run against the median of ${b.near_n} boats within 150 nm` : undefined}>{sgn(b.vs_near_nm, 0)}</td>
      <td className="num r" style={{ fontWeight: b.fleet_best24 ? 600 : 400 }}>{col.v(b)}</td>
      <td style={{ padding: "8px 6px 8px 12px" }}><SpeedBars log={b.speed_log_json} /></td>
      <td className={`num r ${(b.vs_vdh_days ?? 0) > 0 ? "gain" : "loss"}`}>{sgn(b.vs_vdh_days)} d</td>
    </tr>)}</tbody></table>;
}
