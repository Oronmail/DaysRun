// site/components/WindShares.tsx — where the wind came from, one stacked bar per year: upwind (loss red), reaching (grey), running
// (gain green), the site's bands. lib/editions.windShares already guarantees the three shares add to 100 (or all zero for a day
// with no legs at all); barPct is the straight read of that row into the three widths this bar draws, kept as its own pure export
// so the arithmetic (not the DOM) is what the test checks.
import { YEAR_LABEL, YEAR_TEXT, type Year } from "../lib/editions";
export type WindRow = { year: Year; upwind: number; reaching: number; running: number };
export function barPct(r: WindRow): [number, number, number] {
  return [r.upwind, r.reaching, r.running];
}
export default function WindShares({ rows }: { rows: WindRow[] }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(r => { const [up, re, ru] = barPct(r); return <div key={r.year} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 10, alignItems: "center" }}>
    <span className="mont" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: YEAR_TEXT[r.year] }}>{YEAR_LABEL[r.year]}</span>
    <div style={{ display: "flex" }}>{([["upwind", up, "var(--loss)"], ["reaching", re, "var(--bar)"], ["running", ru, "var(--gain)"]] as const).map(([k, v, c]) => <div key={k} className="num" style={{ width: `${v}%`, background: c, color: "#fff", fontSize: 11, padding: "5px 0", textAlign: "center", overflow: "hidden" }}>{v >= 8 ? `${v}%` : ""}</div>)}</div>
  </div>; })}</div>;
}
