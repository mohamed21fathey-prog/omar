// GET /api/facebook/callback — استكمال ربط فيسبوك: تبادل الكود → أول صفحة + انستجرام المرتبط → الحفظ
import { NextRequest, NextResponse } from "next/server";
import { setSettings } from "@/lib/settings";
import { sessionHmac } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const appId = process.env.FACEBOOK_APP_ID || "";
  const appSecret = process.env.FACEBOOK_APP_SECRET || "";
  const origin = currentOrigin(req);
  const fail = (reason: string) => NextResponse.redirect(`${origin}/episodes?fb=${encodeURIComponent(reason)}`, 302);

  const code = req.nextUrl.searchParams.get("code") || "";
  const state = req.nextUrl.searchParams.get("state") || "";
  const [tsStr, sig] = state.split(".");
  if (!appId || !appSecret) return fail("unconfigured");
  if (!code || !tsStr || !sig || Number(tsStr) < Date.now() - 10 * 60_000 || sessionHmac(`fbstart:${tsStr}`) !== sig) {
    return fail("state");
  }
  try {
    const t = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
        `${origin}/api/facebook/callback`
      )}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`,
      { signal: AbortSignal.timeout(20_000) }
    );
    const tj = (await t.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
    const userToken = tj.access_token || "";
    if (!userToken) return fail(tj.error?.message || "token");

    // الصفحات المُدارة + حساب انستجرام المرتبط — ناخد أول صفحة ونخزن توكن الصفحة (طويل الأمد)
    const p = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(
        userToken
      )}`,
      { signal: AbortSignal.timeout(20_000) }
    );
    const pj = (await p.json().catch(() => ({}))) as {
      data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username: string } }>;
      error?: { message?: string };
    };
    const page = pj.data?.[0];
    if (!page) return fail(pj.error?.message || "nopage");
    await setSettings({
      fb_page_id: page.id,
      fb_page_name: page.name || "",
      fb_page_token: page.access_token,
      ig_user_id: page.instagram_business_account?.id || "",
      ig_username: page.instagram_business_account?.username || "",
    });
    return NextResponse.redirect(`${origin}/episodes?fb=ok`, 302);
  } catch {
    return fail("exception");
  }
}
