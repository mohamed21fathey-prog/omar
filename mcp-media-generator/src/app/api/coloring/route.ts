// GET /api/coloring — الكتب النشطة + الخصم + واتساب الطلبات — عام للزوار
// POST /api/coloring — إنشاء/تعديل/حذف كتاب — محمي ببوابة الإدارة (proxy)
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getUpload } from "@/lib/filestore";
import {
  listColoringBooks, createColoringBook, updateColoringBook,
  deleteColoringBook, finalPrice,
} from "@/lib/coloring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // ?all=1 — قائمة كاملة للأدمن (شاملة المخفي) — عادية: النشطة فقط للزوار
    const all = req.nextUrl.searchParams.get("all") === "1";
    const [books, s] = await Promise.all([listColoringBooks(!all), getSettings()]);
    const discount = Number(s.coloring_discount || 0);
    return NextResponse.json({
      discount,
      whatsapp: (s.admin_whatsapp || "").replace(/[^0-9]/g, ""),
      books: books.map((b) => ({
        id: b.id,
        title: b.title,
        price: b.price_egp,
        final: finalPrice(b.price_egp, discount),
        pages: b.pages,
        active: b.active,
        url: `/api/files/${b.file_id}/raw`,
      })),
    });
  } catch {
    return NextResponse.json({ discount: 0, whatsapp: "", books: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (action === "create") {
      const fileId = String(body.file_id || "").trim();
      const title = String(body.title || "").trim().slice(0, 120);
      const price = Number(body.price_egp);
      if (!fileId || !title) {
        return NextResponse.json({ error: "اختر ملف PDF واكتب اسم الكتاب" }, { status: 400 });
      }
      if (!Number.isFinite(price) || price < 0 || price > 10000) {
        return NextResponse.json({ error: "السعر غير صالح (0 - 10000ج)" }, { status: 400 });
      }
      const f = await getUpload(fileId);
      if (!f || f.kind !== "pdf") {
        return NextResponse.json({ error: "الملف غير موجود أو ليس PDF — ارفعه أولًا من مكتبة الملفات" }, { status: 400 });
      }
      await createColoringBook({
        id: crypto.randomUUID(),
        file_id: fileId,
        title,
        price_egp: price,
        pages: Math.max(0, Math.min(500, Number(body.pages) || 0)),
        sort: Math.max(0, Math.min(999, Number(body.sort) || 0)),
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "update") {
      const id = String(body.id || "");
      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 120);
      if (body.price_egp !== undefined) {
        const p = Number(body.price_egp);
        if (!Number.isFinite(p) || p < 0 || p > 10000) {
          return NextResponse.json({ error: "السعر غير صالح" }, { status: 400 });
        }
        patch.price_egp = p;
      }
      if (body.active !== undefined) patch.active = body.active ? 1 : 0;
      if (body.sort !== undefined) patch.sort = Math.max(0, Math.min(999, Number(body.sort) || 0));
      const ok = await updateColoringBook(id, patch);
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    if (action === "delete") {
      const ok = await deleteColoringBook(String(body.id || ""));
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    return NextResponse.json({ error: "action غير معروف" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "تعذر تنفيذ العملية" }, { status: 500 });
  }
}
