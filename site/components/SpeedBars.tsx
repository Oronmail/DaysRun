// site/components/SpeedBars.tsx — average speed on each 4-hour leg, last 7 days, 0–8 kt; the fastest leg is gold (the same rule as the
// skipper page's speed log, so the two never disagree about which leg it is)
import { highest } from "@/lib/highest";
export default function SpeedBars({ log, width = 126, height = 24, max = 8 }: { log: (number | null)[]; width?: number; height?: number; max?: number }) {
  const bw = width / 42, gold = highest(log, v => v.toFixed(1));
  return <svg className="speedbars" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }} role="img" aria-label="Speed on each 4-hour leg over the last 7 days">
    {log.map((v, i) => v == null
      ? <rect key={i} x={i * bw} y={height - 2} width={bw - 1} height={2} fill="var(--tick)" />
      : <rect key={i} x={i * bw} y={height - Math.max(1.5, Math.min(v, max) / max * height)} width={bw - 1} height={Math.max(1.5, Math.min(v, max) / max * height)} rx={1} fill={gold.has(i) ? "var(--gold)" : "var(--bar)"} />)}
  </svg>;
}
export const BARS_LEGEND = "Speed bars: average speed on each 4-hour leg, last 7 days, 0–8 kt · gold = the fastest leg of the 7 days · short grey mark = missed report · Latest leg: average speed on the newest 4-hour leg, the arrow shows the course made good (where the boat went, not where she points) · Speed for the wind: boat speed as a share of model wind speed since the start, the mark is the fleet’s median · On leader: miles gained (+) or lost (−) on the leader in 24 hours, fix to fix · vs nearby: 24-hour run against the median of the boats within 150 nm, the same weather near enough · vs VDH: days ahead of (+) or behind (−) Van Den Heede’s 2018 pace on the same race day · a blank means no current fix";
