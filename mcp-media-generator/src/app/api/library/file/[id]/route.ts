// GET /api/library/file/[id] — تقديم فيديو مرفوع من مكتبة الملفات
// رابط قدرة عام (UUID غير قابل للتخمين) — يخدم المتصفح للمعاينة
// وخدمة الدمج للتنزيل أثناء دمج الفيديوهات المرفوعة
// دائمًا X-Content-Type-Options: nosniff حتى لا يفسر المتصفح المحتوى كـ HTML (حماية XSS)
import { NextRequest, NextResponse } from "next/server";
import { getUpload, readAllChunks } from "@/lib/filestore";

// أنواع الفيديو المسموح تقديمها من المكتبة
const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }
  try {
    const rec = await getUpload(id);
    if (!rec || rec.chunks < rec.total_chunks) {
      return NextResponse.json({ error: "الفيديو غير موجود أو لم يكتمل رفعه" }, { status: 404 });
    }
    const bytes = await readAllChunks(id);
    if (!bytes) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    // فيديو فقط — أي نوع آخر غير مسموح بالتقديم من هنا (المكتبة للفيديو حصريًا)
    const mime = VIDEO_MIMES.has(rec.mime) ? rec.mime : "video/mp4";
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=3600",
        "Accept-Ranges": "none",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}
