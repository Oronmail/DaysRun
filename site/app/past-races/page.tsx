// site/app/past-races/page.tsx — the fleet of 2026 against the whole fleets of 2018 and 2022, race day for race day. Reads the
// three edition tables; every sentence with a number in it comes from lib/editions.ts, where it is tested, and the page itself
// holds only labels, values and words that carry no figure. Each fleet is measured on ITS OWN course (the owner, 19 Sep 2026):
// nothing here is projected onto another year's line.
import Shell from "@/components/Shell";
import Dateline from "@/components/Dateline";
import YearLines from "@/components/YearLines";
import PointsChart from "@/components/PointsChart";
import WindShares from "@/components/WindShares";
import { Legend } from "@/components/Charts";
import { editionDays, editionBoatDays, editionBoatSeries, editionMilestones, teamsOf, type EditionDay, type EditionBoatDay, type PastTeam } from "@/lib/db";
import { YEARS, YEAR_LABEL, YEAR_COLOR, YEAR_TEXT, COURSE_NM, START_AT, RETURNING, VETERAN_HULLS, MILESTONE_ORDER, latestDay, sameDay, series, boatSeries, sevenDayMean, pointTip, fleetWind, windWords, takeaways, roadRow, roadWords, latDM, attemptCard, milestoneCells, milestonesAsOf, bestSoFar, shareOfCourse, raceDayLabel, startWords, type Year } from "@/lib/editions";
import { nm, kn, dayMon, sgn } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
export const revalidate = 900;
export const metadata = pageMeta("/past-races");

const GRAPHITE = { fontSize: 13, color: "var(--graphite)" } as const;
const PARA = { fontSize: 15, lineHeight: 1.55 } as const;

export default async function Page() {
  const [days, ms, t26, t22, t18] = await Promise.all([editionDays(), editionMilestones(), teamsOf("ggr2026"), teamsOf("ggr2022"), teamsOf("ggr2018")]);
  const T: Record<Year, PastTeam[]> = { ggr2026: t26, ggr2022: t22, ggr2018: t18 };
  const teamOf = (y: Year, id: number | null) => (id == null ? undefined : T[y].find(t => t.id === id));
  // First name for this year's skippers, full name for the sailors of the past races — the site's rule everywhere.
  const who = (y: Year, id: number | null) => { const t = teamOf(y, id); return t ? (y === "ggr2026" ? t.first_name ?? t.name : t.name) : "—"; };
  const starters = (y: Year) => T[y].length;

  const today = latestDay(days), D = today.race_day;
  const same = sameDay(days, D);
  const by = Object.fromEntries(same.map(d => [d.race_key, d])) as Partial<Record<Year, EditionDay>>;
  const dayRows = await Promise.all(YEARS.map(y => editionBoatDays(y, D)));
  const B = Object.fromEntries(YEARS.map((y, i) => [y, dayRows[i]])) as Record<Year, EditionBoatDay[]>;
  const mine = await editionBoatSeries("ggr2026", RETURNING.map(r => r.team_2026));
  const attempts = await Promise.all(RETURNING.map(async r => ({ ...r, now: mine.filter(b => b.team_id === r.team_2026),
    races: await Promise.all(r.races.map(async x => ({ ...x, rows: await editionBoatSeries(x.race_key, [x.team_id]) }))) })));
  const hullRows = await Promise.all(VETERAN_HULLS.flatMap(h => h.races.map(async x => ({ h, x, then: (await editionBoatSeries(x.race_key, [x.team_id])).find(b => b.race_day === D) }))));

  const words = takeaways({ now: today, y2022: by.ggr2022, y2018: by.ggr2018, leaderFirst: who("ggr2026", today.leader_team_id) });
  const wind = Object.fromEntries(YEARS.map(y => [y, fleetWind(days, y, D)])) as Record<Year, ReturnType<typeof fleetWind>>;
  const road = Object.fromEntries(YEARS.map(y => [y, roadRow(B[y])])) as Record<Year, ReturnType<typeof roadRow>>;
  const msAsOf = milestonesAsOf(ms, today.as_of);
  const mgOn = (y: Year, id: number) => B[y].find(b => b.team_id === id)?.mg_nm ?? null;

  // The chart of the ocean: one point per boat still in its own race that day. A boat out of the race is left off — a berth in
  // A Coruña is not where a fleet sailed, and one stretched the view five degrees of latitude past the boats that were racing.
  const marks = YEARS.flatMap(y => B[y].filter(b => b.lat != null && b.lon != null && (b.racing || b.finished)).map(b => {
    const t = teamOf(y, b.team_id);
    return { lat: b.lat!, lon: b.lon!, year: y, tip: pointTip(b, t ?? { name: "Unknown", first_name: null, yacht: null, model: null }, by[y]?.fresh ?? B[y].length),
      href: y === "ggr2026" ? `/skipper/${b.team_id}` : undefined, label: `${t?.name ?? "Unknown"}, ${YEAR_LABEL[y]}` };
  }));
  const lats = marks.map(p => p.lat), lons = marks.map(p => p.lon);
  const view = { lon0: Math.floor(Math.min(...lons)) - 3, lon1: Math.ceil(Math.max(...lons)) + 3, lat0: Math.floor(Math.min(...lats)) - 2, lat1: Math.ceil(Math.max(...lats)) + 2, width: 330 };
  const LAND = [{ name: "Lisbon", lat: 38.72, lon: -9.2 }, { name: "Madeira", lat: 32.75, lon: -17.0, side: "l" as const },
    { name: "Lanzarote", lat: 29.05, lon: -13.45 }, { name: "Gran Canaria", lat: 27.95, lon: -15.6, side: "l" as const }];

  const LEG: [string, string][] = YEARS.map(y => [YEAR_LABEL[y], YEAR_COLOR[y]]);
  const yearRow = (y: Year, v: string, s: string) =>
    <div key={y} style={{ display: "grid", gridTemplateColumns: "44px auto 1fr", gap: 10, alignItems: "baseline" }}>
      <span className="mont" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: YEAR_TEXT[y] }}>{YEAR_LABEL[y]}</span>
      <span className={y === "ggr2026" ? "mont" : "num"} style={{ fontSize: y === "ggr2026" ? 26 : 16, fontWeight: y === "ggr2026" ? 600 : 400 }}>{v}</span>
      <span style={{ fontSize: 12, color: "var(--graphite)" }}>{s}</span>
    </div>;
  const TILES: { k: string; f: (d: EditionDay, y: Year) => [string, string] }[] = [
    { k: `Boats racing · day ${D}`, f: (d, y) => [`${d.racing} of ${starters(y)}`, d.finished ? `${d.finished} finished` : "still racing"] },
    { k: "Leader · miles made good", f: (d, y) => [nm(d.leader_mg_nm), `${who(y, d.leader_team_id)} · ${shareOfCourse(d.leader_mg_nm, y)} of its course`] },
    { k: "Middle of the fleet", f: d => [nm(d.median_mg_nm), "nm made good"] },
    { k: `Best 24-hour run to day ${D}`, f: (d, y) => { const b = bestSoFar(d); return b ? [nm(b.nm), `${who(y, b.teamId)} · ${dayMon(b.at)}`] : ["—", "no run measured yet"]; } },
  ];
  const mgLines = (maxDay: number, label: boolean) => YEARS.flatMap(y => [
    { color: YEAR_COLOR[y], gold: y === "ggr2026", width: y === "ggr2026" ? 2.8 : 2, pts: series(days, y, "leader_mg_nm", maxDay), end: label ? YEAR_LABEL[y] : y === "ggr2026" ? YEAR_LABEL[y] : undefined },
    { color: YEAR_COLOR[y], gold: y === "ggr2026", width: 1.6, dash: true, pts: series(days, y, "median_mg_nm", maxDay) }]);

  return <Shell active="Past races" dateline={<Dateline asOf={today.as_of} raceDay={D} />} title="PAST RACES"
    note={words.lead.replace(/^On day \d+ /, "")} sub="the fleet of 2026 against the fleets of 2018 and 2022, race day for race day">
    <div style={{ maxWidth: 860, fontSize: 19, lineHeight: 1.5 }}>The Ghost race sets each boat against one past voyage. This page sets the whole fleet against the whole fleets of the two modern races: every boat of 2022 and 2018, from YB’s archives, measured by the same rules as this year’s, each fleet on the course it sailed.</div>

    {/* The day, in four tiles: three years in each, newest first. */}
    <div className="tiles past">{TILES.map(t => <div className="tile" key={t.k}><div className="k">{t.k}</div>
      {same.map(d => { const y = d.race_key as Year, [v, s] = t.f(d, y); return yearRow(y, v, s); })}</div>)}</div>

    {/* Miles made good: the race so far (leads) and the whole race (side). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The race so far</div><div className="small" style={{ fontStyle: "italic" }}>nm made good, each fleet on its own course, days 1 to 30</div></div>
        <Legend items={[...LEG, ["leader", "var(--graphite)"], ["middle of the fleet (dashed)", "var(--graphite)"]]} />
        <div className="panel"><YearLines width={900} height={400} R={70} xmax={30} ymax={3600} yticks={[0, 900, 1800, 2700, 3600]} xticks={[0, 5, 10, 15, 20, 25, 30]} lines={mgLines(30, true)} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
        <div className="rule-title"><div className="label">The whole race</div><div className="small" style={{ fontStyle: "italic" }}>start to the last finisher</div></div>
        <div className="panel"><YearLines width={380} height={250} R={34} xmax={330} ymax={27000} yticks={[0, 9000, 18000, 27000]} xticks={[0, 100, 200, 300]} lines={mgLines(330, false)} /></div>
        <div style={PARA}>{words.lead}{words.middle ? ` ${words.middle}` : ""}</div>
      </div>
    </div>

    {/* The wind they had (leads) and where it came from (side). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The wind they had</div><div className="small" style={{ fontStyle: "italic" }}>mean model wind at the boats, by race day</div></div>
        <Legend items={LEG} />
        <div className="panel"><YearLines width={900} height={330} R={70} xmax={30} ymax={24} yticks={[0, 6, 12, 18, 24]} xticks={[0, 5, 10, 15, 20, 25, 30]} ylab={v => `${v} kt`}
          lines={YEARS.map(y => ({ color: YEAR_COLOR[y], gold: y === "ggr2026", width: y === "ggr2026" ? 2.8 : 2, pts: series(days, y, "wind_kt", 30), end: YEAR_LABEL[y] }))} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">And where it came from</div><div className="small" style={{ fontStyle: "italic" }}>share of legs, days 1 to {D}</div></div>
        <WindShares rows={YEARS.map(y => ({ year: y, upwind: wind[y].upwind, reaching: wind[y].reaching, running: wind[y].running }))} />
        <div style={{ display: "flex", gap: 18, ...GRAPHITE, fontSize: 12 }}><span>on the nose</span><span>across</span><span>from behind</span></div>
        <table className="data"><thead><tr><th>Fleet</th><th className="r">Mean wind</th><th className="r">Legs</th><th className="r two">Fleet’s mean 24-hour run</th></tr></thead>
          <tbody>{YEARS.map(y => <tr key={y}><td className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[y] }}>{YEAR_LABEL[y]}</td>
            <td className="num r">{kn(wind[y].kt)} kt</td><td className="num r">{wind[y].legs.toLocaleString("en-US")}</td><td className="num r">{nm(wind[y].run)} nm</td></tr>)}</tbody></table>
        <div style={PARA}>{windWords({ raceDay: D, now: wind.ggr2026, y2022: wind.ggr2022, y2018: wind.ggr2018 })}</div>
      </div>
    </div>

    {/* The road taken: the chart of the ocean, and the three fleets of the same race day beside it. */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "360px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The road taken</div></div>
        <div className="small" style={{ fontStyle: "italic" }}>every boat on day {D} of its own race · point at a boat, or tap it</div>
        <Legend items={LEG} />
        {marks.length > 0 && <div className="panel"><PointsChart view={view} points={marks} labels={LAND} /></div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Three fleets on the same day</div><div className="small" style={{ fontStyle: "italic" }}>race day {D}</div></div>
        <table className="data"><thead><tr><th>Fleet</th><th className="r">Boats with a fix</th><th className="r">Middle of the fleet is at</th><th className="r two">Span of latitude, north to south</th><th className="r two">Miles sailed per 100 made good</th></tr></thead>
          <tbody>{YEARS.map(y => <tr key={y}><td className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[y] }}>{YEAR_LABEL[y]}</td>
            <td className="num r">{road[y].boats}</td><td className="num r">{road[y].midLat == null ? "—" : latDM(road[y].midLat!)}</td>
            <td className="num r">{road[y].spanNm == null ? "—" : `${nm(road[y].spanNm)} nm`}</td><td className="num r">{by[y]?.straight_pct == null ? "—" : Math.round(by[y]!.straight_pct!)}</td></tr>)}</tbody></table>
        <div style={PARA}>{roadWords(D, road.ggr2026, road.ggr2022, road.ggr2018)}</div>
        <div className="small">Latitude alone does not say who is winning: a boat further south can be further from the finish. The miles are in the chart above it.</div>
      </div>
    </div>

    {/* Second attempts: a card per returning skipper. */}
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="rule-title"><div className="label">Second attempts</div><div className="small" style={{ fontStyle: "italic" }}>each skipper against that skipper’s own earlier race, days 1 to 30 · ✕ where the earlier race ended</div></div>
      <div className="cards">{attempts.map(a => {
        const head = a.races[0] ? attemptCard(a.now, a.races[0].rows, teamOf(a.races[0].race_key, a.races[0].team_id) ?? { ended_how: null, ended_where: null }, D) : null;
        const nowMg = a.now.find(b => b.race_day === D)?.mg_nm ?? null;
        return <div key={a.team_2026} className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span className="mont" style={{ fontSize: 20, fontWeight: 600 }}>{a.first}</span>
            {head?.diff != null && <span className={`num ${head.diff >= 0 ? "gain" : "loss"}`} style={{ fontSize: 15 }}>{sgn(head.diff, 0)} nm</span>}
          </div>
          <div style={{ ...GRAPHITE, fontSize: 12 }}>{a.races.map(x => `day ${D} of ${YEAR_LABEL[x.race_key]}: ${nm(x.rows.find(b => b.race_day === D)?.mg_nm)}`).join(" · ")} · today: {nm(nowMg)}</div>
          <YearLines width={320} height={210} R={44} xmax={30} ymax={3600} yticks={[0, 1200, 2400, 3600]} xticks={[0, 10, 20, 30]} lines={[
            { color: YEAR_COLOR.ggr2026, gold: true, width: 2.8, pts: boatSeries(a.now, 30), end: "2026" },
            ...a.races.map(x => { const c = attemptCard(a.now, x.rows, teamOf(x.race_key, x.team_id) ?? { ended_how: null, ended_where: null }, D);
              return { color: YEAR_COLOR[x.race_key], width: 2, pts: boatSeries(x.rows, 30), ended: c.endDay != null && c.endDay <= 30 ? `day ${c.endDay}` : undefined }; })]} />
          {a.races.map(x => { const t = teamOf(x.race_key, x.team_id); const c = attemptCard(a.now, x.rows, t ?? { ended_how: null, ended_where: null }, D);
            return <div key={x.race_key} style={{ fontSize: 13, lineHeight: 1.5 }}><span className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[x.race_key] }}>{YEAR_LABEL[x.race_key]}</span> · {c.endText}. {c.pass}.</div>; })}
        </div>;
      })}</div>
    </div>

    {/* Behind the lines (words) and the hulls that have been here before (table). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "360px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Behind the lines</div></div>
        <div style={PARA}>Damien turned back to Les Sables-d’Olonne in 2022 with the self-steering broken and started again days after the fleet, which is why that line begins so flat; the same gear ended the race at Cape Town. Pat’s 2022 ended at Cape Town as well. Ertan is on a third start, after A Coruña in 2018 and Cape Town in 2022, both given up by choice. Guy’s 2022 ended early, aground on Fuerteventura.</div>
        <div style={PARA}>A line that stops is a race that stopped. Where a skipper sailed on in the Chichester class after a stop, the line goes on with the race.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Hulls that have been here before</div><div className="small" style={{ fontStyle: "italic" }}>nm made good on day {D}</div></div>
        <table className="data"><thead><tr><th>Hull</th><th>Then</th><th className="r">nm</th><th>Now</th><th className="r">nm</th></tr></thead>
          <tbody>{hullRows.map(({ h, x, then }) => <tr key={`${h.team_2026}-${x.race_key}-${x.team_id}`}>
            <td><i>{h.yacht_2026}</i><div style={{ ...GRAPHITE, fontSize: 11 }}>{h.design}</div></td>
            <td><span className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[x.race_key] }}>{YEAR_LABEL[x.race_key]}</span> {who(x.race_key, x.team_id)}<div style={{ ...GRAPHITE, fontSize: 11 }}>{x.yacht_then === h.yacht_2026 ? x.note : <>as <i>{x.yacht_then}</i> · {x.note}</>}</div></td>
            <td className="num r">{nm(then?.mg_nm)}</td>
            <td><span className="mont" style={{ fontWeight: 700, color: YEAR_TEXT.ggr2026 }}>2026</span> {who("ggr2026", h.team_2026)}</td>
            <td className="num r">{nm(mgOn("ggr2026", h.team_2026))}</td></tr>)}</tbody></table>
        <div className="small">A hull is the same boat, not the same race: rigs, sails and gear change between owners.</div>
      </div>
    </div>

    {/* Milestones: the marks that mean the same thing in every fleet. */}
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="rule-title"><div className="label">Milestones</div><div className="small" style={{ fontStyle: "italic" }}>the race day of the first boat, its date, and the day the middle of the fleet passed</div></div>
      <div className="table-scroll"><table className="data">
        <thead><tr><th>Milestone</th>{YEARS.map(y => <th key={y} colSpan={3} style={{ color: YEAR_TEXT[y], textAlign: "center" }}>{YEAR_LABEL[y]} · started {dayMon(START_AT[y])}</th>)}</tr>
          <tr><th /> {YEARS.flatMap(y => [<th key={`${y}f`}>First boat</th>, <th key={`${y}m`} className="r">Middle of the fleet</th>, <th key={`${y}p`} className="r">Boats past</th>])}</tr></thead>
        <tbody>{MILESTONE_ORDER.map(name => <tr key={name}><td style={{ fontWeight: 600 }}>{name}</td>
          {YEARS.flatMap(y => { const c = milestoneCells(msAsOf, y, name, starters(y));
            const winner = name === "Finish" ? T[y].find(t => (t.class_note ?? "").includes("the winner")) : undefined;
            return [
              <td key={`${y}f`}>{c.first ? <>{raceDayLabel(c.first.race_day, c.first.passed_at)}<div style={{ ...GRAPHITE, fontSize: 11 }}>{who(y, c.first.team_id)}{winner && winner.id !== c.first.team_id ? ` · ${winner.name} won` : ""}</div></> : "—"}</td>,
              <td key={`${y}m`} className="num r">{c.middle ? `day ${c.middle.race_day}` : c.passed ? <span style={GRAPHITE}>fewer than half</span> : "—"}</td>,
              <td key={`${y}p`} className="num r">{c.passed ? `${c.passed} of ${starters(y)}` : "—"}</td>];
          })}</tr>)}</tbody></table></div>
      <div className="small">Lanzarote and Hobart are each race’s own timing through its gate, from YB’s record: 2018 has none at Lanzarote, although the race had the gate. The equator, the Cape of Good Hope and Cape Horn are crossings of a line on the chart, and mean the same thing in every fleet. The middle of the fleet is of the starters, so it stays blank until half of them are past.</div>
    </div>

    {/* 24-hour runs: the day (leads) and the whole race smoothed (side). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The fleet’s average 24-hour run</div><div className="small" style={{ fontStyle: "italic" }}>nm sailed, days 2 to 30</div></div>
        <Legend items={LEG} />
        <div className="panel"><YearLines width={900} height={330} R={70} xmax={30} ymax={180} yticks={[0, 60, 120, 180]} xticks={[0, 5, 10, 15, 20, 25, 30]}
          lines={YEARS.map(y => ({ color: YEAR_COLOR[y], gold: y === "ggr2026", width: y === "ggr2026" ? 2.8 : 2, pts: series(days, y, "mean_run_nm", 30), end: YEAR_LABEL[y] }))} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
        <div className="rule-title"><div className="label">Over the whole race</div><div className="small" style={{ fontStyle: "italic" }}>mean of seven days</div></div>
        <div className="panel"><YearLines width={380} height={250} R={34} xmax={330} ymax={180} yticks={[0, 60, 120, 180]} xticks={[0, 100, 200, 300]}
          lines={YEARS.map(y => ({ color: YEAR_COLOR[y], gold: y === "ggr2026", width: y === "ggr2026" ? 2.8 : 2, pts: sevenDayMean(series(days, y, "mean_run_nm", 330)), end: y === "ggr2026" ? YEAR_LABEL[y] : undefined }))} /></div>
        <div style={PARA}>A day counts only the boats that were moving and had all six legs. What changes from race to race is how many of the days are bad ones.</div>
      </div>
    </div>

    {/* How this is measured, and what not to read into it. */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">How this is measured</div></div>
        <div style={PARA}>Every fleet keeps YB Tracking’s own distance to finish, and miles made good are that race’s own course length less that distance — each fleet on the course it sailed. Nothing is laid on another year’s line, so the fleets are compared race day for race day, not mile for mile.</div>
        <div style={PARA}>A race day is the same day of each race, counted from that race’s own gun. A boat counts as racing until the day its race ended, as the race itself recorded it: where a tracker went on transmitting from a harbour or an abandoned hull, the recorded end wins over the track.</div>
        <div style={PARA}>A day’s figures come from the 00:00 UTC report, using each boat’s fix within twenty minutes of it. A 24-hour run is the miles sailed over the six 4-hour legs to that report. The wind is model wind at the end of each leg, and the point of sail is the course the boat made good over those four hours, never its heading.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Read with care</div></div>
        <div style={PARA}>The three fleets sailed three courses: {nm(COURSE_NM.ggr2026)} nm this year, {nm(COURSE_NM.ggr2022)} in 2022 and {nm(COURSE_NM.ggr2018)} in 2018. 2018 did not round Trindade, and only 2022 had gates at Cape Town and Punta del Este. Trindade takes the fleet round the South Atlantic high and sets the angle for the Cape of Good Hope; it is a routing mark, not a different race. So the day is the comparison, and the miles are each race’s own.</div>
        <div style={PARA}>All three races had a gate at Lanzarote, but YB’s record of 2018 holds no timing there, so 2018’s Lanzarote milestone is blank rather than guessed. {startWords()}</div>
        <div style={PARA}>2018 has {starters("ggr2018")} starters here, not the eighteen boats that entered: Francesco Cappelletti never crossed the start line. Almost no boat of 2018 has a 24-hour run on race day nine, when the fleet’s reporting rhythm changed through a six-hour silence; from the fourth to the ninth of July 2018 the fleet reported every three hours, and a missing four-hour slot there is filled between two reports at most three hours and twenty minutes apart — never this year.</div>
        <div style={PARA}>YB’s record carries no distance to finish for the last month of Mark Slats’s 2018 race, so the miles made good and the place are blank on those days, although the positions and the 24-hour runs are real; the 2018 leader and middle of the fleet are then of the boats that have a distance.</div>
        <div style={PARA}>The middle of the fleet is of the boats still racing that day, so it climbs as boats retire: late in a race it describes the survivors. A boat that is not moving — a 4-hour leg slower than a fifth of a knot — is left out of the fleet’s mean and best run for as long as it lies there.</div>
        <div style={PARA}>The wind is model wind, never measured on board: Open-Meteo’s archive of the ECMWF model for 2018 and 2022, and the model wind this site stores for this year. Twelve days of weather are shared by a whole fleet, so read a knot between years as nothing.</div>
      </div>
    </div>
  </Shell>;
}
