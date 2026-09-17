// site/components/RankingTable.tsx
import Link from "next/link";
import type { BoatStat } from "@/lib/db";
import { nm, kn, sgn, hhmm, dayMon } from "@/lib/format";
import SpeedBars from "./SpeedBars";
export function Tri({ n }: { n: number }) {
  if (n > 0) return <span className="gain" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><svg width="8" height="7"><path d="M4 0 L8 7 L0 7 Z" fill="currentColor" /></svg>{n}</span>;
  if (n < 0) return <span className="loss" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><svg width="8" height="7"><path d="M0 0 L8 0 L4 7 Z" fill="currentColor" /></svg>{-n}</span>;
  return <span style={{ color: "var(--graphite)" }}>–</span>;
}
export function Who({ b, sub = true }: { b: BoatStat; sub?: boolean }) {
  return <div style={{ whiteSpace: "nowrap" }}>
    <div className="mont" style={{ fontSize: 13, fontWeight: 600 }}><Link href={`/skipper/${b.team_id}`} style={{ color: "inherit", textDecoration: "none" }}>{b.team.name}</Link> <span style={{ fontWeight: 500, color: "var(--graphite)", fontSize: 11 }}>{b.team.country_code}</span></div>
    {sub && <div style={{ fontStyle: "italic", fontSize: 13, color: "var(--graphite)" }}>{b.team.model}</div>}
    {b.stale && <div className="mont loss" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6 }}>MISSED {hhmm(b.as_of)} REPORT · LAST FIX {hhmm(b.last_fix_at)} UTC</div>}
    {b.restart_at && <div className="mont" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: "var(--graphite)" }}>RESTARTED {dayMon(b.restart_at).toUpperCase()} AFTER REPAIRS</div>}
  </div>;
}
export default function RankingTable({ boats, window = "24h" }: { boats: BoatStat[]; window?: "4h" | "24h" | "7d" }) {
  const col = window === "4h" ? { h: "4 h leg kt", v: (b: BoatStat) => kn(b.spd4) } : window === "7d" ? { h: "7 d run nm", v: (b: BoatStat) => nm(b.run7_nm) } : { h: "24 h run nm", v: (b: BoatStat) => nm(b.run24_nm) };
  return <table className="data"><thead><tr><th>Place</th><th>± 24 h</th><th>Skipper · design</th><th>Position</th><th className="r">To go nm</th><th className="r">Gap</th><th className="r">{col.h}</th><th style={{ paddingLeft: 12 }}>Speed · 7 days</th><th className="r">vs VDH</th></tr></thead>
    <tbody>{boats.map(b => <tr key={b.team_id}>
      <td className="num" style={{ fontSize: 15, fontWeight: 500 }}>{b.rank}</td><td className="num" style={{ fontSize: 12 }}><Tri n={b.rank_change} /></td>
      <td><Who b={b} /></td><td className="num" style={{ fontSize: 12, color: "var(--graphite)" }}>{b.position_text}</td>
      <td className="num r">{nm(b.dtf_nm)}</td><td className="num r" style={{ color: "var(--graphite)" }}>{b.gap_nm ? `+${nm(b.gap_nm)}` : "—"}</td>
      <td className="num r" style={{ fontWeight: b.fleet_best24 ? 600 : 400 }}>{col.v(b)}</td>
      <td style={{ padding: "8px 6px 8px 12px" }}><SpeedBars log={b.speed_log_json} /></td>
      <td className={`num r ${(b.vs_vdh_days ?? 0) > 0 ? "gain" : "loss"}`}>{sgn(b.vs_vdh_days)} d</td>
    </tr>)}</tbody></table>;
}
