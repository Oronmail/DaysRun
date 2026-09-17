// site/lib/marks.ts — the marks of the course in the order of NOR C.1.3, for drawing them on the charts. The same list, with the
// same names, as the worker's config.MARKS (which decides which mark is next for each boat): change both together.
import type { View } from "./geo";
export type Mark = { name: string; lat: number; lon: number };
export const MARKS: Mark[] = ([
  ["Lanzarote", 28.85335, -13.82092], ["Trindade", -20.50345, -29.32654],
  ["45°S 40°E", -45, 40], ["45°S 65°E", -45, 65], ["45°S 90°E", -45, 90], ["45°S 110°E", -45, 110],
  ["Cape Leeuwin", -34.37516, 115.14697], ["Hobart Gate", -42.98192, 147.33503], ["50°S 168°E", -50, 168],
  ["49°S 150°W", -49, -150], ["49°S 130°W", -49, -130], ["49°S 110°W", -49, -110], ["50°S 90°W", -50, -90],
  ["Cape Horn", -55.98355, -67.26667], ["Les Sables-d’Olonne", 46.48158, -1.79084],
] as [string, number, number][]).map(([name, lat, lon]) => ({ name, lat, lon }));
export const markNamed = (name: string | null | undefined) => MARKS.find(m => m.name === name) ?? null;
// The marks that lie inside a chart's box, in course order.
export function marksInView(v: View): Mark[] {
  return MARKS.filter(m => m.lat > v.lat0 && m.lat < v.lat1 && m.lon > v.lon0 && m.lon < v.lon1);
}
// A next mark that is off the chart is pointed at from the chart's edge: where the straight line from a boat (from) to the mark
// (to), both in chart pixels, leaves the chart drawn `inset` pixels inside its frame. deg is the way the arrow points, clockwise
// from straight up the chart. Null when the mark is on the chart.
export function edgePointer(from: [number, number], to: [number, number], w: number, h: number, inset: number): { x: number; y: number; deg: number } | null {
  const [fx, fy] = from, [tx, ty] = to, dx = tx - fx, dy = ty - fy;
  if (tx >= inset && tx <= w - inset && ty >= inset && ty <= h - inset) return null;
  let t = 1;
  if (dx > 0) t = Math.min(t, (w - inset - fx) / dx); else if (dx < 0) t = Math.min(t, (inset - fx) / dx);
  if (dy > 0) t = Math.min(t, (h - inset - fy) / dy); else if (dy < 0) t = Math.min(t, (inset - fy) / dy);
  t = Math.max(0, t);
  return { x: fx + t * dx, y: fy + t * dy, deg: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360 };
}
// The Course page lists the marks in a few lines (the four 45°S waypoints are one line): is this line the one holding the next mark?
export const courseEntryIsNext = (marks: string[], nextMark: string) => marks.includes(nextMark);
