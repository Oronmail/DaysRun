// site/components/DonsSlide.tsx — the daily slide, one 16:9 screen for the race's daily live (layout approved 17 Sep 2026: three
// numbers, the fleet's runs as the picture, three stories). Dark and large because it is watched as video on phones. Every length
// is in u = 1/1920 of the width (or 1/1080 of the height, whichever is smaller), so it fills any screen share exactly.
// All numbers and sentences come from lib/slide.ts; this file only draws.
import type { Column } from "@/lib/slide";
import { nm, kn, sgn, hhmm, dayMon, SITE_NAME, SITE_HOST } from "@/lib/format";
const K = { bg: "#10161C", panel: "#18222C", line: "#26323D", text: "#ECE6D6", muted: "#9AA3AA", gold: "#DEB200", gain: "#5FB3A1", loss: "#E0604A", amber: "#F2A93B", bar: "#5C6B78" };
const u = (n: number) => `calc(${n} * var(--u))`;
const SANS = "var(--font-sans), sans-serif", MONO = "var(--font-mono), monospace";
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) + (parseInt(b.slice(i, i + 2), 16) - parseInt(a.slice(i, i + 2), 16)) * t).toString(16).padStart(2, "0")).join("");
const shade = (kt: number, gold: boolean) => { const t = Math.max(0, Math.min(1, (kt - 4.25) / 3.5)); return gold ? mix("#7a6200", "#f3c81a", t) : mix("#3f4b56", "#9fb1bf", t); };   // lighter = faster, 4¼ to 7¾ kt
const label = { fontFamily: SANS, fontWeight: 700, letterSpacing: u(3), fontSize: u(22), color: K.muted, textTransform: "uppercase" } as const;
const tile = { background: K.panel, borderTop: `${u(4)} solid ${K.gold}`, display: "flex", flexDirection: "column" } as const;
export type SlideData = { raceDay: number; asOf: string; sync: string | null; cols: Column[]; biggest: Column | null; average: number | null; averageBefore: number | null;
  fastest: { team_id: number; first: string; kt: number; end_slot: string } | null; leader: { who: string; nm: number; text: string; worst: { who: string; nm: number } | null } | null;
  passes: string[]; places: { ups: [number, string[]][]; downs: [number, string[]][] } };

function Hero({ k, big, unit, color, children }: { k: string; big: string; unit: string; color?: string; children: React.ReactNode }) {
  return <div style={{ ...tile, padding: `${u(20)} ${u(32)}`, gap: u(6) }}><div style={label}>{k}</div>
    <div style={{ fontFamily: SANS, fontWeight: 600, lineHeight: 1, fontSize: u(74), color }}>{big} <span style={{ fontSize: u(40) }}>{unit}</span></div>
    <div style={{ fontSize: u(25), whiteSpace: "nowrap" }}>{children}</div></div>;
}
function Story({ k, children }: { k: string; children: React.ReactNode }) {
  return <div style={{ ...tile, padding: `${u(16)} ${u(28)}`, gap: u(5) }}><div style={{ ...label, fontSize: u(19) }}>{k}</div><div style={{ fontSize: u(25), lineHeight: 1.22 }}>{children}</div></div>;
}
function Col({ c, lead, fastestSlot, asOf, H, max }: { c: Column; lead: boolean; fastestSlot: number | null; asOf: string; H: number; max: number }) {
  const gold = lead ? K.gold : undefined, bridged = c.bridgedNm > 0; let hatchDone = false;
  const blocks = c.legs.map((l, i) => {
    if (l) return <div key={i} style={{ height: u(l.nm / max * H), background: shade(l.kt, lead), ...(fastestSlot === i ? { outline: `${u(3)} solid #fff`, outlineOffset: u(-3) } : {}) }} />;
    if (hatchDone || !bridged) return null; hatchDone = true;                                                     // one block for the whole silence: the run less the legs that are known
    return <div key={i} style={{ height: u(c.bridgedNm / max * H), border: `${u(1.5)} dashed ${K.muted}`, background: `repeating-linear-gradient(45deg, ${K.bar}55 0 ${u(5)}, transparent ${u(5)} ${u(10)})` }} />;
  }).reverse();                                                                                                   /* the oldest leg at the foot */
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: u(H + 150), opacity: c.stale ? 0.45 : 1 }}>
    <div style={{ fontFamily: MONO, fontSize: u(26), color: gold }}>{c.stale ? "—" : nm(c.run)}</div>
    <div style={{ fontFamily: MONO, fontSize: u(17), color: K.muted, marginBottom: u(5) }}>{c.stale || c.kt == null ? " " : `${kn(c.kt)} kt`}</div>
    <div style={{ width: u(74), position: "relative", display: "flex", flexDirection: "column", gap: u(2) }}>{c.stale ? null : blocks}
      {!c.stale && c.dayBefore != null && <div style={{ position: "absolute", left: u(-7), right: u(-7), bottom: u(c.dayBefore / max * H), borderTop: `${u(3)} solid ${K.text}` }} />}</div>
    <div style={{ fontFamily: SANS, fontSize: u(21), fontWeight: 600, marginTop: u(7), color: gold }}>{c.first}</div>
    <div style={{ fontFamily: SANS, fontSize: u(16), fontWeight: 600, color: K.muted, whiteSpace: "nowrap" }}>{ord(c.place)}{c.pb && !c.stale && <> · <span style={{ color: K.gain }}>PB</span></>}{bridged && !c.stale && <> · <span style={{ color: K.amber }}>gap</span></>}{c.stale && <> · <span style={{ color: K.amber }}>missed {hhmm(asOf)}</span></>}</div>
    <div style={{ fontFamily: MONO, fontSize: u(16), color: K.muted, marginTop: u(2) }}>{c.wind == null ? " " : `${c.wind} kt`}</div>
  </div>;
}
export default function DonsSlide({ d }: { d: SlideData }) {
  const day = new Date(d.asOf), lead = d.biggest, max = Math.max(190, ...d.cols.map(c => (c.stale ? 0 : c.run ?? 0))) * 1.0, H = 226, delta = d.average != null && d.averageBefore != null ? Math.round(d.average) - Math.round(d.averageBefore) : null;
  const fastestSlot = (c: Column) => (d.fastest && d.fastest.team_id === c.team_id ? 5 - Math.round((day.getTime() - new Date(d.fastest.end_slot).getTime()) / (4 * 3600 * 1000)) : null);
  const group = (g: [number, string[]][]) => g.map(([n, who]) => `${n} ${who.join(", ")}`).join(" · ");
  return <div style={{ ["--u" as string]: "min(calc(100vw / 1920), calc(100vh / 1080))", minHeight: "100vh", background: K.bg, display: "grid", placeItems: "center" } as React.CSSProperties}>
    <div style={{ width: u(1920), height: u(1080), position: "relative", overflow: "hidden", background: K.bg, color: K.text, fontFamily: "var(--font-serif), Georgia, serif" }}>
      <div style={{ padding: `${u(44)} ${u(64)} 0`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><div style={{ fontFamily: SANS, color: K.gold, fontSize: u(24), fontWeight: 600, letterSpacing: u(5) }}>GOLDEN GLOBE RACE 2026 · RACE DAY {d.raceDay}</div>
          <div style={{ fontFamily: SANS, fontSize: u(68), fontWeight: 700, letterSpacing: u(7), lineHeight: 1.05, marginTop: u(6) }}>DAILY BOARD</div></div>
        <div style={{ textAlign: "right" }}><div style={label}>the 24 hours to</div><div style={{ fontFamily: MONO, fontSize: u(40) }}>{hhmm(d.asOf)} UTC · {WEEKDAY[day.getUTCDay()]} {dayMon(d.asOf)}</div></div>
      </div>
      <div style={{ padding: `${u(18)} ${u(64)} 0`, display: "flex", flexDirection: "column", gap: u(14) }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: u(18) }}>
          <Hero k="Biggest run" big={lead ? nm(lead.run) : "—"} unit="nm" color={K.gold}>{lead ? <><b style={{ fontFamily: SANS }}>{lead.first}</b> · {lead.pb ? "a personal best, " : ""}from {ord(lead.place)} place</> : "no complete 24-hour run yet"}</Hero>
          <Hero k="Fleet average run" big={d.average == null ? "—" : nm(d.average)} unit="nm">{delta == null ? "boats with all six legs" : delta === 0 ? "the same as the day before" : <><span style={{ color: delta > 0 ? K.gain : K.loss }}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta)}</span> on the day before</>}</Hero>
          <Hero k="Fastest 4-hour leg" big={d.fastest ? kn(d.fastest.kt) : "—"} unit="kt">{d.fastest ? <><b style={{ fontFamily: SANS }}>{d.fastest.first}</b> · the leg ending {hhmm(d.fastest.end_slot)} (outlined)</> : "no leg measured yet"}</Hero>
        </div>
        <div style={{ ...tile, padding: `${u(14)} ${u(32)} ${u(10)}`, gap: u(2) }}><div style={{ ...label, fontSize: u(19) }}>The day’s runs · nautical miles, and average speed</div>
          <div style={{ display: "flex", gap: u(30), alignItems: "center", fontFamily: SANS, fontSize: u(16), color: K.muted, whiteSpace: "nowrap" }}><span>a column is six 4-hour legs, the oldest at the foot · lighter = faster</span>
            <span><span style={{ display: "inline-block", width: u(26), borderTop: `${u(3)} solid ${K.text}`, verticalAlign: "middle" }} /> the day before</span>
            <span><span style={{ display: "inline-block", width: u(20), height: u(14), border: `${u(1.5)} dashed ${K.muted}`, verticalAlign: "middle" }} /> tracker silent: a straight line, so a lower bound</span><span>bottom row: model wind</span></div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, d.cols.length)}, 1fr)` }}>{d.cols.map(c => <Col key={c.team_id} c={c} lead={lead?.team_id === c.team_id} fastestSlot={fastestSlot(c)} asOf={d.asOf} H={H} max={max} />)}</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: u(18) }}>
          <Story k="On the leader · 24 h">{d.leader ? <><b style={{ fontFamily: SANS, color: d.leader.nm > 0 ? K.gain : K.loss }}>{d.leader.who} {sgn(d.leader.nm, 0)} nm</b>, {d.leader.text}{d.leader.worst && <> · <span style={{ color: K.loss }}>{d.leader.worst.who} {sgn(d.leader.worst.nm, 0)}</span></>}</> : "No comparison at this report: no boat with a current fix to measure."}</Story>
          <Story k="Passes">{d.passes.map((p, i) => <span key={i}>{i > 0 && " · "}<b style={{ fontFamily: SANS }}>{p.split(" ")[0]}</b> {p.split(" ").slice(1).join(" ")}</span>)}</Story>
          <Story k="Places · 24 h">{d.places.ups.length + d.places.downs.length === 0 ? "No change of place in 24 hours" : <span style={{ fontFamily: MONO, fontSize: u(23) }}>{d.places.ups.length > 0 && <><span style={{ color: K.gain }}>▲</span>{group(d.places.ups)}<br /></>}{d.places.downs.length > 0 && <><span style={{ color: K.loss }}>▼</span>{group(d.places.downs)}</>}</span>}</Story>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: u(64), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${u(64)}`, background: K.panel, borderTop: `1px solid ${K.line}`, fontSize: u(19), color: K.muted, whiteSpace: "nowrap", gap: u(40) }}>
        <span><b style={{ fontFamily: SANS, color: K.gold, letterSpacing: u(3) }}>{SITE_NAME.toUpperCase()}</b> · unofficial statistics, made by fans · <span style={{ fontFamily: MONO, color: K.text }}>{SITE_HOST}</span></span>
        <span>Positions: YB Tracking · wind: Open-Meteo model{d.sync && <> · last sync {hhmm(d.sync)} UTC</>} · not to be relayed to a competitor (NOR F.8.2)</span></div>
    </div>
  </div>;
}
