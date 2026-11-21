// POST /api/episodes/idea — من فكرة واحدة → حلقة كاملة أوتوماتيكيًا:
// 1) Gemini يكتب القصة كاملة من البداية للنهاية  2) يقسمها لمشاهد في الطابور
// 3) يحضر وصف يوتيوب + الكلمات المفتاحية لكل مشاهد المجموعة  4) يولد الصورة المصغرة
// الفوترة: مفتاح الزبون المختار — كل مشهد يتولد يخصم 15 كريدت من حسابه المرتبط
import { NextResponse } from "next/server";
import { addStoryScenes, generateGroupThumbnail } from "@/lib/episodes";
import { getDb } from "@/lib/turso";
import { splitStoryIntoScenes, geminiConfigured, generateStoryFromIdea, generatePublishKitAi } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  if (!geminiConfigured()) {
    return NextResponse.json({ error: "⚠️ مفتاح Gemini غير مضبوط — أضف GEMINI_API_KEY أولًا" }, { status: 400 });
  }
  let idea = "";
  let scenes = 5;
  let keyId: string | undefined;
  let aspect = "16:9";
  try {
    const body = (await req.json()) as { idea?: string; scenes?: number; key_id?: string; aspect_ratio?: string };
    idea = (body.idea || "").trim();
    scenes = Number(body.scenes) || 5;
    keyId = String(body.key_id || "").trim() || undefined;
    aspect = body.aspect_ratio === "9:16" ? "9:16" : "16:9";
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  if (!idea) return NextResponse.json({ error: "⚠️ اكتب فكرة الحلقة أولًا" }, { status: 400 });
  if (idea.length > 500) return NextResponse.json({ error: "⚠️ الفكرة طويلة — لخصها في سطرين" }, { status: 400 });
  if (scenes < 1 || scenes > 8) scenes = 5;
  try {
    const s = await getSettings();
    const maxScenes = Math.max(2, Math.min(8, Number(s.max_scenes) || 5));
    if (scenes > maxScenes) scenes = maxScenes;
  } catch {}

  // 💰 مفاتيح المنصة فقط — لا مفتاح زبون (الفوترة من محفظة الموقع للزبائن،
  // وحلقات المصنع إنتاج المنصة عبر مفاتيحها السرية)

  // 1+2) القصة كاملة من الفكرة → تقسيم لمشاهد متسلسلة
  const { title, story, yt_title, description, hashtags } = await generateStoryFromIdea(idea, scenes);
  const arr = await splitStoryIntoScenes(story, scenes);
  const { group, count } = await addStoryScenes(title, arr, keyId, aspect);

  // 3) حزمة النشر (الوصف + الكلمات المفتاحية) لكل مشاهد المجموعة فورًا
  let kitSource = "template";
  let kit: { youtube_title: string; youtube_description: string; hashtags: string; source: "gemini" | "template" } = {
    youtube_title: yt_title || title,
    youtube_description: description || `${story.slice(0, 180)}\n\n🌟 قصة ممتعة من كوكب الكرتون — اشترك وفعّل الجرس!`,
    hashtags: hashtags || "#قصص_عائلية #كوكب_الكرتون #كرتون_عربي #cartoon #shorts",
    source: "gemini",
  };
  try {
    const aiKit = await generatePublishKitAi(title, story);
    if (aiKit?.youtube_description) {
      kit = { youtube_title: aiKit.youtube_title || kit.youtube_title, youtube_description: aiKit.youtube_description, hashtags: aiKit.hashtags || kit.hashtags, source: aiKit.source || "gemini" };
      kitSource = aiKit.source || "gemini";
    }
  } catch { /* الرجوع للحزمة المبنية من القصة */ }
  await getDb().execute({
    sql: `UPDATE episode_queue SET publish_json = ? WHERE group_id = ?`,
    args: [JSON.stringify(kit), group],
  }).catch(() => undefined);

  // 4) الصورة المصغرة الذكية — بتنتظر حتى 35 ثانية، ولو اتأخرت تُجاب بزر التحديث
  const thumb = await generateGroupThumbnail(group, title, story, aspect, keyId).catch(() => ({ ok: false as const, error: "فشل توليد الصورة المصغرة" }));

  return NextResponse.json({
    ok: true,
    group,
    count,
    title,
    story: story.slice(0, 400),
    kit: { source: kitSource, hashtags: kit.hashtags },
    thumbnail: thumb.ok ? { ok: true, url: thumb.url } : { ok: false, taskId: (thumb as { taskId?: string }).taskId, error: (thumb as { error?: string }).error },
  });
}
