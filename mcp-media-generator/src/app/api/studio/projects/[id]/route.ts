// ============================================================
// /api/studio/projects/[id] — تفاصيل مشروع (مع متابعة حالات المشاهد)
// GET: المشروع + مشاهده (تُحدَّث حالات التوليد من المزود تلقائيًا)
// PATCH: تعديل { title?, story?, aspect_ratio?, category?, characters?, status? }
// DELETE: حذف المشروع ومشاهده (بقرار صاحبه فقط)
// ============================================================
import { NextResponse } from "next/server";
import { readSession, getSessionUser } from "@/lib/auth";
import { getProject, updateProject, deleteProject, StudioError, StudioCharacter } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e: unknown): Response {
  if (e instanceof StudioError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "خطأ غير معروف";
  return NextResponse.json({ error: `⚠️ ${msg}`.slice(0, 300) }, { status: 500 });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const uid = readSession(req);
  if (!uid) return NextResponse.json({ error: "سجّل دخولك أولًا" }, { status: 401 });
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const { project, scenes } = await getProject(id, user.id);
    return NextResponse.json({ project, scenes });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const uid = readSession(req);
  if (!uid) return NextResponse.json({ error: "سجّل دخولك أولًا" }, { status: 401 });
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      title?: string; story?: string; aspect_ratio?: string; category?: string; characters?: StudioCharacter[]; status?: string;
    };
    const project = await updateProject(id, user.id, body);
    return NextResponse.json({ project });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const uid = readSession(req);
  if (!uid) return NextResponse.json({ error: "سجّل دخولك أولًا" }, { status: 401 });
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await deleteProject(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
