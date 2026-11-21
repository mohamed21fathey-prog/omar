// POST /api/keys/check — فحص صلاحية مفتاح ورصيده قبل الإضافة (بدون تخزين)
// kie: الرصيد عبر GET https://api.kie.ai/api/v1/chat/credit (Authorization: Bearer)
// باقي المزودين: تحقق شكل فقط — الفحص الخارجي الفعلي أول توليد
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  let body: { provider?: string; api_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const provider = String(body.provider || "").trim();
  const apiKey = String(body.api_key || "").trim();
  if (!apiKey) return NextResponse.json({ error: "أدخل المفتاح أولًا" }, { status: 400 });

  if (provider === "kie") {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 12_000);
      const r = await fetch("https://api.kie.ai/api/v1/chat/credit", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctl.signal,
      });
      clearTimeout(t);
      const d = (await r.json().catch(() => ({}))) as { code?: number; data?: number; msg?: string };
      if (d.code === 200 && typeof d.data === "number") {
        return NextResponse.json({
          valid: true,
          credit: d.data,
          message: `✅ مفتاح kie.ai سليم — الرصيد المتاح: ${d.data.toLocaleString("en")} كريدت`,
        });
      }
      return NextResponse.json({
        valid: false,
        message: `❌ المفتاح مرفوض من kie.ai: ${d.msg || `HTTP ${r.status}`} — انسخ المفتاح كاملًا من صفحة API Key وتأكد إن الحساب مُفعّل`,
      });
    } catch {
      return NextResponse.json({ valid: false, message: "⚠️ تعذر الوصول لـ kie.ai الآن — جرّب بعد لحظات" });
    }
  }

  // مزودون بلا نقطة فحص رصيد معلنة — تحقق شكل فقط
  if (!apiKey || apiKey.length < 12) {
    return NextResponse.json({ valid: false, message: "❌ المفتاح قصير جدًا — راجع النسخ" });
  }
  return NextResponse.json({
    valid: true,
    message: `ℹ️ شكل المفتاح سليم (${apiKey.slice(0, 6)}…${apiKey.slice(-4)}) — الفحص الفعلي أول توليد لدى ${provider === "apiframe" ? "Apiframe" : "CometAPI"}`,
  });
}
