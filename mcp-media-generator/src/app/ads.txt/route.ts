// GET /ads.txt — ملف أدسنس الرسمي يُبنى من إعداد adsense_client في قاعدة البيانات
// بعد موافقة جوجل على الموقع يقرأ الزاحف هذا الملف ليعتمد البيع للمشترين المعتمدين
// لو معرف الناشر مش مضبوط يرجع ملف فاضي (بدون خطأ) حتى لا يظهر 404 في التشخيص
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let body = "";
  try {
    const s = await getSettings();
    const pub = (s.adsense_client || "").replace(/[^0-9a-z]/gi, "").replace(/^ca/i, "");
    if (pub) {
      body = `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`;
    }
  } catch { /* قاعدة بيانات غير جاهزة — ملف فاضي */ }
  return new Response(body || "\n", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
