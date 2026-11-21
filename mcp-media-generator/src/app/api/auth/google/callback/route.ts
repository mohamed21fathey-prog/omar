// GET /api/auth/google/callback — استكمال جوجل: تبادل الكود → تحقق id_token → إنشاء/إيجاد المستخدم → كوكي جلسة
import { NextRequest, NextResponse } from "next/server";
import { findOrCreateGoogleUser, getUserById, sessionCookie, sessionHmac } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// الأصل الحالي — عبر ترويسات البروكسي (يعمل خلف Vercel)
function currentOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const origin = currentOrigin(req);
  const fail = (reason: string) => NextResponse.redirect(`${origin}/account?google=${encodeURIComponent(reason)}`, 302);

  if (!clientId || !clientSecret) return fail("unconfigured");
  const code = req.nextUrl.searchParams.get("code") || "";
  const state = req.nextUrl.searchParams.get("state") || "";
  const [tsStr, sig] = state.split(".");
  // حماية CSRF: الحالة موقعة بسر الجلسة وصلاحيتها 10 دقائق
  if (!code || !tsStr || !sig || Number(tsStr) < Date.now() - 10 * 60_000 || sessionHmac(`gstart:${tsStr}`) !== sig) {
    return fail("state");
  }
  try {
    const t = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tj = (await t.json()) as { id_token?: string; error?: string };
    const idToken = tj.id_token || "";
    if (!idToken) return fail(tj.error || "token");
    // التحقق من id_token: التوقيع من جوجل نفسها (جاء عبر TLS من token endpoint) — نتحقق من الجمهور والانتهاء
    const parts = idToken.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8")) as {
      email?: string;
      email_verified?: boolean;
      aud?: string;
      exp?: number;
    };
    if (payload.aud !== clientId) return fail("aud");
    if (!payload.exp || payload.exp < Date.now() / 1000) return fail("exp");
    if (!payload.email || payload.email_verified === false) return fail("email");

    const { id, isNew } = await findOrCreateGoogleUser(payload.email);
    const user = await getUserById(id);
    const version = Number((user as unknown as { session_version?: number })?.session_version) || 0;
    const c = sessionCookie(id, version);
    const res = NextResponse.redirect(`${origin}/account?google=${isNew ? "welcome" : "ok"}`, 302);
    res.cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch {
    return fail("exception");
  }
}
