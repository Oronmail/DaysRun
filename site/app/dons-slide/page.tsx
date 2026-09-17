// site/app/dons-slide/page.tsx — the daily slide for the race's live show: the 24 hours to the latest report on one 16:9 screen.
// Not in the menu. Static like every page, re-rendered when the worker pings; SlideRefresh keeps an open tab current.
import type { Metadata } from "next";
import DonsSlide from "@/components/DonsSlide";
import SlideRefresh from "@/components/SlideRefresh";
import { latestFleet, boatStats, legsBetween, lastSync } from "@/lib/db";
import { columns, biggestRun, fleetAverage, fastestLeg, leaderLine, ghostLine } from "@/lib/slide";
import { placeGroups } from "@/lib/moves";
export const revalidate = 900;
export const metadata: Metadata = { title: "Day's Run · the daily board", robots: { index: false, follow: false } };
const DAY = 86400 * 1000;
export default async function Page() {
  const fleet = await latestFleet(), asOf = fleet.as_of, t = new Date(asOf).getTime(), before = new Date(t - DAY).toISOString(), twoDays = new Date(t - 2 * DAY).toISOString();
  const [boats, was, legs, sync] = await Promise.all([boatStats(asOf), boatStats(before), legsBetween(twoDays, asOf), lastSync()]);
  const cols = columns(boats, was, legs, asOf), top = boats[0];
  return <><SlideRefresh /><DonsSlide d={{ raceDay: fleet.race_day, asOf, sync, cols, biggest: biggestRun(cols), average: fleetAverage(cols), averageBefore: fleetAverage(columns(was, [], legs, before)),
    fastest: fastestLeg(legs, boats, asOf), leader: leaderLine(boats), ghost: top ? ghostLine(top.team.first_name ?? top.team.name, top.vs_vdh_nm, fleet.ahead_vdh, fleet.racing, fleet.race_day) : null, places: placeGroups(boats) }} /></>;
}
