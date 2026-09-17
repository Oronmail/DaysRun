// site/app/page.tsx (temporary — replaced in Task 12)
import Shell from "@/components/Shell";
import { latestFleet, boatStats } from "@/lib/db";
import { dateline } from "@/lib/format";
export const revalidate = 900;
export default async function Page() {
  const fleet = await latestFleet(); const boats = await boatStats(fleet.as_of);
  return <Shell active="Fleet" dateline={dateline(fleet.as_of, fleet.race_day)} title="FLEET POSITIONS"><ol>{boats.map(b => <li key={b.team_id}>{b.team.name} — {Math.round(b.dtf_nm)} nm</li>)}</ol></Shell>;
}
