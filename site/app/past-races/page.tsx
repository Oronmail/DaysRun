// site/app/past-races/page.tsx — the fleet of 2026 against the whole fleets of 2018 and 2022, race day for race day. Reads the
// three edition tables; every sentence with a number in it comes from lib/editions.ts, where it is tested, and the page itself
// holds only labels, values and words that carry no figure. Each fleet is measured on ITS OWN course (the owner, 19 Sep 2026):
// nothing here is projected onto another year's line. Nothing on the page shows a day later than D, the figures' own race day.
import Shell from "@/components/Shell";
import Dateline from "@/components/Dateline";
import YearLines from "@/components/YearLines";
import PointsChart from "@/components/PointsChart";
import WindShares from "@/components/WindShares";
import { Legend } from "@/components/Charts";
import { editionDays, editionBoatDays, editionBoatSeries, editionMilestones, teamsOf, type EditionDay, type EditionBoatDay, type PastTeam } from "@/lib/db";
import { YEARS, YEAR_LABEL, YEAR_COLOR, YEAR_TEXT, START_AT, RETURNING, VETERAN_HULLS, MILESTONE_ORDER, latestDay, sameDay, series, axisMax, axisTicks, boatSeries, sevenDayMean, pointTip, onTheRoad, placed, roadView, extremes, fleetWind, windWords, takeaways, roadRow, roadWords, latDM, attemptCard, milestoneCells, milestonesAsOf, bestSoFar, shareOfCourse, raceDayLabel, figuresLine, spanWords, smoothWords, NEAR_DAYS, thinnestRunDay, methodWords, cautionWords, runsNote, type Year } from "@/lib/editions";
import { nm, kn, dayMon, sgn } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
export const revalidate = 900;
export const metadata = pageMeta("/past-races");

const GRAPHITE = { fontSize: 13, color: "var(--graphite)" } as const;
const PARA = { fontSize: 15, lineHeight: 1.55 } as const;
const XT = axisTicks(NEAR_DAYS, 6);   // the near view's ticks follow its own span (lib/editions.ts), never a second list typed here
const W = 760, H = 300;               // the widest chart the site draws anywhere (the Performance page's), so a phone scales it no further down than the site already does

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
  const ends = Object.fromEntries(YEARS.map(y => [y, extremes(B[y], id => who(y, id))])) as Record<Year, ReturnType<typeof extremes>>;
  const msAsOf = milestonesAsOf(ms, today.as_of);
  const mgOn = (y: Year, id: number) => B[y].find(b => b.team_id === id)?.mg_nm ?? null;
  // This year's lines stop at D — the day every tile, table and sentence on the page is of. A past race's whole record is in,
  // so its line runs to the chart's own edge.
  const line = (y: Year, field: Parameters<typeof series>[2], maxDay: number) => series(days, y, field, maxDay, 3, y === "ggr2026" ? D : Infinity);

  // The chart of the ocean: one point per boat that reported on day D and was still in its own race. The same set the table
  // beside it counts ("boats with a fix"); a berth at A Coruña is not where a fleet sailed, and one stretched the view by five
  // degrees of latitude past the boats that were racing.
  const marks = YEARS.flatMap(y => B[y].filter(onTheRoad).map(b => {
    const t = teamOf(y, b.team_id);
    return { lat: b.lat!, lon: b.lon!, year: y, tip: pointTip(b, t ?? { name: "Unknown", first_name: null, yacht: null, model: null }, placed(B[y])),
      href: y === "ggr2026" ? `/skipper/${b.team_id}` : undefined, label: `${t?.name ?? "Unknown"}, ${YEAR_LABEL[y]}` };
  }));
  // A fleet strung out north to south makes a tall narrow chart of a wide ocean: the view keeps the boats' own latitudes and
  // widens the longitude until the box is landscape, so the coasts the fleets are sailing between come into it (the owner, 19 Sep).
  const view = marks.length ? roadView(marks, 640) : null;
  const LAND = [{ name: "Lisbon", lat: 38.72, lon: -9.2 }, { name: "Azores", lat: 38.55, lon: -28.0 },
    { name: "Madeira", lat: 32.75, lon: -17.0, side: "l" as const }, { name: "Morocco", lat: 31.4, lon: -7.6 },
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
    { color: YEAR_COLOR[y], gold: y === "ggr2026", width: y === "ggr2026" ? 2.8 : 2, pts: line(y, "leader_mg_nm", maxDay), end: label || y === "ggr2026" ? YEAR_LABEL[y] : undefined },
    { color: YEAR_COLOR[y], gold: y === "ggr2026", width: 1.6, dash: true, pts: line(y, "median_mg_nm", maxDay) }]);
  const runLines = (maxDay: number, smooth: boolean) => YEARS.map(y => ({ color: YEAR_COLOR[y], gold: y === "ggr2026", width: y === "ggr2026" ? 2.8 : 2,
    pts: smooth ? sevenDayMean(line(y, "mean_run_nm", maxDay)) : line(y, "mean_run_nm", maxDay), end: smooth && y !== "ggr2026" ? undefined : YEAR_LABEL[y] }));
  // The whole-race charts end where their own lines end (rule 13 stops the miles at the first boat home), rounded up to the
  // next thirty days: a fixed axis leaves bare space a reader takes for missing days.
  const wholeMg = axisMax(mgLines(9999, false).map(l => l.pts), NEAR_DAYS), wholeRun = axisMax(runLines(9999, true).map(l => l.pts), NEAR_DAYS);
  const caution = cautionWords({ raceDay: D, starters2018: starters("ggr2018"), thin: thinnestRunDay(days, "ggr2018", wholeRun) });

  return <Shell active="Past races" dateline={<Dateline asOf={today.as_of} raceDay={D} />} title="PAST RACES"
    note={words.lead.replace(/^On day \d+ /, "")}
    sub={<>the fleet of 2026 against the fleets of 2018 and 2022, race day for race day<br /><span style={{ fontSize: 16 }}>{figuresLine(D, today.as_of)}</span></>}>
    {/* The day, in four tiles: three years in each, newest first. */}
    <div className="tiles past">{TILES.map(t => <div className="tile" key={t.k}><div className="k">{t.k}</div>
      {same.map(d => { const y = d.race_key as Year, [v, s] = t.f(d, y); return yearRow(y, v, s); })}</div>)}</div>

    {/* Miles made good: the race so far (leads) and the whole race (side). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The race so far</div><div className="small" style={{ fontStyle: "italic" }}>nm made good, each fleet on its own course, {spanWords(NEAR_DAYS)}</div></div>
        <Legend items={[...LEG, ["leader", "var(--graphite)"], ["middle of the fleet (dashed)", "var(--graphite)"]]} />
        <div className="panel"><YearLines width={W} height={H + 40} R={60} xmax={NEAR_DAYS} ymax={3600} yticks={[0, 900, 1800, 2700, 3600]} xticks={XT} lines={mgLines(NEAR_DAYS, true)} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
        <div className="rule-title"><div className="label">The whole race</div><div className="small" style={{ fontStyle: "italic" }}>from the start to the first boat home</div></div>
        <div className="panel"><YearLines width={380} height={250} R={34} xmax={wholeMg} ymax={27000} yticks={[0, 9000, 18000, 27000]} xticks={axisTicks(wholeMg, 3)} lines={mgLines(wholeMg, false)} /></div>
        <div style={PARA}>{words.lead}{words.middle ? ` ${words.middle}` : ""}</div>
      </div>
    </div>

    {/* The wind they had (leads) and where it came from (side). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The wind they had</div><div className="small" style={{ fontStyle: "italic" }}>mean model wind at the boats, by race day</div></div>
        <Legend items={LEG} />
        <div className="panel"><YearLines width={W} height={H} R={60} xmax={NEAR_DAYS} ymax={24} yticks={[0, 6, 12, 18, 24]} xticks={XT} ylab={v => `${v} kt`}
          lines={YEARS.map(y => ({ color: YEAR_COLOR[y], gold: y === "ggr2026", width: y === "ggr2026" ? 2.8 : 2, pts: line(y, "wind_kt", NEAR_DAYS), end: YEAR_LABEL[y] }))} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">And where it came from</div><div className="small" style={{ fontStyle: "italic" }}>share of legs, {spanWords(D)}</div></div>
        <WindShares rows={YEARS.map(y => ({ year: y, upwind: wind[y].upwind, reaching: wind[y].reaching, running: wind[y].running }))} />
        <div style={{ display: "flex", gap: 18, ...GRAPHITE, fontSize: 12 }}><span>on the nose</span><span>across</span><span>from behind</span></div>
        <div className="rule-title" style={{ marginTop: 6 }}><div className="label">The wind and the runs</div><div className="small" style={{ fontStyle: "italic" }}>{spanWords(D)}</div></div>
        <table className="data"><thead><tr><th>Fleet</th><th className="r">Mean wind</th><th className="r">Legs</th><th className="r two">Fleet’s mean 24-hour run</th></tr></thead>
          <tbody>{YEARS.map(y => <tr key={y}><td className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[y] }}>{YEAR_LABEL[y]}</td>
            <td className="num r">{kn(wind[y].kt)} kt</td><td className="num r">{wind[y].legs.toLocaleString("en-US")}</td><td className="num r">{nm(wind[y].run)} nm</td></tr>)}</tbody></table>
        <div style={PARA}>{windWords({ raceDay: D, now: wind.ggr2026, y2022: wind.ggr2022, y2018: wind.ggr2018 })}</div>
      </div>
    </div>

    {/* The road taken: the chart of the ocean, and the three fleets of the same race day beside it. Two columns of their own
        width — on a wide screen the spare room stays at the right edge instead of pulling a three-row table across 1,400 px. */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "640px minmax(0,600px)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The road taken</div></div>
        <div className="small" style={{ fontStyle: "italic" }}>every boat that reported on day {D} of its own race · point at a boat, or tap it</div>
        <Legend items={LEG} />
        {view && <div className="panel"><PointsChart view={view} points={marks} labels={LAND} /></div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Three fleets on the same day</div><div className="small" style={{ fontStyle: "italic" }}>race day {D}</div></div>
        <div className="table-scroll"><table className="data"><thead><tr><th>Fleet</th><th className="r">Boats with a fix</th><th className="r">Middle of the fleet is at</th><th className="r two">Span of latitude, north to south</th></tr></thead>
          <tbody>{YEARS.map(y => <tr key={y}><td className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[y] }}>{YEAR_LABEL[y]}</td>
            <td className="num r">{road[y].boats}</td><td className="num r">{road[y].midLat == null ? "—" : latDM(road[y].midLat!)}</td>
            <td className="num r">{road[y].spanNm == null ? "—" : `${nm(road[y].spanNm)} nm`}</td></tr>)}</tbody></table></div>
        <div style={PARA}>{roadWords(D, road.ggr2026, road.ggr2022, road.ggr2018)}</div>
        <div className="small">Latitude alone does not say who is winning: a boat further south can be further from the finish. The miles are in the charts above.</div>
        <div className="rule-title" style={{ marginTop: 4 }}><div className="label">North to south</div><div className="small" style={{ fontStyle: "italic" }}>the two ends of each fleet on day {D}</div></div>
        <table className="data"><thead><tr><th>Fleet</th><th>Northernmost boat</th><th className="r">at</th><th>Southernmost boat</th><th className="r">at</th></tr></thead>
          <tbody>{YEARS.map(y => { const e = ends[y]; return <tr key={y}><td className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[y] }}>{YEAR_LABEL[y]}</td>
            <td>{e ? e.north.who : "—"}</td><td className="num r">{e ? latDM(e.north.lat) : "—"}</td>
            <td>{e ? e.south.who : "—"}</td><td className="num r">{e ? latDM(e.south.lat) : "—"}</td></tr>; })}</tbody></table>
      </div>
    </div>

    {/* Second attempts: a card per returning skipper. */}
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="rule-title"><div className="label">Second attempts</div><div className="small" style={{ fontStyle: "italic" }}>each skipper against that skipper’s own earlier race, {spanWords(NEAR_DAYS)} · ✕ where the earlier race ended</div></div>
      <div className="cards">{attempts.map(a => {
        // The headline is against the most recent earlier race that has a figure on this race day, and says which race it is.
        const head = a.races.find(x => x.rows.find(b => b.race_day === D)?.mg_nm != null) ?? a.races[0];
        const card = head ? attemptCard(a.now, head.rows, teamOf(head.race_key, head.team_id) ?? { ended_how: null, ended_where: null }, D, head.race_key) : null;
        const nowMg = a.now.find(b => b.race_day === D)?.mg_nm ?? null;
        return <div key={a.team_2026} className="panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span className="mont" style={{ fontSize: 20, fontWeight: 600 }}>{a.first}</span>
            {card?.diff != null && head && <span className={`num ${card.diff >= 0 ? "gain" : "loss"}`} style={{ fontSize: 15 }}>{sgn(card.diff, 0)} nm on {YEAR_LABEL[head.race_key]}</span>}
          </div>
          <div style={{ ...GRAPHITE, fontSize: 12 }}>{a.races.map(x => `day ${D} of ${YEAR_LABEL[x.race_key]}: ${nm(x.rows.find(b => b.race_day === D)?.mg_nm)}`).join(" · ")} · this year: {nm(nowMg)}</div>
          <YearLines width={320} height={210} R={44} xmax={NEAR_DAYS} ymax={3600} yticks={[0, 1200, 2400, 3600]} xticks={axisTicks(NEAR_DAYS, 3)} lines={[
            { color: YEAR_COLOR.ggr2026, gold: true, width: 2.8, pts: boatSeries(a.now, NEAR_DAYS, D), end: "2026" },
            ...a.races.map(x => { const c = attemptCard(a.now, x.rows, teamOf(x.race_key, x.team_id) ?? { ended_how: null, ended_where: null }, D, x.race_key);
              return { color: YEAR_COLOR[x.race_key], width: 2, pts: boatSeries(x.rows, NEAR_DAYS), ended: c.endDay != null && c.endDay <= NEAR_DAYS ? `day ${c.endDay}` : undefined }; })]} />
          {a.races.map(x => { const t = teamOf(x.race_key, x.team_id); const c = attemptCard(a.now, x.rows, t ?? { ended_how: null, ended_where: null }, D, x.race_key);
            return <div key={x.race_key} style={{ fontSize: 13, lineHeight: 1.5 }}><span className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[x.race_key] }}>{YEAR_LABEL[x.race_key]}</span> · {c.endText}.{c.pass ? ` ${c.pass}.` : ""}</div>; })}
        </div>;
      })}</div>
    </div>

    {/* Behind the lines (words) and the hulls that have been here before (table). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "360px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Behind the lines</div></div>
        <div style={PARA}>Damien turned back to Les Sables-d’Olonne in 2022 with the self-steering broken and started again days after the fleet, which is why that line begins so flat; the same gear ended the race at Cape Town. Pat’s 2022 ended at Cape Town as well. Ertan has given up twice, at A Coruña in 2018 and at Cape Town in 2022, both by choice, and is starting again. Guy’s 2022 ended early, aground on Fuerteventura.</div>
        <div style={PARA}>A line that stops is a race that stopped. Where a skipper sailed on in the Chichester class after a stop, the line goes on with the race.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Hulls that have been here before</div><div className="small" style={{ fontStyle: "italic" }}>nm made good on day {D}</div></div>
        <div className="table-scroll"><table className="data"><thead><tr><th>Hull</th><th>Then</th><th className="r">nm</th><th>Now</th><th className="r">nm</th></tr></thead>
          <tbody>{hullRows.map(({ h, x, then }) => <tr key={`${h.team_2026}-${x.race_key}-${x.team_id}`}>
            <td><i>{h.yacht_2026}</i><div style={{ ...GRAPHITE, fontSize: 11 }}>{h.design}</div></td>
            <td><span className="mont" style={{ fontWeight: 700, color: YEAR_TEXT[x.race_key] }}>{YEAR_LABEL[x.race_key]}</span> {who(x.race_key, x.team_id)}<div style={{ ...GRAPHITE, fontSize: 11 }}>{x.yacht_then === h.yacht_2026 ? x.note : <>as <i>{x.yacht_then}</i> · {x.note}</>}</div></td>
            <td className="num r">{nm(then?.mg_nm)}</td>
            <td><span className="mont" style={{ fontWeight: 700, color: YEAR_TEXT.ggr2026 }}>2026</span> {who("ggr2026", h.team_2026)}</td>
            <td className="num r">{nm(mgOn("ggr2026", h.team_2026))}</td></tr>)}</tbody></table></div>
        <div className="small">A hull is the same boat, not the same race: rigs, sails and gear change between owners.</div>
      </div>
    </div>

    {/* Milestones: the marks that mean the same thing in every fleet. */}
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="rule-title"><div className="label">Milestones</div><div className="small" style={{ fontStyle: "italic" }}>the race day of the first boat, its date, and the day half the starters were past</div></div>
      <div className="table-scroll"><table className="data">
        <thead><tr><th>Milestone</th>{YEARS.map(y => <th key={y} colSpan={3} style={{ color: YEAR_TEXT[y], textAlign: "center" }}>{YEAR_LABEL[y]} · started {dayMon(START_AT[y])}</th>)}</tr>
          <tr><th /> {YEARS.flatMap(y => [<th key={`${y}f`}>First boat</th>, <th key={`${y}m`} className="r two">Half the fleet past</th>, <th key={`${y}p`} className="r">Boats past</th>])}</tr></thead>
        <tbody>{MILESTONE_ORDER.map(name => <tr key={name}><td style={{ fontWeight: 600 }}>{name}</td>
          {YEARS.flatMap(y => { const c = milestoneCells(msAsOf, y, name, starters(y));
            const winner = name === "Finish" ? T[y].find(t => (t.class_note ?? "").includes("the winner")) : undefined;
            return [
              <td key={`${y}f`}>{c.first ? <>{raceDayLabel(c.first.race_day, c.first.passed_at)}<div style={{ ...GRAPHITE, fontSize: 11 }}>{who(y, c.first.team_id)}{winner && winner.id !== c.first.team_id ? ` · ${winner.name} won` : ""}</div></> : "—"}</td>,
              <td key={`${y}m`} className="num r">{c.middle ? `day ${c.middle.race_day}` : c.passed ? <span style={GRAPHITE}>{c.middleText}</span> : "—"}</td>,
              <td key={`${y}p`} className="num r">{c.passed ? `${c.passed} of ${starters(y)}` : "—"}</td>];
          })}</tr>)}</tbody></table></div>
      <div className="small">Lanzarote and Hobart are each race’s own timing through its gate, from YB’s record: 2018 has none at Lanzarote, although the race had the gate. The equator, the Cape of Good Hope and Cape Horn are crossings of a line on the chart, and mean the same thing in every fleet. “Half the fleet past” is the day the boat that makes half the starters through passed the mark, so two fleets of different size are measured alike; it is blank until half of them are past, and it is not the “middle of the fleet” of the tiles and the charts, which is the median of the boats still racing that day.</div>
    </div>

    {/* 24-hour runs: the day (leads) and the whole race smoothed (side). */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rule-title"><div className="label">The fleet’s average 24-hour run</div><div className="small" style={{ fontStyle: "italic" }}>nm sailed, {spanWords(NEAR_DAYS, 2)}</div></div>
        <Legend items={LEG} />
        <div className="panel"><YearLines width={W} height={H} R={60} xmax={NEAR_DAYS} ymax={180} yticks={[0, 60, 120, 180]} xticks={XT} lines={runLines(NEAR_DAYS, false)} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
        <div className="rule-title"><div className="label">Over the whole race</div><div className="small" style={{ fontStyle: "italic" }}>{smoothWords()}</div></div>
        <div className="panel"><YearLines width={380} height={250} R={34} xmax={wholeRun} ymax={180} yticks={[0, 60, 120, 180]} xticks={axisTicks(wholeRun, 3)} lines={runLines(wholeRun, true)} /></div>
        <div style={PARA}>{runsNote()}</div>
      </div>
    </div>

    {/* How this is measured, and what not to read into it. */}
    <div className="stack" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">How this is measured</div></div>
        {methodWords().map(p => <div key={p.slice(0, 24)} style={PARA}>{p}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="rule-title"><div className="label">Read with care</div></div>
        {caution.map(p => <div key={p.slice(0, 24)} style={PARA}>{p}</div>)}
      </div>
    </div>
  </Shell>;
}
