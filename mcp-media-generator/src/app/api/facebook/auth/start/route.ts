// GET /api/facebook/auth/start — بدء ربط صفحة فيسبوك (Meta OAuth)
// الحالة موقعة بسر الجلسة + صلاحية 10 دقائق (حماية CSRF)
import { NextRequest, NextResponse } from "next/server";
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
  if (!appId) {
    return NextResponse.json(
      { error: "فيسبوك غير مُعد — أضف FACEBOOK_APP_ID و FACEBOOK_APP_SECRET للبيئة أولًا" },
      { status: 503 }
    );
  }
  const ts = Date.now();
  const state = `${ts}.${sessionHmac(`fbstart:${ts}`)}`;
  const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", `${currentOrigin(req)}/api/facebook/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish,business_management"
  );
  return NextResponse.redirect(url.toString(), 302);
}
