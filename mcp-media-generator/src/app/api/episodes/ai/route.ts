// POST /api/episodes/ai — اكتب سيناريو حلقة بالذكاء الاصطناعي من فكرة واحدة
// body: { topic } → Gemini يكتب العنوان + السيناريو → يُضاف لقائمة انتظار المصنع
// حزمة النشر تُولّد ذكيًا داخل addQueueItem (مع رجوع آمن للنمط الثابت)
// الآن مع: صورة مصغرة تلقائية + فوترة ذاتية (مفتاح المشترك الخاص لو موجود)
import { NextResponse } from "next/server";
import { addQueueItem, generateGroupThumbnail } from "@/lib/episodes";
import { generateEpisodeFullAi, geminiConfigured } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  if (!geminiConfigured()) {
    return NextResponse.json(
      { error: "⚠️ مفتاح Gemini غير مضبوط — أضف GEMINI_API_KEY أولًا (مجاني من AI Studio)" },
      { status: 400 }
    );
  }
  let topic = "";
  try {
    const body = (await req.json()) as { topic?: string };
    topic = (body.topic || "").trim();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  if (!topic) return NextResponse.json({ error: "⚠️ اكتب فكرة الحلقة أولًا" }, { status: 400 });
  if (topic.length > 200) return NextResponse.json({ error: "⚠️ الفكرة طويلة جدًا — ملخصها في سطر" }, { status: 400 });

  // 💰 مفاتيح المنصة فقط — لا مفتاح زبون (إنتاج المنصة عبر مفاتيحها السرية)
  let keyId: string | undefined;

  try {
    const ai = await generateEpisodeFullAi(topic);
    const item = await addQueueItem(ai.title, ai.script, ai.kit, keyId);
    // صورة مصغرة تلقائية للسيناريو — بنفس نظام المجموعات (المفتاح هنا هو رقم العنصر نفسه)
    const thumb = await generateGroupThumbnail(item.id, ai.title, ai.script, "16:9", keyId)
      .catch(() => ({ ok: false as const, error: "فشل توليد الصورة المصغرة" }));
    return NextResponse.json({
      ok: true,
      id: item.id,
      title: item.title,
      script: item.script,
      publish: item.publish,
      thumbnail: thumb.ok ? { ok: true, url: thumb.url } : { ok: false, taskId: (thumb as { taskId?: string }).taskId, error: (thumb as { error?: string }).error },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "فشل توليد السيناريو" },
      { status: 500 }
    );
  }
}
