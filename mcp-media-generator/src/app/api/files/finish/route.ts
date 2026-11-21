// POST /api/files/finish — إنهاء رفع ملف والتحقق من اكتمال قطعه — محمي ببوابة الإدارة
// يرجع الرابط العام للملف /api/files/{id}/raw بعد نجاح التحقق
import { NextRequest, NextResponse } from "next/server";
import { finishUpload } from "@/lib/filestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "معرّف الرفع مطلوب" }, { status: 400 });
    const res = await finishUpload(id);
    if (res.error || !res.rec) {
      return NextResponse.json({ error: res.error || "تعذر إتمام الرفع" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, file: res.rec, url: `/api/files/${res.rec.id}/raw` });
  } catch {
    return NextResponse.json({ error: "تعذر إتمام الرفع" }, { status: 500 });
  }
}
