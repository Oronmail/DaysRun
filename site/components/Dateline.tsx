// site/components/Dateline.tsx — the line above a page's title: the race day and the UTC date and time it is NOW, then which
// 4-hourly report the numbers on the page are from. A client component only because the pages are static and a clock is not:
// the server (and a browser without scripts) prints the report's own time, the browser then keeps the present time.
"use client";
import { useSyncExternalStore } from "react";
import { dateline, datelineNow, reportLabel } from "@/lib/format";
const subscribe = (tick: () => void) => { const id = setInterval(tick, 15_000); return () => clearInterval(id); };
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;      // the same value all minute long, as the hook requires
export default function Dateline({ asOf, raceDay, tail }: { asOf: string; raceDay: number; tail?: string }) {
  const now = useSyncExternalStore(subscribe, thisMinute, () => null);
  return <>{now == null ? dateline(asOf, raceDay) : datelineNow(now, asOf, raceDay)} <span style={{ color: "var(--graphite)" }}>· {reportLabel(now ?? new Date(asOf).getTime(), asOf)}{tail}</span></>;
}
