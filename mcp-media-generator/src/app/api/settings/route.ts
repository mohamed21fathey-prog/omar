// ============================================================
// /api/settings — إعدادات المحافظ وواتساب المشرف
// GET: القراءة | POST: الحفظ (المفاتيح المسموحة فقط)
// ============================================================
import { NextResponse } from "next/server";
import { getSettings, setSettings, SETTING_KEYS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ settings: await getSettings() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  let patch: Record<string, string>;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    patch = Object.fromEntries(
      Object.entries(body).filter(([k, v]) => (SETTING_KEYS as readonly string[]).includes(k) && typeof v === "string")
    ) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  try {
    await setSettings(patch);
    return NextResponse.json({ ok: true, settings: await getSettings() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "فشل الحفظ" }, { status: 500 });
  }
}
