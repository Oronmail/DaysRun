// site/proxy.ts — password gate for the private preview (Next.js 16 renamed `middleware` to `proxy`; Node.js runtime).
// The password is the SITE_PASSWORD env var; a cookie holding sha-256("daysrun:" + password) passes for a year.
// Going public: delete this file (or set the matcher to "/api/never") and redeploy.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "daysrun_gate";
const MAX_AGE = 60 * 60 * 24 * 365;
const sha = (s: string) => createHash("sha256").update(s).digest();
const token = (pw: string) => sha("daysrun:" + pw).toString("hex");
const same = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));   // constant time, any lengths

function loginPage(next: string, bad: boolean) {
  const safeNext = next.replace(/[^\w\-./?=&%]/g, "");
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Day's Run · private preview</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F2EEE2;color:#1B1E24;font-family:Georgia,"Times New Roman",serif}
form{background:#FAF7EF;border-top:2px solid #DEB200;padding:28px 30px;width:min(92vw,360px)}
.eyebrow{font-family:"Helvetica Neue",Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:.22em;color:#7A6000}
h1{font-family:"Helvetica Neue",Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.12em;font-size:26px;margin:8px 0 6px;line-height:1.1}
p{font-style:italic;font-size:14px;color:#5A5F68;margin:0 0 18px}
input{width:100%;box-sizing:border-box;font-size:16px;padding:10px;background:#fff;color:#1B1E24;border:1px solid #C9C3B2;font-family:Menlo,monospace}
button{margin-top:12px;width:100%;padding:10px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;background:#1B1E24;color:#F2EEE2;border:0;font-weight:600;font-family:"Helvetica Neue",Arial,sans-serif}
.bad{color:#A8331F;font-size:13px;margin-top:8px}.foot{font-size:12px;color:#5A5F68;margin-top:16px}
</style></head><body><form method="post" action="/__login"><div class="eyebrow">DAY'S RUN</div><h1>Private preview</h1>
<p>unofficial statistics for the Golden Globe Race 2026</p>
<input name="pw" type="password" autocomplete="current-password" autofocus placeholder="password">
<input type="hidden" name="next" value="${safeNext}"><button>Open</button>${bad ? '<div class="bad">Wrong password.</div>' : ""}
<div class="foot">Not affiliated with the Golden Globe Race.</div></form></body></html>`,
    { status: bad ? 401 : 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export default async function proxy(request: NextRequest) {
  const url = new URL(request.url);
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return new Response("SITE_PASSWORD not configured", { status: 500 });   // fails closed
  const want = token(pw);

  if (url.pathname === "/__login" && request.method === "POST") {
    const form = await request.formData();
    const next = String(form.get("next") || "/");
    if (same(String(form.get("pw") || ""), pw)) {
      const path = /^\/(?![\/\\])/.test(next) ? next : "/";   // same-origin paths only (blocks //host and /\host)
      const res = NextResponse.redirect(new URL(path, request.url), 303);   // Next.js needs an absolute URL here
      res.cookies.set(COOKIE, want, { path: "/", maxAge: MAX_AGE, httpOnly: true, secure: true, sameSite: "lax" });
      return res;
    }
    return loginPage(next, true);
  }

  if (same(request.cookies.get(COOKIE)?.value ?? "", want)) return NextResponse.next();
  return loginPage(url.pathname + url.search, false);
}

// Everything is gated except Next's static assets and the site's icons (no race data in them), the worker's revalidation
// ping and Vercel's cron call, each of which carries its own secret.
export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|api/revalidate|api/cron).*)" };
