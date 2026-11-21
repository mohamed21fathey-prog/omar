// GET /api/tiktok — حالة الربط | POST {action: publish|disconnect, url, title}
// النشر: post/publish/video/init بـPULL_FROM_URL — يظهر بوضع خاص مع التطبيقات غير المدققة
import { NextResponse } from "next/server";
import { getSettings, setSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TT_API = "https://open.tiktokapis.com/v2";

export async function GET(): Promise<Response> {
  try {
    const s = await getSettings();
    return NextResponse.json({
      configured: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
      connected: Boolean(s.tiktok_access_token),
      expires_at: s.tiktok_expires_at ? Number(s.tiktok_expires_at) : null,
    });
  } catch {
    return NextResponse.json({ configured: false, connected: false, expires_at: null });
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { action?: string; url?: string; title?: string };
  try {
    if (!process.env.TIKTOK_CLIENT_KEY) {
      return NextResponse.json({ ok: false, error: "تيك توك غير مُعد — أضف TIKTOK_CLIENT_KEY و TIKTOK_CLIENT_SECRET للبيئة" }, { status: 503 });
    }
    const s = await getSettings();
    const token = s.tiktok_access_token || "";
    if (!token) return NextResponse.json({ ok: false, error: "⚠️ اربط تيك توك أولًا — زر «اربط تيك توك» فوق" }, { status: 400 });

    if (body.action === "publish") {
      if (!body.url) return NextResponse.json({ ok: false, error: "⚠️ مفيش رابط فيديو" }, { status: 400 });
      const r = await fetch(`${TT_API}/post/publish/video/init/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          post_info: {
            title: (body.title || "حلقة جديدة 🎬 #كوكب_الكرتون").slice(0, 2200),
            privacy_level: "PRIVATE",
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
          },
          source_info: { source: "PULL_FROM_URL", video_url: body.url },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const j = (await r.json().catch(() => ({}))) as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
      if (!r.ok || !j.data?.publish_id) {
        return NextResponse.json({ ok: false, error: j.error?.message || `HTTP ${r.status}` }, { status: 502 });
      }
      return NextResponse.json({ ok: true, publish_id: j.data.publish_id, hint: "انشر بوضع خاص — ظهره من تطبيق تيك توك بعد المعالجة" });
    }

    if (body.action === "disconnect") {
      await setSettings({ tiktok_access_token: "", tiktok_refresh_token: "", tiktok_open_id: "", tiktok_expires_at: "" });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "⚠️ action غير معروف" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "فشل الاتصال" }, { status: 500 });
  }
}
