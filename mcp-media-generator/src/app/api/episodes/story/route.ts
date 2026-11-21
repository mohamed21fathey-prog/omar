// POST /api/episodes/story — حلقة كاملة من قصة واحدة
// body: { title, story, scenes } → Gemini يقسم القصة لمشاهد → مجموعة مرتبطة في الطابور
// تُولّد بالترتيب، وعند اكتمالها كلها تُدمج تلقائيًا في فيديو واحد + حزمة نشر ذكية
import { NextResponse } from "next/server";
import { addStoryScenes, generateGroupThumbnail } from "@/lib/episodes";
import { getDb } from "@/lib/turso";
import { splitStoryIntoScenes, geminiConfigured, generatePublishKitAi } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  if (!geminiConfigured()) {
    return NextResponse.json(
      { error: "⚠️ مفتاح Gemini غير مضبوط — أضف GEMINI_API_KEY أولًا" },
      { status: 400 }
    );
  }
  let title = "";
  let story = "";
  let scenes = 5;
  let keyId: string | undefined;
  let aspect = "16:9";
  try {
    const body = (await req.json()) as { title?: string; story?: string; scenes?: number; key_id?: string; aspect_ratio?: string };
    title = (body.title || "").trim();
    story = (body.story || "").trim();
    scenes = Number(body.scenes) || 5;
    // فوترة الزبون: مفتاحه هو فقط — فارغ = مفاتيح الموقع (حلقات القناة)
    keyId = String(body.key_id || "").trim() || undefined;
    // اتجاه الفيديو: شورتس 9:16 أو عرضي 16:9 — محتوى عائلي آمن لجميع أفراد العائلة
    aspect = body.aspect_ratio === "9:16" ? "9:16" : "16:9";
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: "⚠️ اكتب عنوان الحلقة" }, { status: 400 });
  if (!story) return NextResponse.json({ error: "⚠️ اكتب القصة أولًا" }, { status: 400 });
  if (title.length > 120) return NextResponse.json({ error: "⚠️ العنوان طويل جدًا" }, { status: 400 });
  if (story.length > 3000) return NextResponse.json({ error: "⚠️ القصة أطول من 3000 حرف — قسّمها لحلقتين" }, { status: 400 });
  if (scenes < 2 || scenes > 8) scenes = 5;

  // وضع التوفير: سقف المشاهد من الإعدادات — بيقلل استهلاك الكريدت لكل حلقة
  try {
    const s = await getSettings();
    const maxScenes = Math.max(2, Math.min(8, Number(s.max_scenes) || 5));
    if (scenes > maxScenes) scenes = maxScenes;
  } catch {}

  // 💰 مفاتيح المنصة فقط — لا مفتاح زبون (الفوترة من محفظة الموقع للزبائن،
  // وحلقات المصنع إنتاج المنصة عبر مفاتيحها السرية)

  try {
    const arr = await splitStoryIntoScenes(story, scenes);
    const { group, count } = await addStoryScenes(title, arr, keyId, aspect);

    // حزمة النشر فورًا (وصف يوتيوب + كلمات مفتاحية) — جاهزة مع الحلقة وليس بعد الدمج فقط
    let kit: { youtube_title: string; youtube_description: string; hashtags: string; source: string } = {
      youtube_title: title,
      youtube_description: `${story.replace(/\s+/g, " ").trim().slice(0, 180)}\n\n🌟 قصة ممتعة من كوكب الكرتون — اشترك وفعّل الجرس!`,
      hashtags: "#قصص_عائلية #كوكب_الكرتون #كرتون_عربي #cartoon #shorts",
      source: "template",
    };
    try {
      const aiKit = await generatePublishKitAi(title, story);
      if (aiKit?.youtube_description) {
        kit = { youtube_title: aiKit.youtube_title || title, youtube_description: aiKit.youtube_description, hashtags: aiKit.hashtags || kit.hashtags, source: aiKit.source || "gemini" };
      }
    } catch { /* الرجوع للنمط الثابت */ }
    await getDb().execute({
      sql: `UPDATE episode_queue SET publish_json = ? WHERE group_id = ?`,
      args: [JSON.stringify(kit), group],
    }).catch(() => undefined);

    // الصورة المصغرة الذكية فورًا — جاهزة مع الحلقة (فوترة من مفتاح المشترك لو مربوط)
    const thumb = await generateGroupThumbnail(group, title, story, aspect, keyId)
      .catch(() => ({ ok: false as const, error: "فشل توليد الصورة المصغرة" }));

    return NextResponse.json({
      ok: true,
      group,
      count,
      kit: { source: kit.source, hashtags: kit.hashtags },
      thumbnail: thumb.ok ? { ok: true, url: thumb.url } : { ok: false, taskId: (thumb as { taskId?: string }).taskId, error: (thumb as { error?: string }).error },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "فشل تقسيم القصة" },
      { status: 500 }
    );
  }
}
