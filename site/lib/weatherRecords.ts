// site/lib/weatherRecords.ts — the weather boards on the Records page: the weather a boat MET according to the model (Open-Meteo at
// the boat's report position), never a measurement. The worker ranks them (worker/ggrstats/weather_records.py); this file prints them.
import { dayMonTime } from "./format";
export type WeatherKind = "wind" | "wave" | "calm";
export const WEATHER_BOARDS: { kind: WeatherKind; title: string; valid: string }[] = [
  { kind: "wind", title: "Strongest model wind", valid: "The mean model wind at a boat’s report position, with the gust the model gave at that same report. Not measured on board: a skipper may have seen more, or less." },
  { kind: "wave", title: "Highest waves", valid: "Significant wave height from the model at the boat’s position, sea and swell combined. Not measured on board." },
  { kind: "calm", title: "Longest calm", valid: "Consecutive 4-hour reports with model wind under 6 kt; a missed report ends the spell. Two reports at least." },
];
export function weatherLine(kind: WeatherKind, value: number, atISO: string, gust: number | null): { figure: string; detail: string; when: string } {
  if (kind === "wind") return { figure: `${value.toFixed(1)} kt`, detail: gust == null ? "" : `gusts ${Math.round(gust)} kt`, when: `at ${dayMonTime(atISO)} UTC` };
  if (kind === "wave") return { figure: `${value.toFixed(1)} m`, detail: "", when: `at ${dayMonTime(atISO)} UTC` };
  return { figure: `${Math.round(value)} h`, detail: "under 6 kt", when: `from ${dayMonTime(atISO)} UTC` };
}
