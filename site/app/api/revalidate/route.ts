// site/app/api/revalidate/route.ts
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
const digest = (s: string) => createHash("sha256").update(s).digest();
export async function POST(req: Request) {
  // Fails closed when no secret is configured (an empty secret must never match an empty header), and compares digests
  // in constant time so the response time says nothing about the secret.
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const given = req.headers.get("x-revalidate-secret") ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) return NextResponse.json({ ok: false }, { status: 401 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
