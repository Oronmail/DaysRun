// site/components/Who.tsx — a skipper's name block and the places-gained arrow, shared by the ranking table, the phone list and other pages
import Link from "next/link";
import type { BoatStat } from "@/lib/db";
import { hhmm, dayMon } from "@/lib/format";
// n is blank when the boat had no current fix now or 24 hours ago: there is no change of place to show, so the dash.
export function Tri({ n }: { n: number | null }) {
  if (n != null && n > 0) return <span className="gain" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><svg width="8" height="7"><path d="M4 0 L8 7 L0 7 Z" fill="currentColor" /></svg>{n}</span>;
  if (n != null && n < 0) return <span className="loss" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><svg width="8" height="7"><path d="M0 0 L8 0 L4 7 Z" fill="currentColor" /></svg>{-n}</span>;
  return <span style={{ color: "var(--graphite)" }}>–</span>;
}
export function Who({ b, sub = true }: { b: BoatStat; sub?: boolean }) {
  return <div style={{ whiteSpace: "nowrap" }}>
    <div className="mont" style={{ fontSize: 13, fontWeight: 600 }}><Link href={`/skipper/${b.team_id}`} className="who-link">{b.team.name}</Link> <span style={{ fontWeight: 500, color: "var(--graphite)", fontSize: 11 }}>{b.team.country_code}</span></div>
    {sub && <div style={{ fontStyle: "italic", fontSize: 13, color: "var(--graphite)" }}>{b.team.model}</div>}
    {b.stale && <div className="mont loss" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6 }}>MISSED {hhmm(b.as_of)} REPORT · LAST FIX {hhmm(b.last_fix_at)} UTC</div>}
    {b.restart_at && <div className="mont" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: "var(--graphite)" }}>RESTARTED {dayMon(b.restart_at).toUpperCase()} AFTER REPAIRS</div>}
  </div>;
}
