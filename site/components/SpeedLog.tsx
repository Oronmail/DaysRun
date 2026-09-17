// site/components/SpeedLog.tsx — the skipper page's 7-day speed log: 42 four-hour legs with the value on every bar, a knot
// scale, and the days marked. (The small SpeedBars in the ranking stays a sparkline; this one is for reading.)
import { dayMon, dayMonTime } from "@/lib/format";
const SLOT_MS = 4 * 3600 * 1000;
export default function SpeedLog({ log, endAt, width = 728, height = 176, max = 8 }: { log: (number | null)[]; endAt: string; width?: number; height?: number; max?: number }) {
  const L = 34, R = 4, T = 16, B = 24, pw = width - L - R, ph = height - T - B, n = log.length, slot = pw / n, bw = slot - 2.5;
  const end = Math.round(new Date(endAt).getTime() / SLOT_MS) * SLOT_MS;                 // the report time the last leg ends at
  const legEnd = (i: number) => end - (n - 1 - i) * SLOT_MS;
  const Y = (v: number) => T + ph - Math.min(v, max) / max * ph;
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} role="img" aria-label="Average speed on each 4-hour leg over the last 7 days, in knots">
    {[0, 2, 4, 6, 8].map(v => <g key={v}><line x1={L} y1={Y(v)} x2={L + pw} y2={Y(v)} stroke={v === 0 ? "var(--graphite)" : "var(--hair)"} /><text x={L - 6} y={Y(v) + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{v} kt</text></g>)}
    {log.map((v, i) => { const x = L + i * slot + 1.25, startsDay = new Date(legEnd(i) - SLOT_MS).getUTCHours() === 0, last = i === n - 1; return <g key={i}>
      {startsDay && <><line x1={x - 1.25} y1={T + ph} x2={x - 1.25} y2={T + ph + 6} stroke="var(--graphite)" /><text x={x + 1} y={height - 5} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{dayMon(new Date(legEnd(i) - SLOT_MS).toISOString())}</text></>}
      {v == null
        ? <><rect x={x} y={T + ph - 2} width={bw} height={2} fill="var(--tick)" /><text x={x + bw / 2} y={T + ph - 5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8} fill="var(--graphite)">–</text></>
        : <><rect x={x} y={Y(v)} width={bw} height={Math.max(1.5, T + ph - Y(v))} rx={1.5} fill={last ? "var(--gold)" : "var(--bar)"}><title>{`${v.toFixed(1)} kt · leg ending ${dayMonTime(new Date(legEnd(i)).toISOString())} UTC`}</title></rect>
            <text x={x + bw / 2} y={Y(v) - 3} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8} fontWeight={last ? 700 : 400} fill="var(--ink)">{v.toFixed(1)}</text></>}
    </g>; })}
  </svg>;
}
