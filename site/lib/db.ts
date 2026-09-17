// site/lib/db.ts — read-only access through the anon key; RLS allows select only.
import { createClient } from "@supabase/supabase-js";
export const RACE = process.env.NEXT_PUBLIC_RACE_KEY ?? "ggr2026";
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export type Team = { id: number; name: string; first_name: string | null; country_code: string | null; model: string | null; yacht: string | null; design_class: string | null; sail: string | null; is_ghost: boolean; ghost_label: string | null; status: string | null };
export type BoatStat = { team_id: number; as_of: string; rank: number; rank_change: number; dtf_nm: number; gap_nm: number; interval_nm: number | null; last_fix_at: string; stale: boolean; lat: number; lon: number; position_text: string; spd4: number | null; vmg4: number | null; cmg4: number | null; spd24: number | null; vmg24: number | null; run24_nm: number | null; spd7: number | null; run7_nm: number | null; best4_kn: number; best4_at: string | null; best24_nm: number; best24_at: string | null; best7_nm: number | null; best7_at: string | null; sailed_nm: number; made_good_nm: number; vmg7_kn: number; pb24: boolean; fleet_best24: boolean; vs_vdh_nm: number | null; vs_vdh_days: number | null; vs_kirsten_nm: number | null; vs_kirsten_days: number | null; next_mark: string; next_mark_nm: number; next_mark_eta: string | null; restart_at: string | null; speed_log_json: (number | null)[]; team: Team };
export type FleetStat = { as_of: string; race_day: number; leader_team_id: number; spread_nm: number; best_run24_nm: number; best_run24_team_id: number; ahead_vdh: number; ahead_kirsten: number; vdh_dtf_nm: number | null; kirsten_dtf_nm: number | null; next_mark: string; racing: number; retired: number };
export type RecordRow = { kind: string; win: string; rank: number; team_id: number; value: number; at: string; team: Team };
export type SprintRow = { sprint_name: string; team_id: number; start_at: string; end_at: string; hours: number; team: Team };
export type ConditionRow = { team_id: number; fix_at: string; wind_kn: number; gust_kn: number; wind_dir_deg: number; mslp_hpa: number; wave_m: number; swell_m: number; swell_period_s: number; current_kn: number; current_dir_deg: number; sst_c: number; model_at: string };   // model_at: the report the values belong to; older than fix_at when the weather service did not answer for the latest report
export type EventRow = { at: string; kind: string; team_id: number | null; title: string; body: string | null; page: string | null };
export type LegRow = { end_slot: string; speed_kn: number | null; dist_nm: number | null };

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T; };

// Supabase's API returns at most 1,000 rows per request. One boat's track passes that around race day 130 and its snapshot
// history around day 165, and the cut is silent, so the two unbounded reads below page through the table.
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const rows = ok(await page(from, from + size - 1));
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

export async function latestFleet(): Promise<FleetStat> {
  return ok(await supabase.from("fleet_stat").select("*").eq("race_key", RACE).order("as_of", { ascending: false }).limit(1).single());
}
export async function fleetAt(asOf: string): Promise<FleetStat> {
  return ok(await supabase.from("fleet_stat").select("*").eq("race_key", RACE).eq("as_of", asOf).single());
}
export async function boatStats(asOf: string): Promise<BoatStat[]> {
  return ok(await supabase.from("boat_stat").select("*, team!inner(*)").eq("race_key", RACE).eq("as_of", asOf).order("rank"));
}
export async function teams(): Promise<Team[]> { return ok(await supabase.from("team").select("*").eq("race_key", RACE).order("id")); }
export async function recordBoard(asOf: string): Promise<RecordRow[]> {
  return ok(await supabase.from("record_board").select("*, team!inner(*)").eq("race_key", RACE).eq("as_of", asOf).order("rank"));
}
export async function sprintResults(asOf: string): Promise<SprintRow[]> {
  return ok(await supabase.from("sprint_result").select("*, team!inner(*)").eq("race_key", RACE).eq("as_of", asOf).order("hours"));
}
// Model conditions for each boat's latest fix. Open-Meteo is a free service and a call can fail (the worker retries on its next
// run), so a boat falls back to its most recent values from the last 12 hours rather than leaving the pages empty; model_at says
// which report they belong to and the Conditions page marks them.
export async function conditionsAt(stats: BoatStat[]): Promise<ConditionRow[]> {
  if (!stats.length) return [];
  const ms = (iso: string) => new Date(iso).getTime();
  const ats = [...new Set(stats.map(s => s.last_fix_at))];
  const since = new Date(Math.max(...ats.map(ms)) - 12 * 3600 * 1000).toISOString();
  type Raw = Omit<ConditionRow, "model_at">;
  const [exact, recent] = await Promise.all([
    supabase.from("conditions").select("*").eq("race_key", RACE).in("fix_at", ats),
    supabase.from("conditions").select("*").eq("race_key", RACE).gte("fix_at", since).order("fix_at", { ascending: false }).limit(200),
  ]);
  const rows: Raw[] = [...ok<Raw[]>(exact), ...ok<Raw[]>(recent)];
  return stats.flatMap(s => {
    const c = rows.filter(r => r.team_id === s.team_id && ms(r.fix_at) <= ms(s.last_fix_at)).sort((a, b) => ms(b.fix_at) - ms(a.fix_at))[0];
    return c ? [{ ...c, model_at: c.fix_at, fix_at: s.last_fix_at }] : [];
  });
}
export async function eventsRecent(limit = 40): Promise<EventRow[]> {
  return ok(await supabase.from("event").select("at, kind, team_id, title, body, page").eq("race_key", RACE).order("at", { ascending: false }).limit(limit));
}
export async function legsFor(teamId: number, n = 42): Promise<LegRow[]> {
  const rows: LegRow[] = ok(await supabase.from("leg").select("end_slot, speed_kn, dist_nm").eq("race_key", RACE).eq("team_id", teamId).order("end_slot", { ascending: false }).limit(n));
  return rows.reverse();
}
export async function trackFor(teamId: number): Promise<{ at: string; lat: number; lon: number }[]> {
  return allRows((a, b) => supabase.from("fix").select("at, lat, lon").eq("race_key", RACE).eq("team_id", teamId).order("at").range(a, b));
}
export async function splitsFor(teamId: number) {
  return ok(await supabase.from("split").select("*").eq("race_key", RACE).eq("team_id", teamId).order("checkpoint_index"));
}
export async function boatHistory(teamId: number): Promise<{ as_of: string; rank: number; run24_nm: number | null }[]> {
  return allRows((a, b) => supabase.from("boat_stat").select("as_of, rank, run24_nm").eq("race_key", RACE).eq("team_id", teamId).order("as_of").range(a, b));
}
export async function raceSetup(): Promise<{ start_at: string; course_km: number; raw_setup: { course: { nodes: { lat: number; lon: number }[] }; poi: { lines: { name: string; nodes: string }[] } } }> {
  return ok(await supabase.from("race").select("start_at, course_km, raw_setup").eq("key", RACE).single());
}
