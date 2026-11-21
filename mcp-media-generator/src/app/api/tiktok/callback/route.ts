// GET /api/tiktok/callback — استكمال ربط تيك توك: تبادل الكود بـPKCE → حفظ التوكن
import { NextRequest, NextResponse } from "next/server";
import { setSettings } from "@/lib/settings";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function ttSig(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(`tt:${payload}`).digest("base64url");
}

export async function GET(req: NextRequest): Promise<Response> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || "";
  const origin = currentOrigin(req);
  const fail = (reason: string) => NextResponse.redirect(`${origin}/episodes?tt=${encodeURIComponent(reason)}`, 302);

  const code = req.nextUrl.searchParams.get("code") || "";
  const state = req.nextUrl.searchParams.get("state") || "";
  const [packed, sig] = state.split(".");
  const payload = Buffer.from(packed || "", "base64url").toString("utf8");
  const [verifier, tsStr] = payload.split("|");
  if (!clientKey || !clientSecret) return fail("unconfigured");
  if (!code || !verifier || !tsStr || Number(tsStr) < Date.now() - 10 * 60_000 || ttSig(clientSecret, payload) !== sig) {
    return fail("state");
  }
  try {
    const t = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${origin}/api/tiktok/callback`,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await t.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      open_id?: string;
      expires_in?: number;
      error?: string;
    };
    if (!j.access_token) return fail(j.error || "token");
    await setSettings({
      tiktok_access_token: j.access_token,
      tiktok_refresh_token: j.refresh_token || "",
      tiktok_open_id: j.open_id || "",
      tiktok_expires_at: String(Date.now() + (j.expires_in || 86400) * 1000),
    });
    return NextResponse.redirect(`${origin}/episodes?tt=ok`, 302);
  } catch {
    return fail("exception");
  }
}
