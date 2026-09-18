// site/components/Charts.tsx — server-rendered SVG. Two-series palette validated for colour-vision safety: --series-1 #1F6FA3, --series-2 #B07F00.
import Tips from "./Tips";
import type { Tip } from "@/lib/tips";
const MONO = "var(--font-mono)";
const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}`;
// ylab formats the axis ticks and the end label. Default: signed numbers (gaps). A place chart plots −rank so that 1st is on top and passes v => String(-v).
export function LineChart({ series, xs, ymin, ymax, yticks, xlab, ylab = signed, width = 560, height = 250, tips }: { series: { name: string; color: string; vals: number[] }[]; xs: number[]; ymin: number; ymax: number; yticks: number[]; xlab: (i: number) => string; ylab?: (v: number) => string; width?: number; height?: number; tips?: Tip[] }) {
  const L = 46, R = 70, T = 12, B = 28, pw = width - L - R, ph = height - T - B;
  const X = (i: number) => L + (i - xs[0]) / (xs[xs.length - 1] - xs[0]) * pw, Y = (v: number) => T + (ymax - v) / (ymax - ymin) * ph;
  const step = xs.length > 1 ? pw / (xs.length - 1) : pw;   /* tips speak for the FIRST series: one column per point, a ring on the point itself */
  const targets = (tips ?? []).map((tip, j) => ({ x: X(xs[j]) - step / 2, y: T, w: step, h: ph, tip, dot: { x: X(xs[j]), y: Y(series[0].vals[j]) } }));
  return <Tips width={width} height={height} targets={targets}><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
    {yticks.map(v => <g key={v}><line x1={L} y1={Y(v)} x2={L + pw} y2={Y(v)} stroke={v === 0 ? "var(--graphite)" : "var(--hair)"} /><text x={L - 8} y={Y(v) + 4} textAnchor="end" fontFamily={MONO} fontSize={10} fill="var(--graphite)">{ylab(v)}</text></g>)}
    {xs.map(i => <text key={i} x={X(i)} y={height - 8} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="var(--graphite)">{xlab(i)}</text>)}
    {series.map(s => <g key={s.name}><path d={"M" + xs.map((i, j) => `${X(i).toFixed(1)},${Y(s.vals[j]).toFixed(1)}`).join(" L")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" /><circle cx={X(xs[xs.length - 1])} cy={Y(s.vals[s.vals.length - 1])} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} /><text x={X(xs[xs.length - 1]) + 9} y={Y(s.vals[s.vals.length - 1]) + 4} fontFamily={MONO} fontSize={11} fill="var(--ink)">{ylab(s.vals[s.vals.length - 1])}</text></g>)}
  </svg></Tips>;
}
export function VBars({ vals, labels, max, width = 528, height = 150, hi, color = "var(--series-1)", tips }: { vals: (number | null)[]; labels: string[]; max: number; width?: number; height?: number; hi?: Set<number>; color?: string; tips?: Tip[] }) {
  const L = 8, B = 22, T = 18, slot = (width - 2 * L) / vals.length, bw = Math.min(24, slot * 0.6);
  const targets = (tips ?? []).map((tip, i) => ({ x: L + slot * i, y: 0, w: slot, h: height - B, tip }));
  return <Tips width={width} height={height} targets={targets}><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
    <line x1={L} y1={height - B} x2={width - L} y2={height - B} stroke="var(--graphite)" />
    {vals.map((v, i) => { const cx = L + slot * i + slot / 2; if (v == null) return <text key={i} x={cx} y={height - B - 6} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="var(--graphite)">–</text>;
      const h = (height - B - T) * Math.min(v, max) / max; return <g key={i}><rect x={cx - bw / 2} y={height - B - h} width={bw} height={h} rx={4} fill={hi?.has(i) ? "var(--gold)" : color} /><text x={cx} y={height - B - h - 5} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="var(--ink)">{Math.round(v)}</text></g>; })}
    {labels.map((l, i) => <text key={l + i} x={L + slot * i + slot / 2} y={height - 6} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="var(--graphite)">{l}</text>)}
  </svg></Tips>;
}
export function DotPlot({ rows, width = 560, lo = -9, hi = 9 }: { rows: { label: string; a: number; b: number }[]; width?: number; lo?: number; hi?: number }) {
  const L = 150, pw = width - L - 20, X = (v: number) => L + (v - lo) / (hi - lo) * pw, H = 16 + rows.length * 26;
  return <svg width={width} height={H + 16} viewBox={`0 0 ${width} ${H + 16}`} style={{ display: "block" }}>
    {[-8, -4, 0, 4, 8].map(v => <g key={v}><line x1={X(v)} y1={4} x2={X(v)} y2={H - 8} stroke={v === 0 ? "var(--graphite)" : "var(--hair)"} strokeWidth={v === 0 ? 1.2 : 1} /><text x={X(v)} y={H + 10} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="var(--graphite)">{v > 0 ? `+${v}` : v}</text></g>)}
    {rows.map((r, i) => { const y = 16 + i * 26, a = Math.max(lo, Math.min(hi, r.a)), b = Math.max(lo, Math.min(hi, r.b)); return <g key={r.label}>
      <text x={L - 12} y={y + 4} textAnchor="end" fontFamily="var(--font-sans)" fontWeight={600} fontSize={12} fill="var(--ink)">{r.label}</text>
      <line x1={X(Math.min(a, b))} y1={y} x2={X(Math.max(a, b))} y2={y} stroke="var(--hair)" strokeWidth={2} />
      <circle cx={X(a)} cy={y} r={5} fill="var(--series-1)" stroke="var(--panel)" strokeWidth={2} /><rect x={X(b) - 4.5} y={y - 4.5} width={9} height={9} rx={1.5} fill="var(--series-2)" stroke="var(--panel)" strokeWidth={2} /></g>; })}
  </svg>;
}
export const Legend = ({ items }: { items: [string, string][] }) => <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--graphite)" }}>{items.map(([n, c]) => <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: c }} />{n}</span>)}</div>;
