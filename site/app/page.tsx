// site/app/page.tsx — Fleet, last 24 hours
import FleetPage from "@/components/FleetPage";
import { pageMeta, websiteJsonLd, jsonLdText } from "@/lib/seo";
export const revalidate = 900;
export const metadata = pageMeta("/");
// The script is data for search engines (the site's name and address), not code: nothing runs in the visitor's browser.
export default function Page() { return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(websiteJsonLd()) }} /><FleetPage window="24h" /></>; }
