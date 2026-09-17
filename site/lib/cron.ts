// site/lib/cron.ts — the fallback trigger's one decision. GitHub's scheduled workflows are best-effort: they run late, and on
// a new or quiet repository they can fail to run at all. Vercel's cron calls /api/cron/worker every hour; the worker is started
// from there only if no run (scheduled, manual or ours) began in the last `quietMinutes`.
export function shouldDispatch(lastRunCreatedAt: string | null | undefined, now: number, quietMinutes = 45): boolean {
  const t = lastRunCreatedAt ? Date.parse(lastRunCreatedAt) : NaN;
  return Number.isNaN(t) || now - t > quietMinutes * 60_000;
}
// How long the worker must have been quiet before the fallback starts it. Normally 45 minutes (an hourly rhythm). In the half hour
// after a 4-hourly report (0000, 0400, … UTC) only 4: Vercel's cron calls at :05, :10 and :20 then, so a new report reaches the site
// within minutes of YB publishing it, and the fixes that arrive late are picked up by the next call.
export function quietMinutesAt(now: number): number {
  const d = new Date(now);
  return d.getUTCHours() % 4 === 0 && d.getUTCMinutes() < 30 ? 4 : 45;
}
