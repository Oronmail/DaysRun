// site/components/SkipperPerformance.tsx — how this one boat is sailed, next to the rest of the fleet. The same numbers as the
// Performance page (worker/ggrstats/perf.py), read for a single skipper. Model wind and course made good: see Method.
// Everything here is about the boat herself; her race against the boats around her is SkipperRace.
import Link from "next/link";
import type { BoatPerf, BoatStat } from "@/lib/db";
import { kn, nm, sgn } from "@/lib/format";
import { median, rankOf, restOfFleetBandSpeed, extraMiles, type Band } from "@/lib/perf";
const BANDS: Band[] = ["upwind", "reaching", "running"];
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const tone = (n: number | null | undefined) => (n == null || Math.abs(n) < 0.05 ? undefined : n > 0 ? "gain" : "loss");
function Row({ k, v, note, cls }: { k: string; v: React.ReactNode; note?: React.ReactNode; cls?: string }) {
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--hair)", alignItems: "baseline" }}>
    <div style={{ fontSize: 14 }}>{k}{note && <div className="small" style={{ fontSize: 12 }}>{note}</div>}</div><div className={`num ${cls ?? ""}`} style={{ fontSize: 15, whiteSpace: "nowrap" }}>{v}</div></div>;
}
const WEEK_MS = 7 * 86400 * 1000;
export default function SkipperPerformance({ b, perf, boats }: { b: BoatStat; perf: BoatPerf[]; boats: BoatStat[] }) {
  const p = perf.find(x => x.team_id === b.team_id); if (!p) return null;
  // Runs are ranked among the boats they can be compared with: a current fix for the 24-hour run; a full week at sea since a
  // restart for the 7-day run (until then the figure counts from the restart and is not ranked).
  const fullWeek = (x: BoatStat) => !x.restart_at || new Date(x.as_of).getTime() - new Date(x.restart_at).getTime() >= WEEK_MS;
  const run24 = b.stale ? null : rankOf(boats.filter(x => !x.stale).map(x => x.run24_nm), b.run24_nm);
  const run7 = fullWeek(b) ? rankOf(boats.filter(fullWeek).map(x => x.run7_nm), b.run7_nm) : null;
  const extraMid = median(boats.filter(x => x.team_id !== b.team_id).map(extraMiles).filter((x): x is number => x != null));
  const first = b.team.first_name ?? b.team.name, ratios = perf.map(x => x.wind_ratio), rated = ratios.filter((x): x is number => x != null);
  const place = rankOf(ratios, p.wind_ratio), mid = median(rated), lo = Math.min(...rated), hi = Math.max(...rated);
  const others = perf.filter(x => x.team_id !== b.team_id), share5 = median(others.map(x => x.share5_7).filter((x): x is number => x != null));
  const W = 250, X = (v: number) => 4 + (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (W - 8);
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="rule-title"><div className="label">How {first} sails</div><div className="small" style={{ fontStyle: "italic" }}>against the rest of the fleet · model wind, course made good · <Link href="/performance">all sixteen</Link></div></div>
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}><div className="label" style={{ fontSize: 11 }}>Speed for the wind</div>
        {p.wind_ratio == null ? <div style={{ fontSize: 14, lineHeight: 1.5 }}>Not rated yet: {p.wind_legs} of the ten legs in 8–25 kt it takes{b.restart_at ? ", counted from the restart" : ""}.</div> : <>
          <div className="mont" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>{pct(p.wind_ratio)}</div>
          <div className="small">{place && `${ord(place.place)} of ${place.of} rated boats`} · boat speed as a share of wind speed</div>
          {rated.length > 1 && <svg width={W} height={34} viewBox={`0 0 ${W} 34`} style={{ display: "block", marginTop: 4 }} role="img" aria-label="Where this boat stands in the fleet's range">
            <line x1={X(lo)} y1={12} x2={X(hi)} y2={12} stroke="var(--rule)" strokeWidth={2} />{mid != null && <line x1={X(mid)} y1={6} x2={X(mid)} y2={18} stroke="var(--graphite)" />}
            <circle cx={X(p.wind_ratio)} cy={12} r={5.5} fill={b.rank === 1 ? "var(--gold)" : "var(--series-1)"} stroke="var(--panel)" strokeWidth={2} />
            <text x={X(lo)} y={31} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{pct(lo)}</text><text x={X(hi)} y={31} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{pct(hi)}</text>
            {mid != null && <text x={X(mid)} y={31} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">median {pct(mid)}</text>}</svg>}
          <div className="small" style={{ fontSize: 12 }}>{p.wind_legs} legs in 8–25 kt of wind since {b.restart_at ? "the restart" : "the start"}.</div></>}</div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}><div className="label" style={{ fontSize: 11 }}>Point of sail</div>
        {BANDS.map(k => { const z = p.pos_json[k], rest = restOfFleetBandSpeed(perf, k, b.team_id), d = z && z.legs >= 3 && rest != null ? z.speed_kn - rest : null;
          return <Row key={k} k={k[0].toUpperCase() + k.slice(1)} note={z ? `${pct(z.share)} of legs · the others ${rest == null ? "—" : `${kn(rest)} kt`}` : "no legs yet"} v={z && z.legs >= 3 ? <>{kn(z.speed_kn)} kt {d != null && <span className={tone(d)} style={{ fontSize: 12 }}>{sgn(d)}</span>}</> : "—"} />; })}
        <div className="small" style={{ fontSize: 12, paddingTop: 4 }}>Average speed on 4-hour legs; a speed shows from three legs.</div></div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}><div className="label" style={{ fontSize: 11 }}>Steadiness, last 7 days</div>
        <Row k="Legs at 5 kt or more" note={share5 == null ? undefined : `the others’ median ${pct(share5)}`} v={pct(p.share5_7)} />
        <Row k="Spread of leg speeds" v={p.sd7 == null ? "—" : `±${kn(p.sd7)} kt`} />
        <Row k="Hours under 2 kt" v={p.parked_h7 == null ? "—" : `${p.parked_h7} h`} cls={(p.parked_h7 ?? 0) >= 8 ? "loss" : undefined} />
        <Row k="Night against day" note={`${p.n_night} night and ${p.n_day} day legs`} v={p.night_delta == null ? "—" : `${sgn(p.night_delta)} kt`} /></div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}><div className="label" style={{ fontSize: 11 }}>Runs and the road sailed</div>
        <Row k="24-hour run" note={b.stale ? "no current fix" : run24 ? `${ord(run24.place)} of ${run24.of} boats with a current fix` : undefined} v={b.stale || b.run24_nm == null ? "—" : `${nm(b.run24_nm)} nm`} />
        <Row k="7-day run" note={run7 ? `${ord(run7.place)} of ${run7.of}` : b.restart_at ? "counted from the restart, not ranked yet" : undefined} v={b.run7_nm == null ? "—" : `${nm(b.run7_nm)} nm`} />
        <Row k="Against the boats nearby" note={b.vs_near_nm == null ? "fewer than two boats within 150 nm" : `24-hour run against ${b.near_n} boats within 150 nm, the same weather near enough`} v={b.vs_near_nm == null ? "—" : `${sgn(b.vs_near_nm, 0)} nm`} cls={tone(b.vs_near_nm)} />
        <Row k="Extra miles sailed" note={extraMiles(b) == null ? (b.restart_at ? "not comparable after a restart" : undefined) : `${nm(b.sailed_nm)} sailed for ${nm(b.made_good_nm)} made good${extraMid == null ? "" : ` · the others’ median ${sgn(extraMid * 100, 0)}%`}`} v={extraMiles(b) == null ? "—" : `${sgn(extraMiles(b)! * 100, 0)}%`} /></div>
    </div>
  </div>;
}
