// ============================================================
// POST /api/cleanup — التنظيف الشامل للبيانات غير المكتملة (أداة أدمن)
// محمي ببوابة الأدمن في proxy (المسار ليس في قائمة العامة)
// POST { scope: "incomplete" } — يحذف:
//   1) المهام الفاشلة والجارية من جدول tasks
//   2) قائمة انتظار المصنع غير المكتملة + صفوف الدمج الفاشلة + المصغرات اليتيمة
//      (عبر deleteQueueByScope — نفس منطق زر "حذف غير المكتملة" في المصنع)
//   3) مشاهد الاستوديو غير المكتملة (جارية/منتظرة/فاشلة — بدون لمس مسودات المشاريع النشطة)
//   4) عناصر مكتبة الفيديو غير الجاهزة (دمج عالق/فاشل)
//   5) المهام اليتيمة التي فقدت مرجعها في أي جدول
// مكتمل المكتملات يبقى سليمًا: الحلقات المنشورة والمشاهد المكتملة والمدمجة وdraft المشاريع.
// ============================================================
import { NextResponse } from "next/server";
import { getDb, deleteTasksByFilter } from "@/lib/turso";
import { deleteQueueByScope } from "@/lib/episodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (String(body.scope || "") !== "incomplete") {
    return NextResponse.json({ error: 'scope يجب أن يكون: "incomplete"' }, { status: 400 });
  }
  const summary: Record<string, number> = {};
  const db = getDb();
  try {
    // 1) المهام الفاشلة والجارية/المنتظرة — مكتمل يبقى
    summary.tasks_failed = await deleteTasksByFilter("failed");
    summary.tasks_inflight = await deleteTasksByFilter("processing");

    // 2) قائمة انتظار المصنع غير المكتملة + الدمج الفاشل + المصغرات اليتيمة (كود المصنع نفسه)
    summary.factory_queue = await deleteQueueByScope("incomplete");

    // 3) مشاهد الاستوديو غير المكتملة — draft للمشاريع النشطة محفوظ، والـmerged المرتبطة بمكتمل محفوظة
    try {
      const r = await db.execute(
        `DELETE FROM studio_scenes WHERE status IN ('pending','processing','producing','generating','failed')`
      );
      summary.studio_scenes = Number(r.rowsAffected || 0);
    } catch { summary.studio_scenes = -1; }

    // 4) مكتبة الفيديو: عناصر دمج عالقة أو فاشلة — الجاهز يبقى
    try {
      const r = await db.execute(`DELETE FROM video_library WHERE status != 'ready'`);
      summary.video_library = Number(r.rowsAffected || 0);
    } catch { summary.video_library = -1; }

    // 5) مهام يتيمة: توليد فيديو مرتبط بمشاهد/عناصر لم تعد موجودة — تنظيف احتياطي آمن
    try {
      const r = await db.execute(
        `DELETE FROM tasks WHERE type = 'video' AND id NOT IN (SELECT COALESCE(task_id, '') FROM episode_queue WHERE task_id IS NOT NULL)
           AND id NOT IN (SELECT COALESCE(task_id, '') FROM studio_scenes WHERE task_id IS NOT NULL)
           AND status != 'completed'`
      );
      summary.tasks_orphan = Number(r.rowsAffected || 0);
    } catch { summary.tasks_orphan = -1; }

    // 6) صفوف دمج يتيمة لمجموعات لم تعد موجودة في القائمة
    try {
      const r = await db.execute(
        `DELETE FROM episode_merges WHERE group_id IS NOT NULL AND group_id != '' AND group_id NOT IN (SELECT COALESCE(group_id, '') FROM episode_queue WHERE group_id IS NOT NULL)`
      );
      summary.merges_orphan = Number(r.rowsAffected || 0);
    } catch { summary.merges_orphan = -1; }

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
    return NextResponse.json({ error: msg, summary }, { status: 500 });
  }
}
