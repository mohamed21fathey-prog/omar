// ============================================================
// /api/ads — عام للزبائن: إعدادات الإعلان فقط (بدون أي بيانات حساسة)
// لو أدسنس مفعّل من الإعدادات يظهر إعلان أدسنس، وإلا بانر داخلي في الواجهة
// ============================================================
import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const s = await getSettings();
    return NextResponse.json({
      adsense_client: s.adsense_client || "",
      adsense_slot: s.adsense_slot || "",
    });
  } catch {
    return NextResponse.json({ adsense_client: "", adsense_slot: "" });
  }
}
