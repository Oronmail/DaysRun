// site/app/dons-slide/page.tsx — the daily slide for the race's live show: the 24 hours to the latest report on one 16:9 screen.
// Not in the menu. Static like every page, re-rendered when the worker pings; SlideRefresh keeps an open tab current.
import type { Metadata } from "next";
import DonsSlide from "@/components/DonsSlide";
import SlideRefresh from "@/components/SlideRefresh";
import { latestFleet, boatStats, legsBetween, windsBetween, passesBetween, duelsAt, lastSync } from "@/lib/db";
import { columns, biggestRun, fleetAverage, fastestLeg, leaderLine, passesTile, meanWinds } from "@/lib/slide";
import { placeGroups } from "@/lib/moves";
export const revalidate = 900;
export const metadata: Metadata = { title: "Day's Run · the daily board", robots: { index: false, follow: false } };
const DAY = 86400 * 1000;
export default async function Page() {
  const fleet = await latestFleet(), asOf = fleet.as_of, t = new Date(asOf).getTime(), before = new Date(t - DAY).toISOString(), twoDays = new Date(t - 2 * DAY).toISOString();
  const [boats, was, legs, winds, passes, duels, sync] = await Promise.all([boatStats(asOf), boatStats(before), legsBetween(twoDays, asOf), windsBetween(new Date(t - DAY - 20 * 60000).toISOString(), new Date(t + 20 * 60000).toISOString()), passesBetween(before, asOf), duelsAt(asOf), lastSync()]);
  const cols = columns(boats, was, legs, asOf, meanWinds(winds, asOf)), name = new Map(boats.map(b => [b.team_id, b.team.first_name ?? b.team.name]));
  const closest = duels[0] && name.has(duels[0].ahead_id) && name.has(duels[0].behind_id) ? { ahead: name.get(duels[0].ahead_id)!, behind: name.get(duels[0].behind_id)!, gap_nm: duels[0].gap_nm } : null;
  return <><SlideRefresh /><DonsSlide d={{ raceDay: fleet.race_day, asOf, sync, cols, biggest: biggestRun(cols), average: fleetAverage(cols), averageBefore: fleetAverage(columns(was, [], legs, before, new Map())),
    fastest: fastestLeg(legs, boats, asOf), leader: leaderLine(boats), passes: passesTile(passes.map(p => p.title), closest), places: placeGroups(boats) }} /></>;
}
