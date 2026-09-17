// site/lib/duels.ts — one sentence for a duel, from its numbers (worker/ggrstats/duels.py). Pure, tested.
// gap values are "boat behind minus boat ahead" in nm, so a negative past value means today's leader of the pair was behind then.
import { dayMon, hhmm } from "./format";
export type DuelNumbers = { gap_nm: number; gap24_nm: number | null; gap72_nm: number | null; lead_changes: number; passed_at: string | null };
export function duelStory(d: DuelNumbers, ahead: string, behind: string): string {
  const was = d.gap72_nm ?? d.gap24_nm, span = d.gap72_nm != null ? "three days" : "24 hours";
  if (d.passed_at) {
    const when = `${ahead} got ahead at ${hhmm(d.passed_at)} on ${dayMon(d.passed_at)}`;
    if (d.lead_changes >= 2) return `${when}. The lead has changed hands ${d.lead_changes} times in three days.`;
    return d.gap72_nm != null && d.gap72_nm <= -5 ? `${when}, after trailing by ${Math.round(-d.gap72_nm)} nm three days ago.` : `${when}.`;
  }
  if (was == null) return "Too few reports from both boats to tell the story yet.";
  const moved = Math.round(was - d.gap_nm);                       // positive: the boat behind has closed
  if (moved >= 3) return `${behind} has closed ${moved} nm in ${span}.`;
  if (moved <= -3) return `${ahead} has pulled out ${-moved} nm in ${span}.`;
  return `Nothing in it: the gap has moved ${Math.abs(moved)} nm in ${span}.`;
}
