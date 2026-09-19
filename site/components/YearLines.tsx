// site/components/YearLines.tsx — lines of unequal length (a race still running is a short line), one per year in its colour, a dashed
// line for the middle of the fleet, a gold line under a darker edge, an ✕ where a race ended. Server-rendered SVG, as every chart here.
const MONO = "var(--font-mono)";
export type YearLine = { color: string; width?: number; dash?: boolean; gold?: boolean; pts: [number, number][]; end?: string; ended?: string };
export function scale(width: number, height: number, xmax: number, ymax: number, R: number) {
  const L = 52, T = 14, B = 28, pw = width - L - R, ph = height - T - B;
  // A value past ymax (2022's leader can pass this year's course-length axis) holds at the top of the box rather than
  // let its point escape it, and a value below nought holds at the baseline the same way: a boat that turned back to the
  // start has negative miles made good for days (Damien, 2022), and the chart is clipped at BOTH edges of its frame.
  return { X: (x: number) => L + x / xmax * pw, Y: (y: number) => T + (ymax - Math.min(Math.max(y, 0), ymax)) / ymax * ph, L, pw };
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
/** Labels that would print on top of one another, moved apart. Two lines can end within half a knot of each other (2018 and
 *  2022 on the wind chart's day 30, 10.9 kt against 10.5) and their names then overprint. Each knot of labels is spread to
 *  minGap and centred on where its labels were, so every name stays as near its own line's end as the spacing allows; the order
 *  of the lines is never changed, and no label leaves the chart's box [lo, hi] — a knot too tall for the box is squeezed to fit
 *  rather than drawn outside it. Pure: the component passes the ys it was going to draw at and draws at what comes back. */
export function spreadLabels(ys: number[], minGap: number, lo: number, hi: number): number[] {
  if (ys.length < 2) return ys.slice();
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  type Knot = { items: number[]; mean: number };
  const knots: Knot[] = [];
  const top = (k: Knot) => k.mean - (k.items.length - 1) * minGap / 2;
  for (const i of order) {
    knots.push({ items: [i], mean: ys[i] });
    while (knots.length > 1) {                                        // a new label that lands inside the one before joins it
      const b = knots[knots.length - 1], a = knots[knots.length - 2];
      if (top(b) >= top(a) + (a.items.length - 1) * minGap + minGap) break;
      const items = [...a.items, ...b.items];
      knots.splice(knots.length - 2, 2, { items, mean: items.reduce((n, j) => n + ys[j], 0) / items.length });
    }
  }
  const out = ys.slice();
  for (const k of knots) {
    const n = k.items.length - 1, gap = Math.min(minGap, n ? (hi - lo) / n : minGap);   // a knot taller than the box shares the box out
    const start = Math.max(lo, Math.min(top(k), hi - n * gap));
    k.items.forEach((j, m) => { out[j] = start + m * gap; });
  }
  return out;
}

/** Where an ✕'s label goes. It sits under the ✕ (over it near the foot of the box), and drops a line clear when another line's
 *  own end label is close enough to overprint it — on a card of a short race the two markers can land within a few pixels
 *  ("2026" over "✕ day 14" on Guy's card). `ends` are the other lines' end points, in the chart's own units. */
export function endedLabelY(x: number, y: number, height: number, ends: [number, number][]): number {
  const clash = ends.some(([ex, ey]) => Math.abs(ex - x) < 46 && Math.abs(ey - y) < 16);
  const low = y > height - 50;
  return low ? y - (clash ? 20 : 7) : y + (clash ? 27 : 15);
}
export default function YearLines({ lines, xmax, ymax, yticks, xticks, width = 640, height = 300, R = 64, ylab = (v: number) => Math.round(v).toLocaleString("en-US"), xlab = (x: number) => `d${x}` }:
  { lines: YearLine[]; xmax: number; ymax: number; yticks: number[]; xticks: number[]; width?: number; height?: number; R?: number; ylab?: (v: number) => string; xlab?: (x: number) => string }) {
  const { X, Y, L, pw } = scale(width, height, xmax, ymax, R);
  // Where every LABELLED end marker sits, so that an ✕'s label below can step clear of one instead of printing over it.
  const ends: [number, number][] = lines.flatMap(l => { const pts = clip(l.pts, xmax); return l.end && pts.length ? [[X(pts[pts.length - 1][0]), Y(pts[pts.length - 1][1])] as [number, number]] : []; });
  // Two lines that end at the same day and within a knot of each other print their names on top of one another (2018 and 2022
  // on the wind chart). Labels are spread inside the box, a group at a time: only labels that end near the same x can collide.
  const labelled = lines.map((l, i) => ({ i, pts: clip(l.pts, xmax) })).filter(e => lines[e.i].end && e.pts.length)
    .map(e => ({ i: e.i, x: X(e.pts[e.pts.length - 1][0]), y: Y(e.pts[e.pts.length - 1][1]) + 4 }));
  const labelY: Record<number, number> = {};
  for (const g of labelled.reduce((gs: (typeof labelled)[], e) => {
    const g = gs.find(g => g.some(o => Math.abs(o.x - e.x) < 46));                      // a label's own width: further apart, they cannot touch
    if (g) g.push(e); else gs.push([e]);
    return gs;
  }, [])) spreadLabels(g.map(e => e.y), 12, 12, height - 16).forEach((y, k) => { labelY[g[k].i] = y; });
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
        {l.end && <><circle cx={X(ex)} cy={Y(ey)} r={l.gold ? 4.5 : 4} fill={l.color} stroke={l.gold ? "var(--gold-edge)" : "var(--panel)"} strokeWidth={l.gold ? 1.4 : 2} /><text x={X(ex) + 9} y={labelY[i] ?? Y(ey) + 4} fontFamily={MONO} fontSize={10} fontWeight={l.gold ? 600 : 500} fill={l.gold ? "var(--gold-text)" : l.color} className="map-halo">{l.end}</text></>}
        {l.ended && (() => { const es = endedStyle(l.color, l.gold); return <><path d={`M${X(ex) - 4},${Y(ey) - 4} L${X(ex) + 4},${Y(ey) + 4} M${X(ex) - 4},${Y(ey) + 4} L${X(ex) + 4},${Y(ey) - 4}`} stroke={es.stroke} strokeWidth={2.2} /><text x={X(ex) + 8} y={endedLabelY(X(ex), Y(ey), height, ends)} fontFamily={MONO} fontSize={10} fontWeight={es.weight} fill={es.fill} className="map-halo">{l.ended}</text></>; })()}
      </g>; })}
  </svg>;
}
