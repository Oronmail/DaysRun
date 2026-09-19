// site/components/WindShares.tsx — where the wind came from, one stacked bar per year: upwind (loss red), reaching (grey), running
// (gain green), the site's bands. lib/editions.windShares already guarantees the three shares add to 100 (or all zero for a day
// with no legs at all, drawn as an empty bar rather than a guess) — that arithmetic belongs there and is tested there
// (__tests__/editions.test.ts); this component only reads the three numbers straight through as the bar segments' widths.
import { YEAR_LABEL, YEAR_TEXT, type Year } from "@/lib/editions";
export type WindRow = { year: Year; upwind: number; reaching: number; running: number };
export default function WindShares({ rows }: { rows: WindRow[] }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(r => <div key={r.year} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 10, alignItems: "center" }}>
    <span className="mont" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: YEAR_TEXT[r.year] }}>{YEAR_LABEL[r.year]}</span>
    {/* white text on all three fills: the palette has no "text on a saturated fill" token (--loss/--bar/--gain are themselves
        near-white-on-dark in reverse), and adding one for this single use isn't worth the token surface — plain #fff reads on
        red, grey and green alike, which a themed token would not be guaranteed to. */}
    <div style={{ display: "flex" }}>{([["upwind", r.upwind, "var(--loss)"], ["reaching", r.reaching, "var(--bar)"], ["running", r.running, "var(--gain)"]] as const).map(([k, v, c]) => <div key={k} className="num" style={{ width: `${v}%`, background: c, color: "#fff", fontSize: 11, padding: "5px 0", textAlign: "center", overflow: "hidden" }}>{v >= 8 ? `${v}%` : ""}</div>)}</div>
  </div>)}</div>;
}
