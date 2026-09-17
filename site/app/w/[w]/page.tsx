// site/app/w/[w]/page.tsx — Fleet with the 4-hour or 7-day column; two static pages, nothing else matches
import { notFound } from "next/navigation";
import FleetPage, { type Win } from "@/components/FleetPage";
import { pageMeta } from "@/lib/seo";
export const revalidate = 900;
export const dynamicParams = false;
export function generateStaticParams() { return [{ w: "4h" }, { w: "7d" }]; }
export async function generateMetadata({ params }: { params: Promise<{ w: string }> }) { const { w } = await params; return w === "4h" || w === "7d" ? pageMeta(`/w/${w}`) : {}; }
export default async function Page({ params }: { params: Promise<{ w: string }> }) {
  const { w } = await params;
  if (w !== "4h" && w !== "7d") notFound();
  return <FleetPage window={w as Win} />;
}
