// site/lib/cron.ts — the fallback trigger's one decision. GitHub's scheduled workflows are best-effort: they run late, and on
// a new or quiet repository they can fail to run at all. Vercel's cron calls /api/cron/worker every hour; the worker is started
// from there only if no run (scheduled, manual or ours) began in the last `quietMinutes`.
export function shouldDispatch(lastRunCreatedAt: string | null | undefined, now: number, quietMinutes = 45): boolean {
  const t = lastRunCreatedAt ? Date.parse(lastRunCreatedAt) : NaN;
  return Number.isNaN(t) || now - t > quietMinutes * 60_000;
}
