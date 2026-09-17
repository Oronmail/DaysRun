// site/app/api/cron/worker/route.ts — fallback trigger for the data worker (see lib/cron.ts). Called by Vercel Cron (vercel.json),
// which sends `Authorization: Bearer $CRON_SECRET`. Needs GH_DISPATCH_TOKEN: a fine-grained GitHub token for this one repository
// with Actions read and write. Without it the route answers 503 and does nothing.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { shouldDispatch, quietMinutesAt } from "@/lib/cron";
export const dynamic = "force-dynamic";
const REPO = "Oronmail/DaysRun", WORKFLOW = "worker.yml";
const digest = (s: string) => createHash("sha256").update(s).digest();
const gh = (path: string, init: RequestInit = {}) => fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/${path}`, { ...init, cache: "no-store",
  headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "daysrun-fallback-trigger", Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`, ...(init.headers ?? {}) } });
// When the thing that starts the worker cannot start it, nothing else will say so: tell Sentry, and wait until it is sent.
async function tell(message: string) { Sentry.captureMessage(message, "error"); await Sentry.flush(2000); }
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "", given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) return NextResponse.json({ ok: false }, { status: 401 });
  // Proves the site's alarm end to end (it needs the cron secret): this error must arrive as an e-mail from Sentry.
  if (new URL(req.url).searchParams.get("alarm-test") === "1") throw new Error("Day's Run alarm test (site): this error was raised on purpose. Nothing is wrong.");
  if (!process.env.GH_DISPATCH_TOKEN) return NextResponse.json({ ok: false, reason: "GH_DISPATCH_TOKEN is not set" }, { status: 503 });
  const runs = await gh("runs?per_page=1");
  if (!runs.ok) { await tell(`the fallback trigger could not ask GitHub for the worker's runs: HTTP ${runs.status} (the dispatch token may have expired)`);
    return NextResponse.json({ ok: false, reason: `GitHub answered ${runs.status} to the runs query` }, { status: 502 }); }
  const last: string | null = (await runs.json()).workflow_runs?.[0]?.created_at ?? null;
  const now = Date.now();
  if (!shouldDispatch(last, now, quietMinutesAt(now))) return NextResponse.json({ ok: true, dispatched: false, lastRun: last });
  const r = await gh("dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { command: "all" } }) });
  if (r.status !== 204) await tell(`the fallback trigger could not start the worker: GitHub answered HTTP ${r.status} to the dispatch`);
  return NextResponse.json({ ok: r.status === 204, dispatched: r.status === 204, lastRun: last, github: r.status }, { status: r.status === 204 ? 200 : 502 });
}
