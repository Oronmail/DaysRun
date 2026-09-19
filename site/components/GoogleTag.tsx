// site/components/GoogleTag.tsx — the Google tag (gtag.js) for Google Analytics 4, through next/script: run once for the whole visit
// and only after the page is interactive, so it never holds up the first paint. Renders nothing without an id. What the script
// does, and whom it turns away, is lib/analytics.ts (tested there); the id it is given has already passed that file's check.
import Script from "next/script";
import { gtagSnippet } from "@/lib/analytics";
export default function GoogleTag({ id }: { id: string | null }) {
  if (!id) return null;
  return <Script id="google-tag" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: gtagSnippet(id) }} />;
}
