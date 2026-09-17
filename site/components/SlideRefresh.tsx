// site/components/SlideRefresh.tsx — keeps the daily slide current while it sits open in a browser tab or a streaming tool: once a
// minute it asks the server for the page again (router.refresh: no reload, no flash, nothing lost). The page is static, so the
// answer only changes when the worker has stored a new report and pinged the site.
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function SlideRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => { const id = setInterval(() => { router.refresh(); }, seconds * 1000); return () => clearInterval(id); }, [router, seconds]);
  return null;
}
