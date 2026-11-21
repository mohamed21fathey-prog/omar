// ============================================================
// /api/studio/projects — قائمة مشاريع المستخدم + إنشاء مشروع جديد
// GET: كل مشاريعي | POST: مشروع جديد { title, story, aspect_ratio, characters }
// ============================================================
import { NextResponse } from "next/server";
import { readSession, getSessionUser } from "@/lib/auth";
import { listProjects, createProject, StudioError, StudioCharacter } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e: unknown): Response {
  if (e instanceof StudioError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "خطأ غير معروف";
  return NextResponse.json({ error: `⚠️ ${msg}`.slice(0, 300) }, { status: 500 });
}

export async function GET(req: Request): Promise<Response> {
  const uid = readSession(req);
  if (!uid) return NextResponse.json({ error: "سجّل دخولك أولًا" }, { status: 401 });
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  try {
    const projects = await listProjects(user.id);
    return NextResponse.json({ projects });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const uid = readSession(req);
  if (!uid) return NextResponse.json({ error: "سجّل دخولك أولًا" }, { status: 401 });
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as {
      title?: string; story?: string; aspect_ratio?: string; category?: string; characters?: StudioCharacter[];
    };
    const project = await createProject(user.id, body);
    return NextResponse.json({ project }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
