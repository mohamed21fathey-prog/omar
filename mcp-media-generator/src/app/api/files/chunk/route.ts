// POST /api/files/chunk — رفع قطعة واحدة من ملف (JSON: base64) — محمي ببوابة الإدارة
// كل قطعة ≤ 2.5MB خام — تحت حد body منصات السيرفرلس بعد ترميز base64
import { NextRequest, NextResponse } from "next/server";
import {
  CHUNK_RAW_BYTES, KIND_LIMITS, SAFE_IMAGE_MIMES,
  upsertUploadMeta, putChunk, validKind, safeName,
} from "@/lib/filestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "الطلب غير صالح" }, { status: 400 });
    const id = String(body.id || "").trim();
    const kind = String(body.kind || "");
    const idx = Number(body.idx);
    const total = Number(body.total);
    const mime = String(body.mime || "application/octet-stream").toLowerCase();
    if (!/^[0-9a-f-]{16,64}$/i.test(id)) {
      return NextResponse.json({ error: "معرّف الرفع غير صالح" }, { status: 400 });
    }
    if (!validKind(kind)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم (pdf / image / big فقط)" }, { status: 400 });
    }
    if (!Number.isInteger(idx) || !Number.isInteger(total) || idx < 0 || total < 1
        || idx >= total || total > Math.ceil(KIND_LIMITS[kind] / CHUNK_RAW_BYTES)) {
      return NextResponse.json({ error: "ترقيم القطع غير صالح" }, { status: 400 });
    }
    // الصور: أنواع آمنة فقط (بدون SVG) — PDF: النوع الصحيح — الكبير: أي ثنائي
    if (kind === "image" && !SAFE_IMAGE_MIMES.has(mime)) {
      return NextResponse.json({ error: "نوع الصورة غير مسموح (jpg/png/webp/gif/avif فقط)" }, { status: 400 });
    }
    if (kind === "pdf" && mime !== "application/pdf") {
      return NextResponse.json({ error: "ملف PDF فقط مسموح هنا" }, { status: 400 });
    }
    const data = Buffer.from(String(body.data || ""), "base64");
    if (!data.length || data.length > CHUNK_RAW_BYTES) {
      return NextResponse.json({ error: "حجم القطعة خارج الحدود" }, { status: 400 });
    }
    await upsertUploadMeta({ id, name: safeName(String(body.name || "")), mime, kind, total_chunks: total });
    await putChunk(id, idx, new Uint8Array(data));
    return NextResponse.json({ ok: true, idx });
  } catch {
    return NextResponse.json({ error: "تعذر حفظ القطعة" }, { status: 500 });
  }
}
