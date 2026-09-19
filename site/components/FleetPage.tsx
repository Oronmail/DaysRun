// site/components/FleetPage.tsx — the Fleet page body. Until 19 Sep 2026 it was shared by / and two addresses, /w/4h and /w/7d, that swapped
// one column of the ranking; the table now carries all three paces at once and both addresses redirect here (next.config.ts).
import Link from "next/link";
import Shell from "@/components/Shell";
import Dateline from "@/components/Dateline";
import Tiles from "@/components/Tiles";
import RankingTable from "@/components/RankingTable";
import { boatTip } from "@/lib/tips";
import RankingList from "@/components/RankingList";
import { BARS_LEGEND } from "@/components/SpeedBars";
import FleetMap, { type Marker } from "@/components/FleetMap";
import { fleetView } from "@/lib/geo";
import { TRACKER_URL } from "@/lib/text";
import RaceChart from "@/components/RaceChart";
import Duels from "@/components/Duels";
import { latestFleet, boatStats, raceSetup, eventsRecent, dailyPlaces, duelsAt, boatPerf } from "@/lib/db";
import { nm, hhmm, dayMon, dayMonTime } from "@/lib/format";

export default async function FleetPage() {
  const fleet = await latestFleet();
  const [boats, setup, events, days, duels, perf] = await Promise.all([boatStats(fleet.as_of), raceSetup(), eventsRecent(6), dailyPlaces(), duelsAt(fleet.as_of), boatPerf(fleet.as_of)]);
  const wind = new Map(perf.map(p => [p.team_id, p]));
  const rows = boats.map(b => ({ ...b, wind_ratio: wind.get(b.team_id)?.wind_ratio ?? null, wind_legs: wind.get(b.team_id)?.wind_legs ?? 0 }));   /* the ranking shows and sorts by speed for the wind */
  const lead = boats[0]; const best = boats.reduce((a, b) => (b.best24_nm > a.best24_nm ? b : a), boats[0]);
  const bestRun = boats.find(b => b.team_id === fleet.best_run24_team_id);
  const view = fleetView(boats, 358);
  // No names on the chart: the pointer shows a boat's name, and four permanent labels out of sixteen said little (owner, 17 Sep).
  const markers: Marker[] = boats.map(b => ({ lat: b.lat, lon: b.lon, kind: b.rank === 1 ? "lead" : "boat", colour: b.team.colour, name: b.team.first_name ?? b.team.name, href: `/skipper/${b.team_id}`, tip: boatTip(b) }));
  return <Shell active="Fleet" dateline={<Dateline asOf={fleet.as_of} raceDay={fleet.race_day} />} title="FLEET POSITIONS" note={`${lead.team.first_name} ${nm(lead.next_mark_nm)} nm from ${lead.next_mark}`}>
    <Tiles items={[
      { k: "Leader", v: lead.team.name, s: `${lead.team.model} · ${nm(lead.dtf_nm)} nm to go` },
      { k: "Best 24-hour run so far", v: `${nm(best.best24_nm)} nm`, s: `${best.team.name} · ${best.team.model} · ${dayMon(best.best24_at)}` },
      { k: "Fleet spread", v: `${nm(fleet.spread_nm)} nm`, s: "from the leader to the last boat" },
      { k: `Against the ghosts, race day ${fleet.race_day}`, v: `${fleet.ahead_vdh} of ${fleet.racing}`, s: `ahead of Van Den Heede’s 2018 pace · ${fleet.ahead_kirsten} ahead of Neuschäfer’s 2022` },
    ]} />
    <div className="grid2">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="rule-title"><div className="label">Ranking by distance to finish</div><div className="small only-desktop" style={{ fontStyle: "italic", marginRight: "auto", paddingLeft: 12 }}>select a skipper for the full analysis</div></div>
        <div className="only-desktop table-scroll"><RankingTable boats={rows} /></div>
        <div className="only-phone"><RankingList boats={rows} /></div>
        <div className="small only-desktop" style={{ paddingTop: 4 }}>Every number on this page, day by day and report by report, as an Excel file: <a href="/data">Data</a></div>
        <div className="small" style={{ fontSize: 12 }}>{BARS_LEGEND}{bestRun && ` · ${bestRun.team.first_name} sailed the fleet's longest run of the last 24 hours`}</div>
      </div>
      <aside style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div className="ord-first" style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">The fleet at {hhmm(fleet.as_of)} UTC</div></div>
          <div style={{ border: "1px solid var(--ink)", padding: 6, background: "var(--panel)" }}><FleetMap view={view} course={setup.raw_setup.course.nodes} markers={markers} next={{ name: lead.next_mark, from: lead, text: `${lead.next_mark} ${nm(lead.next_mark_nm)} nm` }} /></div>
          <div className="small" style={{ fontSize: 12 }}>Point at a boat for the skipper’s name, place, miles to go and latest leg; select it for the skipper’s page. Positions here are the 4-hourly reports. To follow the boats live: <a href={TRACKER_URL} target="_blank" rel="noopener noreferrer">the official GGR tracker ↗</a></div></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><div className="rule-title"><div className="label">Next mark</div></div>
          <div className="small">Estimated arrival, UTC: distance to the mark ÷ made-good speed over the last 7 days.</div>
          {boats.slice(0, 5).map(b => <div key={b.team_id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--hair)" }}><span className="mont" style={{ fontSize: 13, fontWeight: 600 }}>{b.team.name}{b.stale && <span className="loss" style={{ display: "block", fontSize: 10, letterSpacing: 0.6 }}>FROM THE {hhmm(b.last_fix_at)} UTC FIX</span>}</span><span className="num small" style={{ fontSize: 12 }}><span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>{b.next_mark}</span> {nm(b.next_mark_nm)} nm</span><span className="num" style={{ fontSize: 13, ...(b.stale ? { color: "var(--graphite)", fontStyle: "italic" } : {}) }}>{dayMonTime(b.next_mark_eta)}</span></div>)}
          <a href="/course" style={{ fontSize: 13, marginTop: 6 }}>All sixteen, and every mark</a></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div className="rule-title"><div className="label">What changed</div></div>
          {events.map((e, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.35 }}>{e.title}<span className="small" style={{ fontSize: 12 }}> · {dayMonTime(e.at)}</span></div>)}</div>
      </aside>
    </div>
    <Duels duels={duels} boats={boats} />
    <RaceChart days={days} boats={boats} />
  </Shell>;
}
