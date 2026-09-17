// site/components/SpeedBars.tsx — average speed on each 4-hour leg, last 7 days, 0–8 kt
export default function SpeedBars({ log, width = 126, height = 24, max = 8 }: { log: (number | null)[]; width?: number; height?: number; max?: number }) {
  const bw = width / 42;
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} role="img" aria-label="Speed on each 4-hour leg over the last 7 days">
    {log.map((v, i) => v == null
      ? <rect key={i} x={i * bw} y={height - 2} width={bw - 1} height={2} fill="var(--tick)" />
      : <rect key={i} x={i * bw} y={height - Math.max(1.5, Math.min(v, max) / max * height)} width={bw - 1} height={Math.max(1.5, Math.min(v, max) / max * height)} rx={1} fill={i === log.length - 1 ? "var(--gold)" : "var(--bar)"} />)}
  </svg>;
}
export const BARS_LEGEND = "Speed bars: average speed on each 4-hour leg, last 7 days, 0–8 kt · gold = latest leg · short grey mark = missed report · vs VDH: days ahead of (+) or behind (−) Van Den Heede’s 2018 pace on the same race day";
