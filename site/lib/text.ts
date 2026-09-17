// site/lib/text.ts
export const DEFINITIONS: [string, string][] = [
  ["Report", "The tracker’s scheduled 4-hourly transmission at 0000, 0400, 0800, 1200, 1600 and 2000 UTC."],
  ["Fix", "The position a report carries: latitude, longitude and YB’s distance to finish."],
  ["Missed report", "No fix within 20 minutes of a report time. The boat keeps its last position in the ranking and is marked; a displayed run may bridge one missed report and says so; records never do. A boat is never called stopped."],
  ["Position", "Latitude and longitude in degrees and decimal minutes, e.g. 29°33.6′N 013°39.9′W."],
  ["Place", "Rank by distance to finish at the report time, as YB orders the fleet. ± 24 h is the places gained or lost since the report 24 hours earlier; a change involving a boat with an older fix is marked and not called a move."],
  ["To go (DTF)", "Distance to finish, measured by YB along the course. Gap (DTL) is this boat’s distance to finish minus the leader’s; interval is the same to the boat one place ahead."],
  ["4-hour leg", "The straight line between two consecutive fixes of one boat. Its great-circle distance divided by the time between the fixes is the leg’s average speed over the ground — a lower bound on true speed over ground (SOG), never boat speed through the water. A leg is never stretched across a missed report."],
  ["24-hour run", "Distance sailed along the track over the six 4-hour legs ending at the report time. 7-day run: the same over 42 legs. A boat that restarted shows “since restart” until it has seven days at sea."],
  ["Best 4-hour leg, best 24-hour run, best 7-day run", "A boat’s fastest single leg and longest runs so far this race, start day excluded, with no missed report inside the window. Personal best (PB) is the boat’s own; fleet best the whole fleet’s."],
  ["Made good", "The fall in YB’s distance to finish over a window divided by hours; the 7-day value drives ETAs. YB’s leaderboard calls the same idea VMG (recent = the last five fixes, or since the start) and publishes it in km/h, which we convert to knots. Distance made good is the reduction since the start; distance sailed is the sum of 4-hour legs."],
  ["ETA", "Estimated time of arrival at the next mark, UTC: distance to the mark divided by made-good speed over the last 7 days (from the restart for a restarted boat). It doesn’t know the Southern Ocean is faster."],
  ["Mark, gate, checkpoint, sprint", "A mark is anything the fleet must pass (the NOR’s waypoints): the Lanzarote inshore rounding mark, the Island of Trindade, the no-go zone corners, Cape Leeuwin, the Hobart Gate, Cape Horn, the finish line. Gates are Lanzarote and Hobart only — the inshore marks and crossing lines where film is dropped (NOR A.1.6). Checkpoints are YB’s own timing lines (eleven; their positions are not published) and a split is the elapsed time to one. Sprints are this site’s unofficial elapsed times between two parallels, interpolated between fixes."],
  ["No-go zones (ice limits)", "The 45°S, 49°S and 50°S waypoints the fleet must leave to starboard (NOR C.1.3), labelled NO GO ZONE on the tracker."],
  ["Restart", "A return to Les Sables-d’Olonne and a new departure within 7 days of the start, with the Race Director’s prior authorisation (NOR C.1.2 “Re-Start”). Race time is not reset, so places are unchanged; speed, runs and ETAs for that boat count only from the restart."],
  ["Race day", "GGR’s numbering: the UTC calendar date minus the start date (6 September = day 0, 7 September = Day 1), matching the daily video and written report."],
  ["Ghost", "A past voyage replayed by YB on this year’s calendar (its tag is “Previous Competitors”): Jean-Luc Van Den Heede 2018 (VDH), Kirsten Neuschäfer 2022, Sir Robin Knox-Johnston and Bernard Moitessier 1968–69. Ghost gap, in days: behind a ghost, how long ago its replay passed this boat’s distance to finish; ahead, how long until it will, at its pace over the last seven replay days."],
  ["Classes and status", "Every entrant starts in the Suhaili Class. A stop or outside assistance moves a boat to the Chichester Class; a Suhaili entrant reaching Hobart after 1200 local on 31 January 2027 becomes a GGR Voyager (NOR C.2). Retired boats keep their pages and records."],
  ["Wind and sea", "Model values from Open-Meteo at each report position, not measured on board. Wind is the hourly mean at 10 m and the gust, in knots, with the direction it blows from in degrees true; arrows point downwind. Force is Beaufort, derived from the rounded value shown (Force 8, a gale, is 34–40 kt). A gale day or light-wind day means every report of a UTC day at 34 kt or more, or under 6 kt. Waves are significant wave height, sea and swell combined; swell is given with its period. Current is the speed in knots and the direction it sets toward. Sea temp is sea-surface temperature; pressure is sea-level pressure in hPa."],
  ["Units and times", "Nautical miles (nm), knots (kt), degrees true, UTC. The Notice of Race speaks of GMT; for this race they are the same. Times are written 0722 UTC; seconds appear only in YB’s splits."],
];
// The race's own live tracker. We link to it; nothing on this site fetches from goldengloberace.com.
export const TRACKER_URL = "https://goldengloberace.com/live-tracker/";
// Sprints in course order (the worker's config.SPRINTS). Pages show the most advanced sprint first.
export const SPRINT_ORDER = ["45°N–40°N", "40°N–35°N", "35°N–30°N", "30°N–Equator", "Equator–40°S"];
export const COURSE: [string, string][] = [
  ["Lanzarote", "inshore rounding marks (NOR C.1.6): at least one reef in on the approach, headsails down for 20 minutes after rounding. The tracker's course leaves the mark to starboard"],
  ["Island of Trindade", "leave to port"], ["No-go zones (ice limits) · 45°S, 49°S, 50°S", "waypoints left to starboard, from the southern Indian Ocean to Cape Horn (NOR C.1.3)"],
  ["Cape Leeuwin", "leave to port"], ["Hobart Gate", "mandatory crossing line in Storm Bay; 90 minutes inside before continuing (NOR C.1.5)"], ["Cape Horn", "leave to port"], ["Les Sables-d’Olonne", "finish line"],
];
export const beaufort = (kt: number) => [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(l => kt < l) === -1 ? 12 : [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(l => kt < l);
