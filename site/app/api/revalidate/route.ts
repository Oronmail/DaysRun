// site/app/api/revalidate/route.ts
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { latestFleet, raceSetup } from "@/lib/db";
import { filesToRenew, monthFile, monthsOfRace } from "@/lib/export";
const digest = (s: string) => createHash("sha256").update(s).digest();
export async function POST(req: Request) {
  // Fails closed when no secret is configured (an empty secret must never match an empty header), and compares digests
  // in constant time so the response time says nothing about the secret.
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const given = req.headers.get("x-revalidate-secret") ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) return NextResponse.json({ ok: false }, { status: 401 });
  revalidatePath("/", "layout");
  // The data files (app/data/[file]) are static and named one by one: the month being sailed on every ping; every month of the
  // race when the worker says history was re-derived (x-renew-data: all), so a finished month never disagrees with the site.
  let files = filesToRenew(Date.now());
  if (req.headers.get("x-renew-data") === "all") {
    const [fleet, setup] = await Promise.all([latestFleet(), raceSetup()]);
    files = monthsOfRace(setup.start_at, fleet.as_of).map(monthFile);
  }
  for (const f of files) revalidatePath(`/data/${f}`);
  return NextResponse.json({ ok: true, at: new Date().toISOString(), data: files });
}
