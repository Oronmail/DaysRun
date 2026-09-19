// site/components/Who.tsx — a skipper's name block and the places-gained arrow, shared by the ranking table, the phone list and other pages
import Link from "next/link";
import type { BoatStat } from "@/lib/db";
import { hhmm, dayMon, nm } from "@/lib/format";
// n is blank when the boat had no current fix now or 24 hours ago: there is no change of place to show, so the dash.
export function Tri({ n }: { n: number | null }) {
  if (n != null && n > 0) return <span className="gain" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><svg width="8" height="7"><path d="M4 0 L8 7 L0 7 Z" fill="currentColor" /></svg>{n}</span>;
  if (n != null && n < 0) return <span className="loss" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><svg width="8" height="7"><path d="M0 0 L8 0 L4 7 Z" fill="currentColor" /></svg>{-n}</span>;
  return <span style={{ color: "var(--graphite)" }}>–</span>;
}
// The boat's own colour on YB's tracker, which is how a follower of the map already knows it: a small chip before the name. It
// carries a hairline so that a pale one (Guido's yellow, Guy's cyan) is still a shape on paper. Two boats can share a colour —
// Isa's and Andrea's are both FF0066 in YB's own data — so the chip is never the only thing that names a boat; the name and the
// country beside it are. (18 Sep 2026: the owner had the country's flag here too and took it out — with the country already
// written by the name, a chip and a flag together made the column too loud.)
export function Swatch({ colour }: { colour: string | null }) {
  if (!colour) return null;
  return <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: `#${colour}`, border: "1px solid rgba(26,26,26,0.45)", verticalAlign: "0px", marginRight: 5 }} />;
}

// The class a boat is racing in, when it is not the one every boat starts in. NOR C.2.1: all start in the Suhaili class. NOR
// C.2.2: a skipper who makes an unapproved stop or receives material assistance is placed in the Chichester class by the race,
// and goes on sailing. It is said in one small word beside the name, here and on the skipper's page, and changes no figure: a
// Chichester boat keeps her place in the ranking, her runs and her records, which is how the race's own tracker shows her.
export function ClassTag({ team }: { team: { race_class: string | null } }) {
  if (!team.race_class || team.race_class === "Suhaili") return null;
  return <span className="mont" title="Chichester class (NOR C.2.2): the race places a skipper who makes an unapproved stop, or receives material assistance, in this class. She goes on sailing."
    style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, color: "var(--amber, #B26B00)", border: "1px solid currentColor", borderRadius: 3, padding: "1px 3px", verticalAlign: "1px", whiteSpace: "nowrap" }}>
    {team.race_class.toUpperCase()}</span>;
}

// A 24-hour run that crossed a report the tracker missed is a MINIMUM: the boat is credited with the straight line between the
// fixes either side of the silence, never with the miles she really sailed, so it is printed as "≥ 142" and kept out of records
// and of the figures that compare boats with each other. The worker has always known it (grid.window); since 19 Sep it says so.
export function Run({ b }: { b: { run24_nm: number | null; run24_bridged?: boolean } }) {
  if (b.run24_nm == null || !b.run24_bridged) return <>{nm(b.run24_nm)}</>;
  return <span title="The tracker missed a report inside these 24 hours, so this run is the straight line across the silence: the boat sailed at least this far.">
    <span style={{ color: "var(--graphite)" }}>≥&thinsp;</span>{nm(b.run24_nm)}</span>;
}

export function Who({ b, sub = true }: { b: BoatStat; sub?: boolean }) {
  return <div style={{ whiteSpace: "nowrap" }}>
    <div className="mont" style={{ fontSize: 13, fontWeight: 600 }}><Swatch colour={b.team.colour} /><Link href={`/skipper/${b.team_id}`} className="who-link">{b.team.name}</Link> <span style={{ fontWeight: 500, color: "var(--graphite)", fontSize: 11 }}>{b.team.country_code}</span><ClassTag team={b.team} /></div>
    {sub && <div style={{ fontStyle: "italic", fontSize: 13, color: "var(--graphite)" }}>{b.team.model}</div>}
    {b.stale && <div className="mont loss" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6 }}>MISSED {hhmm(b.as_of)} REPORT · LAST FIX {hhmm(b.last_fix_at)} UTC</div>}
    {b.restart_at && <div className="mont" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, color: "var(--graphite)" }}>RESTARTED {dayMon(b.restart_at).toUpperCase()} AFTER REPAIRS</div>}
  </div>;
}
// An arrow for the course made good over a 4-hour leg: where the boat went (0° = north, up), never a heading.
export function Course({ deg }: { deg: number }) {   // an arrow pointing where the boat went over the leg: 0 = north (up), 180 = south (down)
  return <svg width="14" height="14" viewBox="0 0 16 16" style={{ verticalAlign: "-2px", marginLeft: 6 }} aria-hidden="true"><g transform={`rotate(${deg} 8 8)`}><path d="M8 14 L8 2 M8 2 L4.5 6 M8 2 L11.5 6" stroke="var(--ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" /></g></svg>;
}
