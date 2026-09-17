// site/app/sitemap.ts — /sitemap.xml: every page and one address per skipper. Behind the password gate until the site opens.
import type { MetadataRoute } from "next";
import { teams } from "@/lib/db";
import { SITE_URL, sitemapPaths } from "@/lib/seo";
export const revalidate = 86400;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ids = (await teams()).filter(t => !t.is_ghost).map(t => t.id);
  return sitemapPaths(ids).map(p => ({ url: `${SITE_URL}${p}`, changeFrequency: p === "/method" ? "monthly" : "hourly" }));
}
