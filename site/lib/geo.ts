// site/lib/geo.ts — equirectangular projection scaled by cos(mid-latitude), Natural Earth 50m land from world-atlas.
import { feature } from "topojson-client";
import land50 from "world-atlas/land-50m.json";
export type View = { lon0: number; lon1: number; lat0: number; lat1: number; width: number };
const k = (v: View) => v.width / ((v.lon1 - v.lon0) * Math.cos(((v.lat0 + v.lat1) / 2) * Math.PI / 180));
const kc = (v: View) => Math.cos(((v.lat0 + v.lat1) / 2) * Math.PI / 180);
export const viewHeight = (v: View) => (v.lat1 - v.lat0) * k(v);
export function project(lat: number, lon: number, v: View): [number, number] {
  return [(lon - v.lon0) * kc(v) * k(v), (v.lat1 - lat) * k(v)];
}
type Ring = [number, number][];
let rings: Ring[] | null = null;
function allRings(): Ring[] {
  if (rings) return rings;
  const fc = feature(land50 as never, (land50 as never as { objects: { land: never } }).objects.land) as unknown as { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };
  rings = [];
  for (const f of fc.features) {
    const polys = f.geometry.type === "MultiPolygon" ? (f.geometry.coordinates as number[][][][]) : [f.geometry.coordinates as number[][][]];
    for (const p of polys) rings.push(p[0] as Ring);
  }
  return rings;
}
export function landPaths(v: View): string[] {
  const out: string[] = [];
  for (const r of allRings()) {
    let minx = 180, maxx = -180, miny = 90, maxy = -90;
    for (const [x, y] of r) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    if (maxx < v.lon0 - 1 || minx > v.lon1 + 1 || maxy < v.lat0 - 1 || miny > v.lat1 + 1) continue;
    out.push("M" + r.map(([x, y]) => project(y, x, v).map(n => n.toFixed(1)).join(",")).join(" L") + " Z");
  }
  return out;
}
export function courseD(nodes: { lat: number; lon: number }[], v: View): string {
  const pts = nodes.filter(n => n.lat > v.lat0 - 2 && n.lat < v.lat1 + 2 && n.lon > v.lon0 - 2 && n.lon < v.lon1 + 2);
  return pts.length ? "M" + pts.map(n => project(n.lat, n.lon, v).map(x => x.toFixed(1)).join(",")).join(" L") : "";
}
export function fleetView(boats: { lat: number; lon: number }[], width: number): View {
  const lats = boats.map(b => b.lat), lons = boats.map(b => b.lon);
  const pad = 3;
  return { lon0: Math.floor(Math.min(...lons)) - pad - 2, lon1: Math.ceil(Math.max(...lons)) + pad + 4, lat0: Math.floor(Math.min(...lats)) - pad, lat1: Math.ceil(Math.max(...lats)) + pad, width };
}
