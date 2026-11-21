// GET /api/tasks — أحدث المهام + الإحصائيات (تتغذى عليها لوحة المهام كل 5 ثوانٍ)
// قبل العرض: تُحدَّث المهام الجارية (فيديو/دمج) من المزوّد حتى يتحرك شريط التقدم
// في اللوحة ويكتمل تلقائيًا دون الحاجة لاستدعاء get_task يدويًا.
import { NextResponse } from "next/server";
import { deleteTasksByFilter, listRecentTasks, taskStats } from "@/lib/turso";
import { refreshTask } from "@/lib/coordinator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "15", 10) || 15));
  const type = url.searchParams.get("type") || undefined;
  const status = url.searchParams.get("status") || undefined;

  try {
    const processing = await listRecentTasks(3, { status: "processing" });
    await Promise.allSettled(
      processing
        .filter((t) => t.type === "video" || t.type === "merge")
        .map((t) => refreshTask(t.id).catch(() => {}))
    );
  } catch {}

  const [tasks, stats] = await Promise.all([
    listRecentTasks(limit, { type, status }),
    taskStats(),
  ]);

  return NextResponse.json({
    stats,
    tasks: tasks.map((t) => ({
      id: t.id,
      provider: t.provider,
      model: t.model,
      type: t.type,
      prompt: t.prompt,
      status: t.status,
      progress: t.progress,
      result_urls: t.result_urls,
      error_message: t.error_message,
      attempts: t.attempts.length,
      created_at: t.created_at,
      completed_at: t.completed_at,
    })),
  });
}

// DELETE /api/tasks?filter=all|completed|failed|processing — أزرار الحذف في لوحة المهام
// المسار محمي بالبروكسي (Basic/TOKEN) — الحذف نهائي ولا يمس مهام لا علاقة لها بالفلتر
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "";
  if (!["all", "completed", "failed", "processing"].includes(filter)) {
    return NextResponse.json({ error: "filter يجب أن يكون: all | completed | failed | processing" }, { status: 400 });
  }
  try {
    const deleted = await deleteTasksByFilter(filter as "all" | "completed" | "failed" | "processing");
    return NextResponse.json({ ok: true, filter, deleted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "فشل حذف المهام" }, { status: 500 });
  }
}
