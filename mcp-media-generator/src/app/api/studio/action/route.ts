// ============================================================
// /api/studio/action — كل عمليات المشاهد والتوليد والدمج
// POST { action, ... }:
//   split        { project_id, count }        → تقسيم القصة لمشاهد (Gemini)
//   add_scene    { project_id, prompt }       → إضافة مشهد يدويًا
//   update_scene { scene_id, prompt?, scene_no? }
//   delete_scene { scene_id }
//   generate     { scene_id }                 → توليد الفيديو (15 كريدت)
//   merge        { project_id }               → دمج المشاهد المكتملة (≤10)
//   merge_status { project_id, merge_task_id } → متابعة مهمة الدمج وحفظ الرابط
//   publishkit   { project_id }               → 📦 حزمة النشر الترندية (عناوين/وصف/هاشتاجات/تعليق مثبت/وقت/غلاف)
// ============================================================
import { NextResponse } from "next/server";
import { readSession, getSessionUser } from "@/lib/auth";
import {
  splitStory, addScene, updateScene, deleteScene,
  generateScene, mergeProject, saveMergedUrl, StudioError,
} from "@/lib/studio";
import { refreshTask } from "@/lib/coordinator";
import { generatePublishKit } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(e: unknown): Response {
  if (e instanceof StudioError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "خطأ غير معروف";
  return NextResponse.json({ error: `⚠️ ${msg}`.slice(0, 300) }, { status: 500 });
}

export async function POST(req: Request): Promise<Response> {
  const uid = readSession(req);
  if (!uid) return NextResponse.json({ error: "سجّل دخولك أولًا" }, { status: 401 });
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const action = String(body.action || "");

  try {
    switch (action) {
      case "split": {
        const out = await splitStory(String(body.project_id), user.id, Number(body.count) || 4, typeof body.category === "string" ? body.category : undefined);
        return NextResponse.json({ ok: true, scenes: out.scenes, split_count: out.split_count, category: out.category });
      }
      case "add_scene": {
        const scenes = await addScene(String(body.project_id), user.id, String(body.prompt || ""));
        return NextResponse.json({ ok: true, scenes });
      }
      case "update_scene": {
        const scenes = await updateScene(String(body.scene_id), user.id, {
          prompt: body.prompt === undefined ? undefined : String(body.prompt),
          scene_no: body.scene_no === undefined ? undefined : Number(body.scene_no),
        });
        return NextResponse.json({ ok: true, scenes });
      }
      case "delete_scene": {
        const scenes = await deleteScene(String(body.scene_id), user.id);
        return NextResponse.json({ ok: true, scenes });
      }
      case "generate": {
        const out = await generateScene(String(body.scene_id), user.id);
        return NextResponse.json({
          ok: true,
          scene: out.scene,
          task_id: out.taskId,
          deducted: out.deducted,
          balance: out.balance,
        });
      }
      case "merge": {
        const out = await mergeProject(String(body.project_id), user.id);
        if (out.status === "completed" && out.merged_url) {
          const project = await saveMergedUrl(String(body.project_id), user.id, out.merged_url, out.taskId);
          return NextResponse.json({ ok: true, done: true, merged_url: project.merged_url, parts: out.parts });
        }
        // الدمج لسه شغال — الواجهة تستكمل بـ merge_status
        return NextResponse.json({ ok: true, done: false, merge_task_id: out.taskId, parts: out.parts });
      }
      case "merge_status": {
        const task = await refreshTask(String(body.merge_task_id));
        if (task.status === "completed" && task.result_urls.length) {
          const project = await saveMergedUrl(String(body.project_id), user.id, task.result_urls[0], task.id);
          return NextResponse.json({ ok: true, done: true, merged_url: project.merged_url, progress: 100 });
        }
        if (task.status === "failed") {
          return NextResponse.json({ ok: true, done: false, failed: true, error: task.error_message || "فشل الدمج" });
        }
        return NextResponse.json({ ok: true, done: false, progress: task.progress || 10 });
      }
      case "publishkit": {
        const pid = String(body.project_id || "");
        const { project, scenes } = await (await import("@/lib/studio")).getProject(pid, user.id);
        const story = scenes.map((s) => s.prompt).join(" ");
        const kit = await generatePublishKit(
          String(project.title || "حلقة كرتون"),
          story,
          String(project.category || "عام"),
          scenes.length
        );
        return NextResponse.json({ ok: true, kit });
      }
      default:
        return NextResponse.json({ error: "عملية غير معروفة" }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
