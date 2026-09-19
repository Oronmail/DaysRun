// site/components/RankingTable.tsx — the Fleet ranking. A client component only so that a column title can re-order the rows;
// it receives the rows from the server and calls nothing.
"use client";
import { useState } from "react";
import type { BoatStat } from "@/lib/db";
import { nm, kn, sgn } from "@/lib/format";
import { sortBoats, defaultDir, type SortKey, type SortDir } from "@/lib/sort";
import SpeedBars from "./SpeedBars";
import { Run, Tri, Who, Course } from "./Who";
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
// Two columns added 18 Sep 2026. "Latest leg" = average speed on the newest 4-hour leg with an arrow for the course made good
// (where the boat went; never a heading). "Speed for the wind" = boat speed as a share of model wind speed since the start, as a small
// meter with the fleet's median marked. The columns read in three blocks: where she is (place, to go, gap), how fast she is going in
// growing windows (latest 4-hour leg, 24-hour run, 7-day run, the 7 days drawn as bars, and her speed for the wind beside them, at the
// owner's word), against whom (the leader, the boats nearby, Van Den Heede). Until 19 Sep 2026 three links swapped ONE column between 4 hours, 24 hours and 7 days, and the
// 4-hour view only repeated the latest leg; the owner had them out, and all three paces stand on the table at once.
// Under 1,700 px the gap moves under the distance to go and the meter keeps its figure.
export type RankRow = BoatStat & { wind_ratio: number | null; wind_legs: number };
function Meter({ v, median, max = 0.5 }: { v: number; median: number | null; max?: number }) {
  const W = 64, x = (r: number) => Math.min(r, max) / max * W;
  return <svg width={W} height="12" viewBox={`0 0 ${W} 12`} style={{ verticalAlign: "-1px", marginRight: 8 }} aria-hidden="true">
    <rect x="0" y="4" width={W} height="4" rx="2" fill="var(--hair)" /><rect x="0" y="4" width={x(v)} height="4" rx="2" fill="var(--series-1)" />
    {median != null && <line x1={x(median)} y1="1" x2={x(median)} y2="11" stroke="var(--ink)" strokeWidth="1.2" />}</svg>;
}
export default function RankingTable({ boats }: { boats: RankRow[] }) {
  const [sort, setSort] = useState<Sort>({ key: "rank", dir: "asc" });
  const h = { sort, setSort };
  const leg = (b: BoatStat) => (b.spd4 == null || b.stale ? "—" : <>{kn(b.spd4)}<Course deg={b.cmg4 ?? 0} /></>);
  const legTitle = (b: BoatStat) => (b.spd4 == null || b.stale ? "No 4-hour leg to measure at this report" : `Average speed ${kn(b.spd4)} kt, course made good ${Math.round(b.cmg4 ?? 0)}°, on the newest 4-hour leg`);
  const rows = sortBoats(boats, sort.key, sort.dir);
  const rated = boats.map(b => b.wind_ratio).filter((r): r is number => r != null).sort((x, y) => x - y);
  const median = rated.length ? (rated.length % 2 ? rated[(rated.length - 1) / 2] : (rated[rated.length / 2 - 1] + rated[rated.length / 2]) / 2) : null;
  return <table className="data"><thead><tr><Th k="rank" {...h}>Place</Th><Th k="change" {...h}>± 24 h</Th><Th k="name" {...h}>Skipper · design</Th><Th k="dtf" {...h} right>To go nm</Th><th className="r wide-only" aria-sort={sort.key === "gap" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="th-sort" onClick={() => setSort(sort.key === "gap" ? { key: "gap", dir: sort.dir === "asc" ? "desc" : "asc" } : { key: "gap", dir: defaultDir("gap") })} title="Sort by this column">Gap<span aria-hidden="true" className="th-arrow">{sort.key === "gap" ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span></button></th><Th k="leg" {...h} right two>Latest leg</Th><Th k="run" {...h} right two>24{"\u00a0"}h run nm</Th><Th k="run7" {...h} right two>7{"\u00a0"}d run nm</Th><Th k="spd7" {...h} pad two>Speed · 7{"\u00a0"}days</Th><Th k="wind" {...h} two pad>Speed for the wind</Th><Th k="gain" {...h} right two>On leader 24{"\u00a0"}h</Th><Th k="near" {...h} right two>vs nearby</Th><Th k="vdh" {...h} right>vs VDH</Th></tr></thead>
    <tbody>{rows.map(b => <tr key={b.team_id}>
      <td className="num" style={{ fontSize: 15, fontWeight: 500 }}>{b.rank}</td><td className="num" style={{ fontSize: 12 }}><Tri n={b.rank_change} /></td>
      <td><Who b={b} /></td>
      <td className="num r">{nm(b.dtf_nm)}<div className="narrow-only" style={{ fontSize: 11, color: "var(--graphite)" }}>{b.gap_nm ? `+${nm(b.gap_nm)}` : "leader"}</div></td><td className="num r wide-only" style={{ color: "var(--graphite)" }}>{b.gap_nm ? `+${nm(b.gap_nm)}` : "—"}</td>
      <td className="num r" title={legTitle(b)}>{leg(b)}</td>
      <td className="num r" style={{ fontWeight: b.fleet_best24 ? 600 : 400 }}><Run b={b} /></td>
      <td className="num r" title="Nautical miles sailed along the track over the last 7 days">{nm(b.run7_nm)}</td>
      <td style={{ padding: "8px 6px 8px 12px" }}><SpeedBars log={b.speed_log_json} /></td>
      <td className="num" style={{ paddingLeft: 12 }} title={b.wind_ratio == null ? "Not rated yet: fewer than ten legs sailed in 8–25 kt of model wind" : `Boat speed as a share of model wind speed since the start, ${b.wind_legs} legs in 8–25 kt; the mark is the fleet’s median`}>{b.wind_ratio == null ? "—" : <><span className="wide-only-inline"><Meter v={b.wind_ratio} median={median} /></span>{Math.round(b.wind_ratio * 100)}%</>}</td>
      <td className={`num r ${signClass(b.gain24_nm)}`} title="Nautical miles gained (+) or lost (−) on the leader in 24 hours, fix to fix">{sgn(b.gain24_nm, 0)}</td>
      <td className={`num r ${signClass(b.vs_near_nm)}`} title={b.near_n ? `24-hour run against the median of ${b.near_n} boats within 150 nm` : undefined}>{sgn(b.vs_near_nm, 0)}</td>
      <td className={`num r ${(b.vs_vdh_days ?? 0) > 0 ? "gain" : "loss"}`}>{sgn(b.vs_vdh_days)} d</td>
    </tr>)}</tbody></table>;
}
