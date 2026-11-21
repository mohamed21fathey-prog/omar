// GET /api/auth/google/start — بدء تسجيل الدخول/التسجيل عبر Google (OAuth 2.0)
// redirect_uri = نفس الأصل الحالي + /api/auth/google/callback
import { NextRequest, NextResponse } from "next/server";
import { sessionHmac } from "@/lib/auth";

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
  if (!clientId) {
    return NextResponse.json(
      { error: "تسجيل جوجل غير مفعّل بعد — يحتاج GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في بيئة النشر" },
      { status: 503 }
    );
  }
  const ts = Date.now();
  const state = `${ts}.${sessionHmac(`gstart:${ts}`)}`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${currentOrigin(req)}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(url.toString(), 302);
}
