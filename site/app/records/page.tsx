// site/app/records/page.tsx — records over the whole race
import RecordsPage from "@/components/RecordsPage";
export const revalidate = 900;
export default function Page() { return <RecordsPage win="race" />; }
