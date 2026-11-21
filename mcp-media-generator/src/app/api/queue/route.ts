// ============================================================
// /api/queue — قائمة انتظار الحلقات (يحماها proxy بمستخدم الموقع)
// GET: عرض القائمة | POST: {action: add|delete|trigger}
// ============================================================
import { NextResponse } from "next/server";
import { addQueueItem, deleteQueueItem, deleteQueueByScope, listQueue, generateNextEpisode, retryQueueItem, setPublicFlag } from "@/lib/episodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const items = await listQueue();
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: { action?: string; title?: string; script?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  try {
    if (body.action === "add") {
      const title = (body.title || "").trim();
      const script = (body.script || "").trim();
      if (!title) return NextResponse.json({ error: "⚠️ اكتب عنوان الحلقة" }, { status: 400 });
      if (!script) return NextResponse.json({ error: "⚠️ اكتب سيناريو الحلقة" }, { status: 400 });
      if (script.length > 4000) return NextResponse.json({ error: "⚠️ السيناريو أطول من 4000 حرف" }, { status: 400 });
      const item = await addQueueItem(title, script);
      return NextResponse.json({ ok: true, item });
    }

    if (body.action === "delete") {
      const ok = await deleteQueueItem(String(body.id || ""));
      return NextResponse.json({ ok });
    }

    // حذف بالجملة: غير المكتملة أو المكتملة — من أزرار المصنع
    if (body.action === "delete_scope") {
      const scope = (body as { scope?: string }).scope === "done" ? "done" : "incomplete";
      const deleted = await deleteQueueByScope(scope);
      return NextResponse.json({ ok: true, deleted });
    }

    if (body.action === "retry") {
      const ok = await retryQueueItem(String(body.id || ""));
      return NextResponse.json({ ok });
    }

    if (body.action === "publish" || body.action === "unpublish") {
      const r = await setPublicFlag(String(body.id || ""), body.action === "publish");
      return NextResponse.json({ ok: true, ...r, public: body.action === "publish" });
    }
    if (body.action === "trigger") {
      const res = await generateNextEpisode((body.id || "").trim() || undefined);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    return NextResponse.json({ error: "action غير معروف" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}
