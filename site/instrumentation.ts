// site/instrumentation.ts — the site's SERVER tells Sentry about its errors, when SENTRY_DSN is set where the site runs: a page
// that fails to re-render (Vercel then keeps serving the old one, so nobody would notice), a route that throws. Nothing here runs
// in a visitor's browser, and no browser SDK is installed: the site's promise that a visitor's browser talks to nobody else stands.
import * as Sentry from "@sentry/nextjs";
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;                                   // no DSN (a laptop, a test): silent
  Sentry.init({ dsn, environment: process.env.VERCEL_ENV ?? "development", tracesSampleRate: 0, sendDefaultPii: false });
}
export const onRequestError = Sentry.captureRequestError;
