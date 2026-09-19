// site/lib/analytics.ts — Google Analytics 4 beside Vercel Web Analytics. Vercel's count is cookieless, so it knows a visitor for a
// day and no longer; Google's cookie is what tells a returning reader from a new one across the months of a race.
// The measurement id is the variable GA_MEASUREMENT_ID, set where the site runs (Vercel, Production) and never in this repository:
// no id, no tag, so a preview deploy, a build on someone's own machine and any copy of this repository report to nobody.
const GA4_ID = /^G-[A-Z0-9]{4,}$/;
export function gaMeasurementId(env: { GA_MEASUREMENT_ID?: string; VERCEL_ENV?: string }): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const id = (env.GA_MEASUREMENT_ID ?? "").trim();
  return GA4_ID.test(id) ? id : null;
}
// Google's snippet with one thing added in front: a browser driven by a program (this project's own screenshots and checks, which
// sign in and open every page) is turned away before anything of Google's is fetched; Vercel's script does the same by itself.
// A move between pages inside the site is counted by the tag (it watches the browser's history): nothing here knows the router.
// The id is written into a script on every page, so only the exact shape of one is accepted here too, whoever calls.
export function gtagSnippet(id: string): string {
  if (!GA4_ID.test(id)) throw new Error("not a Google Analytics 4 measurement id");
  return `(function(){if(navigator.webdriver||/Headless/.test(navigator.userAgent))return;` +
    `window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=gtag;` +
    `gtag('js',new Date());gtag('config','${id}');` +
    `var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${id}';document.head.appendChild(s);})();`;
}
