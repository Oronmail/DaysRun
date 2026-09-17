// site/app/api/health/route.ts — the one address an outside monitor watches: 200 while the pipeline is alive, 503 with the reason when
// it is not (lib/health.ts), 500 when the database cannot be read at all. Public on purpose: it gives two times, one of which is
// already printed in the site's top bar, and nothing else. Never cached.
import { NextResponse } from "next/server";
import { supabase, RACE } from "@/lib/db";
import { health } from "@/lib/health";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [sync, report] = await Promise.all([
      supabase.from("leaderboard_snap").select("fetched_at").eq("race_key", RACE).order("fetched_at", { ascending: false }).limit(1),
      supabase.from("fleet_stat").select("as_of").eq("race_key", RACE).order("as_of", { ascending: false }).limit(1)]);
    if (sync.error || report.error) throw new Error(sync.error?.message ?? report.error?.message);
    const h = health(sync.data?.[0]?.fetched_at ?? null, report.data?.[0]?.as_of ?? null, Date.now());
    return NextResponse.json(h, { status: h.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("health: the database could not be read:", e);        // the detail goes to the server log, never to the public answer
    return NextResponse.json({ ok: false, problems: ["the database could not be read"] }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
