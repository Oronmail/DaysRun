// site/lib/seo.ts — what a search result, a browser tab and a share card say about each page: the words (one title and one
// description per page, none with a live number: a search result is read days after it was written), and the tags built from
// them. Next.js merges metadata SHALLOWLY (a page's openGraph replaces the layout's whole), so every page gets the full set from
// pageMeta() instead of overriding pieces. Addresses are relative: the layout's metadataBase (SITE_URL) makes them absolute.
import type { Metadata, MetadataRoute } from "next";
import { SITE_NAME, SITE_HOST } from "./format";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${SITE_HOST}`).replace(/\/+$/, "");
const RACE = "Golden Globe Race 2026";
export type Words = { title: string; description: string };

export const PAGES: Record<string, Words> = {
  "/": { title: `${SITE_NAME} · unofficial statistics for the ${RACE}`,
    description: "Places, 24-hour runs, records, duels and a ghost race against past winners, from every 4-hour position report. Unofficial and fan-made; not affiliated with the race." },
  "/w/4h": { title: `The fleet, last 4 hours · ${RACE} · ${SITE_NAME}`,
    description: `The ranking by distance to finish, with the average speed of every boat on the latest 4-hour leg. Unofficial statistics for the ${RACE}.` },
  "/w/7d": { title: `The fleet, last 7 days · ${RACE} · ${SITE_NAME}`,
    description: `The ranking by distance to finish, with the miles every boat sailed in the last 7 days. Unofficial statistics for the ${RACE}.` },
  "/skippers": { title: `The skippers · ${RACE} · ${SITE_NAME}`,
    description: `A page for every skipper of the ${RACE}: track, average speed on each 4-hour leg, daily runs, place day by day, ghosts. Unofficial statistics.` },
  "/ghosts": { title: `Ghost race against past voyages · ${SITE_NAME}`,
    description: `The fleet of the ${RACE} against the replayed voyages of Van Den Heede (2018), Neuschäfer (2022), Knox-Johnston and Moitessier (1968–69). Unofficial.` },
  "/records": { title: `Records: best 4-hour leg, 24-hour and 7-day runs · ${SITE_NAME}`,
    description: `The record boards of the ${RACE}: best 4-hour leg, best 24-hour run, best 7-day run, and the personal bests of every skipper. Unofficial statistics.` },
  "/records/7d": { title: `Records of the last 7 days · ${SITE_NAME}`,
    description: `The best 4-hour legs, 24-hour runs and 7-day runs of the last 7 days in the ${RACE}. Unofficial statistics.` },
  "/records/30d": { title: `Records of the last 30 days · ${SITE_NAME}`,
    description: `The best 4-hour legs, 24-hour runs and 7-day runs of the last 30 days in the ${RACE}. Unofficial statistics.` },
  "/course": { title: `Course, marks and sprints · ${SITE_NAME}`,
    description: `The course of the ${RACE} mark by mark: next mark and estimated arrival of every boat, sprint times, distance off the track of the leader. Unofficial.` },
  "/performance": { title: `How each boat sails: speed for the wind · ${SITE_NAME}`,
    description: `How each skipper of the ${RACE} sails: boat speed as a share of model wind speed, point of sail, steadiness, night against day. Unofficial statistics.` },
  "/boats": { title: `The boats, by design · ${SITE_NAME}`,
    description: `The designs of the ${RACE} compared: best place, median speed over 7 days, speed for the model wind upwind, reaching and running. Unofficial.` },
  "/conditions": { title: `Model wind and waves at each boat · ${SITE_NAME}`,
    description: `Model wind, gusts, waves, swell, current and pressure where each boat of the ${RACE} is, from Open-Meteo. Model values, not measured. Unofficial.` },
  "/method": { title: `Method and glossary: how the numbers are made · ${SITE_NAME}`,
    description: `What every figure means and how it is computed: the 4-hour grid, runs, records, ghosts, model wind, sources. Unofficial statistics for the ${RACE}.` },
};

export const SHARE_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: `${SITE_NAME}: unofficial statistics for the ${RACE}` };

function tags(path: string, w: Words): Metadata {
  return { title: { absolute: w.title }, description: w.description, alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title: w.title, description: w.description, images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title: w.title, description: w.description, images: [SHARE_IMAGE] } };
}
export function pageMeta(path: string): Metadata {
  const w = PAGES[path]; if (!w) throw new Error(`no title and description written for ${path}`);
  return tags(path, w);
}
type Who = { id: number; name: string; first_name: string | null; yacht: string | null; model: string | null };
export function skipperMeta(t: Who): { text: Words; meta: Metadata } {
  const boat = t.yacht ? ` on ${t.yacht}${t.model ? ` (${t.model})` : ""}` : t.model ? ` on a ${t.model}` : "";
  const text = { title: `${t.name} · ${RACE} · ${SITE_NAME}`,
    description: `${t.name}${boat}: place, 24-hour runs, average speed on each 4-hour leg, track and the boats nearby. Unofficial statistics.` };
  return { text, meta: tags(`/skipper/${t.id}`, text) };
}

/** Every address a search engine should know. The daily board is left out (it says noindex itself); /board only redirects to it. */
export const sitemapPaths = (skipperIds: number[]) => [...Object.keys(PAGES), ...skipperIds.map(id => `/skipper/${id}`)];
/** /dons-slide is NOT disallowed here on purpose: a crawler that may not fetch a page never reads its noindex. */
export const robotsRules = (): MetadataRoute.Robots => ({ rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${SITE_URL}/sitemap.xml` });

export const websiteJsonLd = () => ({ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/`, description: PAGES["/"].description, inLanguage: "en" });
/** For a script tag: "<" is written as its escape, so a value can never close the tag. */
export const jsonLdText = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
