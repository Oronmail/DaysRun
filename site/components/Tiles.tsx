// site/components/Tiles.tsx
export default function Tiles({ items, cols = 4 }: { items: { k: string; v: string; s: string }[]; cols?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16 }}>
    {items.map(t => <div className="tile" key={t.k}><div className="k">{t.k}</div><div className="v">{t.v}</div><div className="s">{t.s}</div></div>)}
  </div>;
}
