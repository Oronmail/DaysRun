// site/app/records/page.tsx — records over the whole race
import RecordsPage from "@/components/RecordsPage";
import { pageMeta } from "@/lib/seo";
export const revalidate = 900;
export const metadata = pageMeta("/records");
export default function Page() { return <RecordsPage win="race" />; }
