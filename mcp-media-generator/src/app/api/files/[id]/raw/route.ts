// GET /api/files/[id]/raw — تقديم الملف نفسه للزوار (عام عبر proxy)
// الصور وPDF تُقدَّم للعرض inline — الملفات الكبيرة تُقدَّم للتنزيل attachment
// دائمًا X-Content-Type-Options: nosniff حتى لا يفسر المتصفح المحتوى كـ HTML (حماية XSS)
import { NextRequest, NextResponse } from "next/server";
import { getUpload, readAllChunks } from "@/lib/filestore";

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
      return NextResponse.json({ error: "الملف غير موجود أو لم يكتمل رفعه" }, { status: 404 });
    }
    const bytes = await readAllChunks(id);
    if (!bytes) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
    // الكبير يُنزَّل دائمًا بنوع محايد — الصورة/PDF تُعرض داخل المتصفح
    const isBig = rec.kind === "big";
    const mime = isBig ? "application/octet-stream" : rec.mime;
    const disp = isBig ? "attachment" : "inline";
    const fname = encodeURIComponent(rec.name);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${disp}; filename*=UTF-8''${fname}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "تعذر تقديم الملف" }, { status: 500 });
  }
}
