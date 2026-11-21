// GET /api/files — قائمة ملفات المكتبة (بيانات وصفية فقط) — محمي ببوابة الإدارة
// DELETE /api/files — حذف ملف بالمعرّف { id } — محمي ببوابة الإدارة
import { NextRequest, NextResponse } from "next/server";
import { listUploads, deleteUpload } from "@/lib/filestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const files = await listUploads();
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ error: "تعذر قراءة قائمة الملفات" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "معرّف الملف مطلوب" }, { status: 400 });
    const ok = await deleteUpload(id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch {
    return NextResponse.json({ error: "تعذر حذف الملف" }, { status: 500 });
  }
}
