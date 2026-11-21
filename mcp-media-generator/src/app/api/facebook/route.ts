// GET /api/facebook — حالة الربط | POST {action: publish|publish_ig|disconnect, url, title, description}
// فيسبوك: فيديو على صفحة الصورة الشخصية عبر file_url (جوجل يسحب الملف بنفسه)
// انستجرام: حاوية Reels ثم media_publish — يحتاج حساب Instagram Business مرتبط بالصفحة
import { NextResponse } from "next/server";
import { getSettings, setSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const GRAPH = "https://graph.facebook.com/v19.0";

export async function GET(): Promise<Response> {
  try {
    const s = await getSettings();
    return NextResponse.json({
      configured: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
      connected: Boolean(s.fb_page_token && s.fb_page_id),
      page: s.fb_page_name || null,
      instagram: {
        linked: Boolean(s.ig_user_id && s.fb_page_token),
        username: s.ig_username || null,
      },
    });
  } catch {
    return NextResponse.json({ configured: false, connected: false, page: null, instagram: { linked: false, username: null } });
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    url?: string;
    title?: string;
    description?: string;
    caption?: string;
  };
  try {
    if (!process.env.FACEBOOK_APP_ID) {
      return NextResponse.json({ ok: false, error: "فيسبوك غير مُعد — أضف FACEBOOK_APP_ID و FACEBOOK_APP_SECRET للبيئة أولًا" }, { status: 503 });
    }
    const s = await getSettings();
    const token = s.fb_page_token || "";
    const pageId = s.fb_page_id || "";
    if (!token || !pageId) {
      return NextResponse.json({ ok: false, error: "⚠️ اربط صفحة فيسبوك أولًا — زر «اربط صفحة فيسبوك» فوق" }, { status: 400 });
    }

    // نشر فيديو على الصفحة — فيسبوك يسحب الملف من الرابط بنفسه (سريع، بدون رفع بايتات)
    if (body.action === "publish") {
      if (!body.url) return NextResponse.json({ ok: false, error: "⚠️ مفيش رابط فيديو" }, { status: 400 });
      const r = await fetch(`${GRAPH}/${pageId}/videos`, {
        method: "POST",
        body: new URLSearchParams({
          file_url: body.url,
          description: (body.description || body.title || "").slice(0, 5000),
          access_token: token,
        }),
        signal: AbortSignal.timeout(110_000),
      });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!r.ok || !j.id) return NextResponse.json({ ok: false, error: j.error?.message || `HTTP ${r.status}` }, { status: 502 });
      return NextResponse.json({ ok: true, post_id: j.id, url: `https://facebook.com/${j.id}` });
    }

    // نشر Reel على انستجرام — حاوية → انتظار المعالجة → media_publish
    if (body.action === "publish_ig") {
      const igUser = s.ig_user_id || "";
      if (!igUser) {
        return NextResponse.json(
          { ok: false, error: "⚠️ مفيش حساب انستجرام مربوط — اربط Instagram Business بحساب فيسبوك واعمل الاتصال من جديد" },
          { status: 400 }
        );
      }
      if (!body.url) return NextResponse.json({ ok: false, error: "⚠️ مفيش رابط فيديو" }, { status: 400 });
      const c = await fetch(`${GRAPH}/${igUser}/media`, {
        method: "POST",
        body: new URLSearchParams({
          media_type: "REELS",
          video_url: body.url,
          caption: (body.caption || body.title || "").slice(0, 2200),
          share_to_feed: "true",
          access_token: token,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const cj = (await c.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!c.ok || !cj.id) return NextResponse.json({ ok: false, error: cj.error?.message || `HTTP ${c.status}` }, { status: 502 });
      // انتظار جهوزية المعالجة (حتى ~75 ثانية)
      let statusCode = "IN_PROGRESS";
      for (let i = 0; i < 15 && statusCode === "IN_PROGRESS"; i++) {
        await new Promise((res) => setTimeout(res, 5000));
        const st = await fetch(`${GRAPH}/${cj.id}?fields=status_code&access_token=${encodeURIComponent(token)}`, {
          signal: AbortSignal.timeout(20_000),
        });
        const sj = (await st.json().catch(() => ({}))) as { status_code?: string };
        statusCode = sj.status_code || "IN_PROGRESS";
      }
      if (statusCode !== "FINISHED") {
        return NextResponse.json({ ok: false, error: `⚠️ معالجة انستجرام لسه ما خلصتش (${statusCode}) — جرب تاني بعد دقيقة` }, { status: 502 });
      }
      const p = await fetch(`${GRAPH}/${igUser}/media_publish`, {
        method: "POST",
        body: new URLSearchParams({ creation_id: cj.id, access_token: token }),
        signal: AbortSignal.timeout(60_000),
      });
      const pj = (await p.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
      if (!p.ok || !pj.id) return NextResponse.json({ ok: false, error: pj.error?.message || `HTTP ${p.status}` }, { status: 502 });
      return NextResponse.json({ ok: true, post_id: pj.id });
    }

    if (body.action === "disconnect") {
      await setSettings({ fb_page_id: "", fb_page_name: "", fb_page_token: "", ig_user_id: "", ig_username: "" });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "⚠️ action غير معروف" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "فشل الاتصال" }, { status: 500 });
  }
}
