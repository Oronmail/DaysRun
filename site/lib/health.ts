// site/lib/health.ts — is the pipeline alive? The verdict of /api/health from the two times that say so: the newest sync with YB (the
// worker stores YB's leaderboard on every run) and the newest report derived. Pure, tested. The limits allow for what the system
// mends by itself (one missed hourly run, one late report) and no more.
export const SYNC_LIMIT_MIN = 130, REPORT_LIMIT_H = 6.5;
export type Health = { ok: boolean; last_sync: string | null; sync_age_min: number | null; latest_report: string | null; report_age_h: number | null; problems: string[] };
export function health(lastSync: string | null, latestReport: string | null, now: number): Health {
  const syncAge = lastSync ? Math.floor((now - Date.parse(lastSync)) / 60000) : null, reportRaw = latestReport ? (now - Date.parse(latestReport)) / 3600000 : null, reportAge = reportRaw == null ? null : Math.round(reportRaw * 10) / 10;   // judged on the raw age, shown rounded
  const problems: string[] = [];
  if (syncAge == null) problems.push("no sync recorded"); else if (syncAge > SYNC_LIMIT_MIN) problems.push(`no sync with YB for ${syncAge} minutes (limit ${SYNC_LIMIT_MIN})`);
  if (reportAge == null) problems.push("no report derived"); else if (reportRaw! >= REPORT_LIMIT_H) problems.push(`the latest report is ${reportAge} hours old (limit ${REPORT_LIMIT_H})`);
  return { ok: problems.length === 0, last_sync: lastSync, sync_age_min: syncAge, latest_report: latestReport, report_age_h: reportAge, problems };
}
