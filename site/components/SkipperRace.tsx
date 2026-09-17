// site/components/SkipperRace.tsx — the race around one boat: the boat one place ahead, the boat one place behind and the leader,
// each with the gap now and the miles this skipper gained or lost on them in 24 hours (fix to fix: lib/perf gainOn). It stands
// apart from "How <first name> sails", which is about the boat alone. Server-rendered.
import Link from "next/link";
import type { BoatStat, Duel } from "@/lib/db";
import { nm, sgn } from "@/lib/format";
import { gainOn } from "@/lib/perf";
import { duelStory } from "@/lib/duels";
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const who = (x: BoatStat) => x.team.first_name ?? x.team.name;
function Line({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--hair)" }}><span style={{ fontSize: 14 }}>{k}</span><span className={`num ${cls ?? ""}`} style={{ fontSize: 15, whiteSpace: "nowrap" }}>{v}</span></div>;
}
function Rival({ me, other, role, gap, duel, track }: { me: BoatStat; other: BoatStat; role: string; gap: number | null; duel?: Duel; track: boolean }) {
  const g = gainOn(me, other), tone = g == null || Math.round(g) === 0 ? undefined : g > 0 ? "gain" : "loss", ahead = other.rank < me.rank;
  return <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div className="label" style={{ fontSize: 11 }}>{role} · {ord(other.rank)}</div>
    <div className="mont" style={{ fontSize: 17, fontWeight: 600 }}><Link className="who-link" href={`/skipper/${other.team_id}`}>{other.team.name}</Link></div>
    <div className="mont" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.15 }}>{gap == null ? "—" : gap < 1 ? "under 1" : nm(gap)} nm <span style={{ fontSize: 13, fontWeight: 500, color: "var(--graphite)" }}>{ahead ? "ahead" : "behind"}</span></div>
    <Line k={`${who(me)} on ${who(other)}, 24 h`} v={g == null ? "—" : `${sgn(g, 0)} nm`} cls={tone} />
    {g == null && <div className="small" style={{ fontSize: 12 }}>No current fix for {me.stale ? who(me) : who(other)}: no comparison, rather than a false one.</div>}
    {track && <Line k={`Off ${who(other)}’s track`} v={me.lever_nm == null ? "—" : me.lever_dir ? `${nm(me.lever_nm)} nm ${me.lever_dir}` : "on it"} />}
    {duel && <div style={{ fontSize: 13, lineHeight: 1.45, paddingTop: 6 }}><span className="mont" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--gold-text)" }}>DUEL </span>{duelStory(duel, who(ahead ? other : me), who(ahead ? me : other))}{duel.water_nm != null && ` ${Math.round(duel.water_nm)} nm apart on the water.`}</div>}
  </div>;
}
export default function SkipperRace({ b, boats, duels = [] }: { b: BoatStat; boats: BoatStat[]; duels?: Duel[] }) {
  const at = (rank: number) => boats.find(x => x.rank === rank), leader = boats[0];
  const duelWith = (o: BoatStat) => duels.find(d => (d.ahead_id === b.team_id && d.behind_id === o.team_id) || (d.ahead_id === o.team_id && d.behind_id === b.team_id));
  // The leader looks back at the next two boats; everybody else at the boat ahead, the boat behind, and the leader if that is a third boat.
  const rivals: { other: BoatStat; role: string; gap: number | null }[] = [];
  const ahead = at(b.rank - 1), behind = at(b.rank + 1), third = at(b.rank + 2);
  if (ahead) rivals.push({ other: ahead, role: "Ahead", gap: b.interval_nm });
  if (behind) rivals.push({ other: behind, role: "Behind", gap: behind.interval_nm });
  if (b.rank === 1 && third) rivals.push({ other: third, role: "Behind", gap: third.gap_nm });
  if (b.rank > 2 && leader) rivals.push({ other: leader, role: "The leader", gap: b.gap_nm });
  if (!rivals.length) return null;
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="rule-title"><div className="label">The race around {who(b)}</div><div className="small" style={{ fontStyle: "italic" }}>the boats next to {who(b)} in the ranking{b.rank > 2 ? ", and the leader" : ""} · gaps by distance to finish · miles gained (+) or lost (−) in 24 hours, fix to fix</div></div>
    <div className="stack" style={{ display: "grid", gridTemplateColumns: `repeat(${rivals.length}, minmax(0,1fr))`, gap: 16 }}>
      {rivals.map(r => <Rival key={r.other.team_id} me={b} other={r.other} role={r.role} gap={r.gap} duel={duelWith(r.other)} track={r.other.team_id === leader.team_id} />)}
    </div>
  </div>;
}
