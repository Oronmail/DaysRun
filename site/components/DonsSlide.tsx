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
const label = { fontFamily: SANS, fontWeight: 700, letterSpacing: u(3), fontSize: u(22), color: K.muted, textTransform: "uppercase" } as const;
const tile = { background: K.panel, borderTop: `${u(4)} solid ${K.gold}`, display: "flex", flexDirection: "column" } as const;
export type SlideData = { raceDay: number; asOf: string; sync: string | null; cols: Column[]; biggest: Column | null; average: number | null; averageBefore: number | null;
  fastest: { team_id: number; first: string; kt: number; end_slot: string } | null; leader: { who: string; nm: number; text: string; worst: { who: string; nm: number } | null } | null;
  ghost: { head: string; rest: string } | null; places: { ups: [number, string[]][]; downs: [number, string[]][] } };

function Hero({ k, big, unit, color, children }: { k: string; big: string; unit: string; color?: string; children: React.ReactNode }) {
  return <div style={{ ...tile, padding: `${u(20)} ${u(32)}`, gap: u(6) }}><div style={label}>{k}</div>
    <div style={{ fontFamily: SANS, fontWeight: 600, lineHeight: 1, fontSize: u(74), color }}>{big} <span style={{ fontSize: u(40) }}>{unit}</span></div>
    <div style={{ fontSize: u(25), whiteSpace: "nowrap" }}>{children}</div></div>;
}
function Story({ k, children }: { k: string; children: React.ReactNode }) {
  return <div style={{ ...tile, padding: `${u(16)} ${u(28)}`, gap: u(5) }}><div style={{ ...label, fontSize: u(19) }}>{k}</div><div style={{ fontSize: u(25), lineHeight: 1.22 }}>{children}</div></div>;
}
// One boat's column, kept to what reads in a glance: the miles, a plain bar (its six 4-hour legs show only as faint notches; the
// fastest leg of the day is the one white block), a tick for the day before, the name, the place. Anything that needs a
// word gets the word ("personal best", "tracker silent"), never an abbreviation: the first viewer asked what PB and gap meant.
function Col({ c, lead, fastestSlot, asOf, H, max }: { c: Column; lead: boolean; fastestSlot: number | null; asOf: string; H: number; max: number }) {
  const gold = lead ? K.gold : undefined, bridged = c.bridgedNm > 0, fill = lead ? K.gold : K.bar; let hatchDone = false;
  const blocks = c.legs.map((l, i) => {
    if (l) return <div key={i} style={{ height: u(l.nm / max * H), background: fastestSlot === i ? K.text : fill }} />;
    if (hatchDone || !bridged) return null; hatchDone = true;                                                     // one block for the whole silence: the run less the legs that are known
    return <div key={i} style={{ height: u(c.bridgedNm / max * H), border: `${u(1.5)} dashed ${K.muted}`, background: `repeating-linear-gradient(45deg, ${K.bar}55 0 ${u(5)}, transparent ${u(5)} ${u(10)})` }} />;
  }).reverse();                                                                                                   /* the oldest leg at the foot */
  const flag = c.stale ? `missed ${hhmm(asOf)}` : bridged ? "tracker silent" : c.pb ? "personal best" : null;
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: u(H + 128), minWidth: 0, opacity: c.stale ? 0.45 : 1 }}>
    <div style={{ width: 0, display: "flex", justifyContent: "center", fontFamily: SANS, fontSize: u(14), fontWeight: 700, letterSpacing: u(0.6), textTransform: "uppercase", whiteSpace: "nowrap", color: c.stale || bridged ? K.amber : K.gain, minHeight: u(18) }}>{flag ?? " "}</div>   {/* zero width: a long word never pushes its column off the grid */}
    <div style={{ fontFamily: MONO, fontSize: u(28), color: gold, marginBottom: u(6) }}>{c.stale ? "—" : nm(c.run)}</div>
    <div style={{ width: u(74), position: "relative", display: "flex", flexDirection: "column", gap: u(1) }}>{c.stale ? null : blocks}
      {!c.stale && c.dayBefore != null && <div style={{ position: "absolute", left: u(-7), right: u(-7), bottom: u(c.dayBefore / max * H), borderTop: `${u(3)} solid ${K.text}` }} />}</div>
    <div style={{ fontFamily: SANS, fontSize: u(21), fontWeight: 600, marginTop: u(7), color: gold }}>{c.first}</div>
    <div style={{ fontFamily: SANS, fontSize: u(17), fontWeight: 600, color: K.muted }}>{ord(c.place)}</div>
  </div>;
}
// The word for the row of small figures under the names, once, at the left.
function RowLabels({ H }: { H: number }) {
  const row = { fontFamily: SANS, fontSize: u(14), fontWeight: 700, letterSpacing: u(1), textTransform: "uppercase", color: K.muted, whiteSpace: "nowrap", textAlign: "right" } as const;
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end", height: u(H + 128), paddingRight: u(10) }}>
    <div style={{ ...row, fontSize: u(21), visibility: "hidden", marginTop: u(7) }}>x</div>
    <div style={{ ...row, lineHeight: u(24) }}>place</div></div>;
}
export default function DonsSlide({ d }: { d: SlideData }) {
  const day = new Date(d.asOf), lead = d.biggest, max = Math.max(190, ...d.cols.map(c => (c.stale ? 0 : c.run ?? 0))) * 1.0, H = 252, delta = d.average != null && d.averageBefore != null ? Math.round(d.average) - Math.round(d.averageBefore) : null;
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
          <Hero k="Fastest 4-hour leg" big={d.fastest ? kn(d.fastest.kt) : "—"} unit="kt">{d.fastest ? <><b style={{ fontFamily: SANS }}>{d.fastest.first}</b> · from {hhmm(new Date(new Date(d.fastest.end_slot).getTime() - 4 * 3600 * 1000).toISOString())} to {hhmm(d.fastest.end_slot)} UTC · the white block</> : "no leg measured yet"}</Hero>
        </div>
        <div style={{ ...tile, padding: `${u(14)} ${u(32)} ${u(10)}`, gap: u(2) }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: u(30) }}><div style={{ ...label, fontSize: u(19) }}>The day’s runs · nautical miles in 24 hours</div>
          <div style={{ display: "flex", gap: u(28), alignItems: "center", fontFamily: SANS, fontSize: u(16), color: K.muted, whiteSpace: "nowrap" }}>
            <span><span style={{ display: "inline-block", width: u(26), borderTop: `${u(3)} solid ${K.text}`, verticalAlign: "middle" }} /> the day before</span>
            <span><span style={{ display: "inline-block", width: u(16), height: u(14), background: K.text, verticalAlign: "middle" }} /> the fastest 4 hours</span>
            <span><span style={{ display: "inline-block", width: u(20), height: u(14), border: `${u(1.5)} dashed ${K.muted}`, verticalAlign: "middle" }} /> tracker silent: the run is a minimum</span></div></div>
          <div style={{ display: "grid", gridTemplateColumns: `${u(96)} repeat(${Math.max(1, d.cols.length)}, 1fr)` }}><RowLabels H={H} />{d.cols.map(c => <Col key={c.team_id} c={c} lead={lead?.team_id === c.team_id} fastestSlot={fastestSlot(c)} asOf={d.asOf} H={H} max={max} />)}</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: u(18) }}>
          <Story k="On the leader · 24 h">{d.leader ? <><b style={{ fontFamily: SANS, color: d.leader.nm > 0 ? K.gain : K.loss }}>{d.leader.who} {sgn(d.leader.nm, 0)} nm</b>, {d.leader.text}{d.leader.worst && <> · <span style={{ color: K.loss }}>{d.leader.worst.who} {sgn(d.leader.worst.nm, 0)}</span></>}</> : "No comparison at this report: no boat with a current fix to measure."}</Story>
          <Story k="Against the 2018 winner">{d.ghost ? <><b style={{ fontFamily: SANS, color: d.ghost.head.endsWith("behind") ? K.loss : K.gain }}>{d.ghost.head}</b> {d.ghost.rest}</> : "No 2018 position to compare with at this report."}</Story>
          <Story k="Places · 24 h">{d.places.ups.length + d.places.downs.length === 0 ? "No change of place in 24 hours" : <span style={{ fontFamily: MONO, fontSize: u(23) }}>{d.places.ups.length > 0 && <><span style={{ color: K.gain }}>▲</span>{group(d.places.ups)}<br /></>}{d.places.downs.length > 0 && <><span style={{ color: K.loss }}>▼</span>{group(d.places.downs)}</>}</span>}</Story>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: u(64), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${u(64)}`, background: K.panel, borderTop: `1px solid ${K.line}`, fontSize: u(19), color: K.muted, whiteSpace: "nowrap", gap: u(40) }}>
        <span><b style={{ fontFamily: SANS, color: K.gold, letterSpacing: u(3) }}>{SITE_NAME.toUpperCase()}</b> · unofficial statistics, made by fans · <span style={{ fontFamily: MONO, color: K.text }}>{SITE_HOST}</span></span>
        <span>Positions: YB Tracking{d.sync && <> · last sync {hhmm(d.sync)} UTC</>} · not to be relayed to a competitor (NOR F.8.2)</span></div>
    </div>
  </div>;
}
