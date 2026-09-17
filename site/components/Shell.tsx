// site/components/Shell.tsx
import Link from "next/link";
import { SITE_NAME, STRAPLINE } from "@/lib/format";
const NAV: [string, string][] = [["Fleet", "/"], ["Ghost race", "/ghosts"], ["Records", "/records"], ["Course & sprints", "/course"], ["Boats", "/boats"], ["Conditions", "/conditions"], ["Method", "/method"]];
export const NOTICE = "Not affiliated with the Golden Globe Race. Nothing on this site may be relayed to a competitor (NOR F.8.2).";
export default function Shell({ active, dateline, title, note, sub, children }: { active: string; dateline: string; title: string; note?: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 56px", background: "var(--header-bg)", color: "var(--header-fg)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}><span className="mont" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2.4 }}>{SITE_NAME.toUpperCase()}</span><span style={{ fontSize: 12, fontStyle: "italic", color: "var(--header-muted)" }}>{STRAPLINE}</span></div>
        <div className="num" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--header-muted)" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)" }} />Positions every 4 h</div>
      </header>
      <div className="wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 40, gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="mont" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 3, color: "var(--gold-text)" }}>{dateline}</div>
          <h1 className="mont" style={{ fontSize: 52, fontWeight: 600, letterSpacing: 6, lineHeight: 1, margin: 0 }}>{title}</h1>
          {sub && <div style={{ fontSize: 20, fontStyle: "italic", color: "var(--graphite)" }}>{sub}</div>}
        </div>
        {note && <div className="pencil" style={{ fontSize: 22, maxWidth: 360, textAlign: "right", lineHeight: 1.2 }}>{note}</div>}
      </div>
      <div className="wrap"><div style={{ marginTop: 18, height: 2, background: "var(--gold)" }} /></div>
      <nav className="wrap mont" style={{ display: "flex", gap: 28, paddingTop: 14, fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
        {NAV.map(([n, href]) => <Link key={n} href={href} style={{ textDecoration: "none", paddingBottom: 4, color: n === active ? "var(--ink)" : "var(--graphite)", borderBottom: n === active ? "2px solid var(--gold)" : "none" }}>{n}</Link>)}
      </nav>
      <main className="wrap" style={{ display: "flex", flexDirection: "column", gap: 40, paddingTop: 32, flex: 1 }}>{children}</main>
      <footer className="wrap" style={{ marginTop: 48, paddingBottom: 28 }}>
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 16, display: "flex", justifyContent: "space-between", gap: 32, fontSize: 12, color: "var(--graphite)", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 300px", maxWidth: 600 }}>{NOTICE}</span>
          <span style={{ flex: "1 1 300px", maxWidth: 700 }}>Positions: YB Tracking · Weather: Open-Meteo, CC BY 4.0 · In the spirit of Jonathan Endersby’s GGR Underground, 2022 · <Link href="/method">Method</Link></span>
        </div>
      </footer>
    </div>
  );
}
