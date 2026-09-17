// site/lib/highest.ts — which bars of a chart are gold: every bar whose PRINTED figure is the highest one printed. `print` is the
// chart's own label function, so the comparison is made on what the reader sees (a bar drawn gold beside an equal number drawn
// grey would read as a mistake); a missed report is never gold.
export function highest(vals: (number | null)[], print: (v: number) => string): Set<number> {
  const shown = vals.map(v => (v == null ? null : Number(print(v))));
  const top = shown.reduce<number | null>((m, v) => (v != null && !Number.isNaN(v) && (m == null || v > m) ? v : m), null);
  return new Set(top == null ? [] : shown.flatMap((v, i) => (v === top ? [i] : [])));
}
