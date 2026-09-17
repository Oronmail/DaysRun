// site/app/layout.tsx — <Analytics /> is Vercel Web Analytics: visits counted without cookies, from this site's own address (/_vercel/insights)
import type { Metadata } from "next";
import { Montserrat, IBM_Plex_Mono, Source_Serif_4, Permanent_Marker } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { PAGES, SITE_URL, SHARE_IMAGE } from "@/lib/seo";
import { SITE_NAME } from "@/lib/format";
import "./globals.css";
const sans = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-serif" });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-marker" });
// Each page brings its own full set of tags (lib/seo.ts: pageMeta). What stands here is the base address that makes their relative
// addresses absolute, and the words of a page that has none of its own (the not-found page): no canonical address for those.
export const metadata: Metadata = { metadataBase: new URL(SITE_URL), title: PAGES["/"].title, description: PAGES["/"].description,
  openGraph: { type: "website", siteName: SITE_NAME, title: PAGES["/"].title, description: PAGES["/"].description, images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title: PAGES["/"].title, description: PAGES["/"].description, images: [SHARE_IMAGE] } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} ${marker.variable}`}><body>{children}<Analytics /></body></html>;
}
