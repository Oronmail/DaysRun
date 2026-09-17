// site/app/page.tsx — Fleet, last 24 hours
import FleetPage from "@/components/FleetPage";
export const revalidate = 900;
export default function Page() { return <FleetPage window="24h" />; }
