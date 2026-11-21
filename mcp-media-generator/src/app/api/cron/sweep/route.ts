// ============================================================
// /api/cron/sweep — كاسحة الاستقرار (Vercel cron كل 5 دقائق):
// 1) أي مهمة processing تجاوزت 30 دقيقة → failed (لا مهام بلا نهاية)
// 2) كل مشهد استوديو عالق (مهمة فاشلة/محذوفة/يتيمة) → failed + استرداد تلقائي
// 3) طابور الحلقات: مزامنة الفاشل + إعادة الأيتام للطابور
// يعمل بـ Bearer CRON_SECRET (المجدول يرسله تلقائيًا) — نفس نمط daily-episode
// ============================================================
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { healAllStuckScenes } from "@/lib/studio";
import { sweepQueue } from "@/lib/episodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authOk(req: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  if (expected) {
    const h = (req.headers.get("authorization") || "").trim();
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (m) {
      const a = Buffer.from(m[1].trim(), "utf8");
      const b = Buffer.from(expected, "utf8");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
    return false;
  }
  return !!req.headers.get("x-vercel-cron");
}

export async function GET(req: Request): Promise<Response> {
  if (!authOk(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scenes = await healAllStuckScenes().catch((e) => ({ error: String(e) }));
  const queue = await sweepQueue().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ok: true, at: new Date().toISOString(), scenes, queue });
}

export const POST = GET;
