// ============================================================
// /api/telegram — إعدادات قناة النشر الآلية
// GET: الحالة فقط (توكن مقنّع — لا يُعاد كاملًا أبدًا)
// POST: save | test | clear
// ============================================================
import { NextResponse } from "next/server";
import { clearTgConfig, getTgConfig, setTgConfig, tgConfigured, tgValidChatId, tgValidToken, telegramSend, telegramSendVideo } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mask(s: string): string {
  if (!s) return "";
  return s.length <= 8 ? "••••" : `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

async function status() {
  const c = await getTgConfig();
  return {
    configured: tgConfigured(c),
    bot_masked: mask(c.bot_token),
    chat_id: c.chat_id, // معرف القناة ليس سرًا حساسًا — يظهر ليسهل التحقق
  };
}

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await status());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: { action?: string; bot_token?: string; chat_id?: string; url?: string; caption?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  try {
    if (body.action === "save") {
      const token = (body.bot_token || "").trim();
      const chatId = (body.chat_id || "").trim();
      if (token && !tgValidToken(token)) return NextResponse.json({ error: "⚠️ التوكن مش شكل بوت تليجرام (رقم:سلسلة من BotFather)" }, { status: 400 });
      if (chatId && !tgValidChatId(chatId)) return NextResponse.json({ error: "⚠️ معرف القناة: @اسم_القناة أو الرقم الرمزي (يبدأ بـ -100)" }, { status: 400 });
      if (!token && !chatId) return NextResponse.json({ error: "⚠️ اكتب التوكن ومعرف القناة" }, { status: 400 });
      await setTgConfig({ bot_token: token || undefined, chat_id: chatId || undefined });
      const st = await status();
      return NextResponse.json({ ok: true, ...st, hint: st.configured ? "✅ محفوظ — فعّل البوت أدمن في قناتك وجرّب زر الاختبار" : "محفوظ جزئيًا — ناقص بيانات" });
    }
    if (body.action === "test") {
      const c = await getTgConfig();
      if (!tgConfigured(c)) return NextResponse.json({ ok: false, error: "⚠️ مفيش إعدادات محفوظة — احفظ التوكن والقناة أولًا" }, { status: 400 });
      const r = await telegramSend("✅ اتصال تليجرام شغال — كوكب الكرتون هيبلع القناة دي تلقائيًا بكل حلقة جديدة 🎬🚀");
      return NextResponse.json({ ...r, hint: r.ok ? "✅ وصلت الرسالة للقناة! من هنا البوت هيشرح الحلقات أوتوماتيك" : undefined });
    }
    if (body.action === "send_video") {
      if (!body.url) return NextResponse.json({ error: "⚠️ مفيش رابط فيديو للإرسال" }, { status: 400 });
      return NextResponse.json(await telegramSendVideo(body.url, body.caption || ""));
    }
    if (body.action === "clear") {
      await clearTgConfig();
      return NextResponse.json({ ok: true, ...(await status()) });
    }
    return NextResponse.json({ error: "⚠️ action غير معروف" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "فشل الحفظ" }, { status: 500 });
  }
}
