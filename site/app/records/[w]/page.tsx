// site/app/records/[w]/page.tsx — records over the last 7 or 30 days; two static pages, nothing else matches
import { notFound } from "next/navigation";
import RecordsPage, { type RecWin } from "@/components/RecordsPage";
export const revalidate = 900;
export const dynamicParams = false;
export function generateStaticParams() { return [{ w: "7d" }, { w: "30d" }]; }
export default async function Page({ params }: { params: Promise<{ w: string }> }) {
  const { w } = await params;
  if (w !== "7d" && w !== "30d") notFound();
  return <RecordsPage win={w as RecWin} />;
}
