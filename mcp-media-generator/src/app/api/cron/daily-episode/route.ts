// ============================================================
// /api/cron/daily-episode — المنبه اليومي (Vercel Cron يوميًا 8 صباحًا بتوقيت القاهرة)
// يتصل تلقائيًا من Vercel بترويسة: Authorization: Bearer <CRON_SECRET>
// GET ?dry=1 = معاينة بدون توليد | GET/POST بدون dry = ولّد الحلقة التالية
// ============================================================
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { generateNextEpisode, nextPendingPreview } from "@/lib/episodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// لا قيم افتراضية — CRON_SECRET من البيئة حصرًا. مجدول Vercel يرسل
// Authorization: Bearer <CRON_SECRET> تلقائيًا، ونقبل ترويسة x-vercel-cron احتياطًا.
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
  return !!req.headers.get("x-vercel-cron"); // بدون سر مضبوط: المجدول الرسمي فقط
}

function unauthorized(): Response {
  return NextResponse.json({ error: "Unauthorized — Bearer CRON_SECRET مطلوب" }, { status: 401 });
}

export async function GET(req: Request): Promise<Response> {
  if (!authOk(req)) return unauthorized();
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  if (dry) {
    const next = await nextPendingPreview();
    return NextResponse.json({ dry: true, factory: "مصنع الحلقات اليومية", next });
  }
  const res = await generateNextEpisode();
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

export async function POST(req: Request): Promise<Response> {
  if (!authOk(req)) return unauthorized();
  const res = await generateNextEpisode();
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
