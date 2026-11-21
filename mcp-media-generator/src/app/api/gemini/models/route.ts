// GET /api/gemini/models — فحص الموديلات المتاحة فعليًا للمفتاح (من منطقة مدعومة)
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY غير مضبوط" }, { status: 400 });
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(30000),
    });
    const j = (await res.json()) as {
      error?: { message?: string };
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    if (!res.ok) {
      return NextResponse.json({ error: j.error?.message || `HTTP ${res.status}` }, { status: 502 });
    }
    const usable = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => (m.name || "").replace("models/", ""))
      .filter((n) => /flash/i.test(n));
    return NextResponse.json({ ok: true, count: usable.length, models: usable });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.slice(0, 200) : "فشل الاتصال" },
      { status: 500 }
    );
  }
}
