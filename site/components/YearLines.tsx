// site/components/YearLines.tsx — lines of unequal length (a race still running is a short line), one per year in its colour, a dashed
// line for the middle of the fleet, a gold line under a darker edge, an ✕ where a race ended. Server-rendered SVG, as every chart here.
const MONO = "var(--font-mono)";
export type YearLine = { color: string; width?: number; dash?: boolean; gold?: boolean; pts: [number, number][]; end?: string; ended?: string };
export function scale(width: number, height: number, xmax: number, ymax: number, R: number) {
  const L = 52, T = 14, B = 28, pw = width - L - R, ph = height - T - B;
  // A value past ymax (2022's leader can pass this year's course-length axis) holds at the top of the box rather than
  // let its point escape it: the chart is clipped, never a line drawn above its own frame.
  return { X: (x: number) => L + x / xmax * pw, Y: (y: number) => T + (ymax - Math.min(y, ymax)) / ymax * ph, L, pw };
}
// A line's own data decides where it stops (a race still being sailed is a short line, not one stretched to xmax); points
// past xmax are dropped, never drawn past the chart's right edge.
export function clip(pts: [number, number][], xmax: number): [number, number][] {
  return pts.filter(([x]) => x <= xmax);
}
// The ✕ that marks where a race ended gets the same gold treatment as the "still racing" end marker: a gold line's ✕ and
// label move to the darker edge/text tokens, or a raw pale gold mark would sit unseen on the panel's own pale background.
export function endedStyle(color: string, gold?: boolean): { stroke: string; weight: number; fill: string } {
  return gold ? { stroke: "var(--gold-edge)", weight: 600, fill: "var(--gold-text)" } : { stroke: color, weight: 500, fill: color };
}
export default function YearLines({ lines, xmax, ymax, yticks, xticks, width = 640, height = 300, R = 64, ylab = (v: number) => Math.round(v).toLocaleString("en-US"), xlab = (x: number) => `d${x}` }:
  { lines: YearLine[]; xmax: number; ymax: number; yticks: number[]; xticks: number[]; width?: number; height?: number; R?: number; ylab?: (v: number) => string; xlab?: (x: number) => string }) {
  const { X, Y, L, pw } = scale(width, height, xmax, ymax, R);
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
    {yticks.map(v => <g key={v}><line x1={L} y1={Y(v)} x2={L + pw} y2={Y(v)} stroke={v === 0 ? "var(--graphite)" : "var(--hair)"} /><text x={L - 8} y={Y(v) + 4} textAnchor="end" fontFamily={MONO} fontSize={10} fill="var(--graphite)">{ylab(v)}</text></g>)}
    {xticks.map(x => <text key={x} x={X(x)} y={height - 8} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="var(--graphite)">{xlab(x)}</text>)}
    {lines.map((l, i) => { const pts = clip(l.pts, xmax); if (!pts.length) return null;
      const d = "M" + pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" L"); const [ex, ey] = pts[pts.length - 1]; const w = l.width ?? 2;
      return <g key={i}>
        {/* The darker edge is drawn UNDER the line (first in document order, same path), so a gold line reads as one line
            with a rim, not as a halo around it. */}
        {l.gold && <path d={d} fill="none" stroke="var(--gold-edge)" strokeWidth={w + 1.3} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={l.dash ? "5 4" : undefined} />}
        <path d={d} fill="none" stroke={l.color} strokeWidth={w} strokeLinejoin="round" strokeDasharray={l.dash ? "5 4" : undefined} />
        {l.end && <><circle cx={X(ex)} cy={Y(ey)} r={l.gold ? 4.5 : 4} fill={l.color} stroke={l.gold ? "var(--gold-edge)" : "var(--panel)"} strokeWidth={l.gold ? 1.4 : 2} /><text x={X(ex) + 9} y={Y(ey) + 4} fontFamily={MONO} fontSize={10} fontWeight={l.gold ? 600 : 500} fill={l.gold ? "var(--gold-text)" : l.color} className="map-halo">{l.end}</text></>}
        {l.ended && (() => { const es = endedStyle(l.color, l.gold); return <><path d={`M${X(ex) - 4},${Y(ey) - 4} L${X(ex) + 4},${Y(ey) + 4} M${X(ex) - 4},${Y(ey) + 4} L${X(ex) + 4},${Y(ey) - 4}`} stroke={es.stroke} strokeWidth={2.2} /><text x={X(ex) + 8} y={Y(ey) > height - 50 ? Y(ey) - 7 : Y(ey) + 15} fontFamily={MONO} fontSize={10} fontWeight={es.weight} fill={es.fill} className="map-halo">{l.ended}</text></>; })()}
      </g>; })}
  </svg>;
}
