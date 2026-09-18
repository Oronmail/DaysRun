// site/components/FleetMap.tsx — server-rendered SVG chart in the Admiralty-paper style
import { project, viewHeight, landPaths, courseD, type View } from "@/lib/geo";
import { marksInView, markNamed, edgePointer } from "@/lib/marks";
import Tips, { type Target } from "./Tips";
import type { Tip } from "@/lib/tips";
// name + href: the boat's name shows when the pointer is over its dot, and the dot opens the skipper's page (CSS only: .map-boat).
export type Marker = { lat: number; lon: number; label?: string; side?: "l" | "r"; kind: "boat" | "lead" | "ghost" | "mark" | "dim" | "hi"; name?: string; href?: string; tip?: Tip };   // tip: the box shown when the pointer is on the boat (it then replaces the bare name)
// next: the next mark of the boat the chart is about (the leader on the Fleet page). On the chart it is drawn with the other marks
// in view; beyond the chart, an arrow on the edge points at it from that boat and says how far it is.
export default function FleetMap({ view, course, markers, track, note, next, open = "left" }: { open?: "left" | "right"; view: View; course: { lat: number; lon: number }[]; markers: Marker[]; track?: { lat: number; lon: number }[]; note?: { lat: number; lon: number; lines: string[] }; next?: { name: string; from: { lat: number; lon: number }; text: string } }) {
  const H = viewHeight(view), W = view.width;
  const grid: React.ReactNode[] = [];
  for (let lo = Math.ceil(view.lon0 / 5) * 5; lo <= view.lon1; lo += 5) { const [x] = project(view.lat0, lo, view); grid.push(<g key={`lo${lo}`}><line x1={x} y1={0} x2={x} y2={H} stroke="var(--hair)" strokeWidth={0.6} /><text x={x + 34 < W ? x + 3 : x - 3} y={H - 5} textAnchor={x + 34 < W ? "start" : "end"} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{Math.abs(lo)}°{lo < 0 ? "W" : "E"}</text></g>); }
  for (let la = Math.ceil(view.lat0 / 5) * 5; la <= view.lat1; la += 5) { const [, y] = project(la, view.lon0, view); grid.push(<g key={`la${la}`}><line x1={0} y1={y} x2={W} y2={y} stroke="var(--hair)" strokeWidth={0.6} /><text x={4} y={y - 3} fontFamily="var(--font-mono)" fontSize={9} fill="var(--graphite)">{Math.abs(la)}°{la < 0 ? "S" : "N"}</text></g>); }
  const all: Marker[] = [...markers, ...marksInView(view).map(m => ({ lat: m.lat, lon: m.lon, kind: "mark" as const, label: m.name }))];
  const target = next ? markNamed(next.name) : null;
  const ptr = next && target ? edgePointer(project(next.from.lat, next.from.lon, view), project(target.lat, target.lon, view), W, H, 16) : null;
  const targets: Target[] = markers.filter(m => m.tip).map(m => { const [x, y] = project(m.lat, m.lon, view); return { x: x - 9, y: y - 9, w: 18, h: 18, point: true, dot: { x, y }, href: m.href, label: m.name, tip: m.tip! }; });
  return <Tips width={W} height={H} targets={targets} fixed open={open}><svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: "var(--panel)" }} role="img" aria-label="Fleet positions">
    {grid}
    {landPaths(view).map((d, i) => <path key={i} d={d} fill="var(--land)" stroke="var(--coast)" strokeWidth={0.7} />)}
    <path d={courseD(course, view)} fill="none" stroke="var(--graphite)" strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />
    {track && track.length > 1 && <path d={"M" + track.map(p => project(p.lat, p.lon, view).map(n => n.toFixed(1)).join(",")).join(" L")} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />}
    {all.map((m, i) => { const [x, y] = project(m.lat, m.lon, view); return <g key={i}>
      {m.kind === "mark" && <path d={`M${x},${y - 6} L${x + 6},${y} L${x},${y + 6} L${x - 6},${y} Z`} fill="none" stroke="var(--magenta)" strokeWidth={1.6} />}
      {m.kind === "ghost" && <circle cx={x} cy={y} r={5} fill="none" stroke="var(--graphite)" strokeWidth={1.4} strokeDasharray="2 2" />}
      {m.kind === "dim" && <circle cx={x} cy={y} r={3} fill="var(--bar)" stroke="var(--panel)" strokeWidth={1.5} />}
      {(m.kind === "boat" || m.kind === "lead" || m.kind === "hi") && <circle cx={x} cy={y} r={m.kind === "hi" ? 5 : 4} fill={m.kind === "boat" ? "var(--ink)" : "var(--gold)"} stroke={m.kind === "hi" ? "var(--ink)" : "var(--panel)"} strokeWidth={m.kind === "hi" ? 1.5 : 2} />}
      {m.label && <text x={m.side === "l" ? x - 9 : x + 9} y={y + 4} textAnchor={m.side === "l" ? "end" : "start"} fontFamily={m.kind === "ghost" || m.kind === "mark" ? "var(--font-serif)" : "var(--font-sans)"} fontStyle={m.kind === "ghost" || m.kind === "mark" ? "italic" : "normal"} fontWeight={600} fontSize={11} fill={m.kind === "mark" ? "var(--magenta)" : m.kind === "ghost" ? "var(--graphite)" : "var(--ink)"}>{m.label}</text>}
    </g>; })}
    {ptr && next && (() => { const left = ptr.x < W / 2, low = ptr.y > H - 30; return <g>
      <g transform={`translate(${ptr.x.toFixed(1)},${ptr.y.toFixed(1)}) rotate(${ptr.deg.toFixed(1)})`}><path d="M0,-8 L5.5,4 L0,1 L-5.5,4 Z" fill="var(--magenta)" /></g>
      <text x={left ? ptr.x + 10 : ptr.x - 10} y={low ? ptr.y - 8 : ptr.y + 4} textAnchor={left ? "start" : "end"} fontFamily="var(--font-serif)" fontStyle="italic" fontWeight={600} fontSize={11} fill="var(--magenta)" className="map-halo">{next.text}</text></g>; })()}
    {note && (() => { const [x, y] = project(note.lat, note.lon, view); return note.lines.map((l, i) => <text key={i} x={x} y={y + i * 17} fontFamily="var(--font-marker)" fontSize={14} fill="var(--pencil)">{l}</text>); })()}
    {/* Drawn last, above every dot: an unseen disc over each boat that shows the boat's name while the pointer is on it. */}
    {markers.filter(m => m.name && !m.tip).map((m, i) => { const [x, y] = project(m.lat, m.lon, view), left = x > W - 96;
      const hit = <g className="map-boat"><circle cx={x} cy={y} r={9} fill="transparent" /><text className="map-name map-halo" x={left ? x - 9 : x + 9} y={y - 7} textAnchor={left ? "end" : "start"} fontFamily="var(--font-sans)" fontWeight={700} fontSize={11.5} fill="var(--ink)">{m.name}</text></g>;
      return m.href ? <a key={`n${i}`} href={m.href} aria-label={m.name}>{hit}</a> : <g key={`n${i}`}>{hit}</g>; })}
  </svg></Tips>;
}
