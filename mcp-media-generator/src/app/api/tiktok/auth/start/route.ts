// GET /api/tiktok/auth/start — بدء ربط تيك توك (OAuth 2.0 + PKCE)
// الـverifier داخل الحالة الموقعة بسر التطبيق — صالحة 10 دقائق فقط
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  if (!clientKey) {
    return NextResponse.json(
      { error: "تيك توك غير مُعد — أضف TIKTOK_CLIENT_KEY و TIKTOK_CLIENT_SECRET للبيئة أولًا" },
      { status: 503 }
    );
  }
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const ts = Date.now();
  const payload = `${verifier}|${ts}`;
  const sig = crypto.createHmac("sha256", process.env.TIKTOK_CLIENT_SECRET || clientKey).update(`tt:${payload}`).digest("base64url");
  const state = `${Buffer.from(payload).toString("base64url")}.${sig}`;

  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("redirect_uri", `${currentOrigin(req)}/api/tiktok/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "user.info.basic,video.publish,video.upload");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url.toString(), 302);
}
