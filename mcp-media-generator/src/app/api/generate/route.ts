// ============================================================
// POST /api/generate — تجربة سريعة من لوحة الإدارة: نفس منطق أدوات
// generate_video / generate_image عبر runGeneration (بدون عميل MCP).
// محمي بنفس MCP_ACCESS_TOKEN إن ضُبط (مطابق لسلوك /mcp).
// ============================================================
import { NextResponse } from "next/server";
import { runGeneration, RequestError } from "@/lib/coordinator";
import { ensureSchema } from "@/lib/turso";
import { getBalances } from "@/lib/balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authOk(req: Request): boolean {
  const expected = process.env.MCP_ACCESS_TOKEN;
  if (!expected) return true;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(req: Request): Promise<Response> {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Unauthorized — مطلوب Authorization: Bearer <MCP_ACCESS_TOKEN>" }, { status: 401 });
  }

  let body: {
    type?: string;
    prompt?: string;
    image_url?: string;
    aspect_ratio?: string;
    resolution?: string;
    enable_audio?: boolean;
    duration?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const type = body.type === "image" ? "image" : "video";
  const prompt = (body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "⚠️ اكتب وصف المشهد أولًا" }, { status: 400 });
  if (prompt.length > 4096) return NextResponse.json({ error: "⚠️ الوصف أطول من 4096 حرفًا" }, { status: 400 });

  await ensureSchema();

  // 💰 لا تحقق من أي مفتاح خارجي قبل التوليد — التوليد يعتمد كليًا على الرصيد الداخلي
  // (الزبون يُخصم من محفظته فقط، ووقود المزود مسؤولية المنصة خلف الكواليس)

  try {
    const task =
      type === "video"
        ? await runGeneration({
            type: "video",
            model: "grok-imagine-video-1-5-preview",
            input: {
              prompt,
              ...(body.image_url ? { image_url: body.image_url } : {}),
              aspect_ratio: body.aspect_ratio || "auto",
              resolution: body.resolution || "480p",
              enable_audio: body.enable_audio ?? true,
              // النموذج يقبل 6-30 ثانية (توثيق grok-imagine 1.5) — أي قيمة أقل تُرفض من المزود
              duration: Math.min(30, Math.max(6, Math.round(Number(body.duration) || 8))),
            },
            waitSeconds: 10,
          })
        : await runGeneration({
            type: "image",
            model: "gpt-image-2-6/flare-text-to-image",
            input: {
              prompt,
              aspect_ratio: body.aspect_ratio || "auto",
              resolution: body.resolution || "1K",
              background: "auto",
              output_format: "png",
            },
            waitSeconds: 10,
          });

    return NextResponse.json({
      id: task.id,
      status: task.status,
      progress: task.progress,
      error_message: task.error_message,
      result_urls: task.result_urls,
    });
  } catch (e) {
    const msg = e instanceof RequestError ? e.message : `❌ حدث خطأ غير متوقع: ${e instanceof Error ? e.message : String(e)}`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
