// site/components/PointsChart.tsx — the chart of the ocean for the Past races page: one point per boat on the same race day of its own
// race, a colour and a shape per year, a box on hover or tap (Tips: no script of this page's own; the layout's tap script opens it on a
// phone). Follows FleetMap.tsx's way of drawing the sea (land paths, graticule, halo class) rather than inventing a second one; it
// differs only in what sits on top — one point per boat per year instead of this year's fleet, and no course line.
import Tips, { type Target } from "./Tips";
import { project, viewHeight, landPaths, type View } from "../lib/geo";
import type { Tip } from "../lib/tips";
import type { Year } from "../lib/editions";
export type Point = { lat: number; lon: number; year: Year; tip: Tip; href?: string; label?: string };
export default function PointsChart({ view, points, labels = [] }: { view: View; points: Point[]; labels?: { name: string; lat: number; lon: number; side?: "l" | "r" }[] }) {
  const H = viewHeight(view), W = view.width, S = 14;
  const grid: React.ReactNode[] = [];
  for (let lo = Math.ceil(view.lon0 / 5) * 5; lo <= view.lon1; lo += 5) { const [x] = project(view.lat0, lo, view); grid.push(<line key={`lo${lo}`} x1={x} y1={0} x2={x} y2={H} stroke="var(--hair)" strokeWidth={0.6} />); }
  for (let la = Math.ceil(view.lat0 / 5) * 5; la <= view.lat1; la += 5) { const [, y] = project(la, view.lon0, view); grid.push(<g key={`la${la}`}><line x1={0} y1={y} x2={W} y2={y} stroke="var(--hair)" strokeWidth={0.6} /><text x={4} y={y - 3} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{la}°N</text></g>); }
  const order: Year[] = ["ggr2018", "ggr2022", "ggr2026"];                                      // drawn oldest first: this year on top
  const targets: Target[] = order.flatMap(y => points.filter(p => p.year === y)).map(p => { const [x, y] = project(p.lat, p.lon, view); return { x: x - S / 2, y: y - S / 2, w: S, h: S, point: true, tip: p.tip, href: p.href, label: p.label }; });
  return <Tips width={W} height={H} targets={targets}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {landPaths(view).map((d, i) => <path key={i} d={d} fill="var(--land)" stroke="var(--coast)" strokeWidth={0.7} />)}
      {grid}
      {/* Longitude labels sit at the top, over the sea, where the land cannot paint over them (an audit finding on FleetMap's
          own bottom placement, which this chart's much taller ocean would otherwise repeat). */}
      {[...Array.from(new Set(points.map(p => Math.floor(p.lon / 5) * 5)))].map(lo => { const [x] = project(view.lat1, lo, view); return <text key={lo} x={x + 3} y={12} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)" className="map-halo">{-lo}°W</text>; })}
      {labels.map(l => { const [x, y] = project(l.lat, l.lon, view); return <text key={l.name} x={l.side === "l" ? x - 9 : x + 9} y={y + 4} textAnchor={l.side === "l" ? "end" : "start"} fontFamily="var(--font-serif)" fontStyle="italic" fontSize={12} fill="var(--graphite)" className="map-halo">{l.name}</text>; })}
    </svg>
    {/* The marks are HTML spans over the SVG (so the hover ring in globals.css can outline them); the Tips targets above are
        14 px squares centred on the same points. */}
    {order.flatMap(y => points.filter(p => p.year === y)).map((p, i) => { const [x, y] = project(p.lat, p.lon, view); return <span key={i} className={`yr-mark ${p.year}`} style={{ left: `${(x / W * 100).toFixed(3)}%`, top: `${(y / H * 100).toFixed(3)}%`, position: "absolute", pointerEvents: "none" }} />; })}
  </Tips>;
}
