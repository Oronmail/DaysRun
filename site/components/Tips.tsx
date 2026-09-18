// site/components/Tips.tsx — hover (and tap) information over a server-drawn chart, with no script: every target is an HTML
// element placed in % over the SVG inside a position:relative wrapper, and its box is a child shown on :hover and :focus
// (tabIndex 0, so a tap opens it on a phone). The classes are shared with the rest of the site: .pt, .tipbox, .flip, .up.
import type { Tip } from "@/lib/tips";
import { side } from "@/lib/tips";
export type Target = { x: number; y: number; w: number; h: number; tip: Tip; dot?: { x: number; y: number }; row?: boolean; point?: boolean; href?: string; label?: string };   // row: a full-width target (a horizontal bar): its box opens inside the chart, under or over the row   // in the chart's own units (its viewBox)
export default function Tips({ width, height, targets, children, fixed, open }: { width: number; height: number; targets: Target[]; children: React.ReactNode; fixed?: boolean; open?: "left" | "right" }) {   // open: a narrow chart at the page's edge opens every box toward the page (the fleet chart: left on the Fleet page, right on a skipper's)   // fixed: the chart is drawn at its own width (the fleet chart), not stretched to its panel
  const pc = (v: number, of: number) => `${(v / of * 100).toFixed(3)}%`;
  return <div className="tipwrap" style={fixed ? { width, maxWidth: "100%" } : undefined}>{children}
    {targets.map((t, i) => { const style = { left: pc(t.x, width), top: pc(t.y, height), width: pc(t.w, width), height: pc(t.h, height), ["--x" as string]: pc(t.x, width) } as React.CSSProperties;
      // A linked target (a boat on the fleet chart): the box, a link inside it for a phone (where a tap opens the box and stays on the
      // page), and on a device with a pointer a transparent link over the whole target, so that a click still opens the skipper's page.
      return <div key={i} className={t.point ? "pt" : "pt bar"} tabIndex={0} style={style}>
        {t.dot && <span className="tipdot" style={{ left: pc(t.dot.x - t.x, t.w), top: pc(t.dot.y - t.y, t.h) }} />}
        {t.href && <a className="ptlink" href={t.href} aria-label={t.label} />}
        <div className={`tipbox${t.row ? ` row${t.y > height * 0.55 ? " up" : ""}` : open ? `${open === "left" ? " flip" : ""}${(t.dot ? t.dot.y : t.y) > height * 0.6 ? " up" : ""}` : side(t.x + t.w / 2, t.dot ? t.dot.y : t.y, width, height)}`}>
          <div className="tiphead">{t.tip.title}</div>{t.tip.lines.map((l, j) => <div key={j} className={j === 0 ? "num" : undefined}>{l}</div>)}
          {t.href && <a className="tiplink" href={t.href}>the skipper’s page →</a>}
        </div>
      </div>; })}
  </div>;
}
