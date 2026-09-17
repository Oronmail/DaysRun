// site/app/layout.tsx
import type { Metadata } from "next";
import { Montserrat, IBM_Plex_Mono, Source_Serif_4, Permanent_Marker } from "next/font/google";
import "./globals.css";
const sans = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-serif" });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-marker" });
export const metadata: Metadata = { title: `${process.env.NEXT_PUBLIC_SITE_NAME ?? "Day's Run"} · unofficial statistics for the Golden Globe Race 2026`, description: "Day's Run: unofficial, fan-made statistics for the Golden Globe Race 2026, computed from YB Tracking positions every four hours. Not affiliated with the race." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} ${marker.variable}`}><body>{children}</body></html>;
}
