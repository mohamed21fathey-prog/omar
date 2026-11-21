// POST /api/episodes/thumbnail — جلب/تحديث الصورة المصغرة لمجموعة حلقة
// لو الصورة لسه بتتولد يحدّث المهمة من المزود ويخزن الرابط عند الاكتمال
import { NextResponse } from "next/server";
import { refreshGroupThumbnail } from "@/lib/episodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  let groupId = "";
  try {
    const body = (await req.json()) as { group_id?: string };
    groupId = String(body.group_id || "");
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  if (!groupId) return NextResponse.json({ error: "⚠️ group_id مطلوب" }, { status: 400 });
  const res = await refreshGroupThumbnail(groupId);
  return NextResponse.json(res, { status: res.ok ? 200 : 202 });
}
