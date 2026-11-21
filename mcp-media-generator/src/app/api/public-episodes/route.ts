// ============================================================
// /api/public-episodes — عام للزبائن: أحدث الحلقات المكتملة
// للعرض في الصفحة الرئيسية (عنوان + رابط + تاريخ فقط — بدون أي بيانات إدارية)
// ============================================================
import { NextResponse } from "next/server";
import { listPublicEpisodes } from "@/lib/episodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ episodes: await listPublicEpisodes() });
  } catch (e) {
    return NextResponse.json(
      { episodes: [], error: e instanceof Error ? e.message : "خطأ غير متوقع" },
      { status: 500 }
    );
  }
}
