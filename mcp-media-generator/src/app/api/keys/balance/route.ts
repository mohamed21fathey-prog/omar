// GET /api/keys/balance — رصيد كل مفتاح kie مخزن
// فك التشفير يجري على السيرفر فقط — الاستجابة لا تحوي المفاتيح أبدًا (قناع + رصيد/خطأ)
import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/turso";
import { decryptApiKey } from "@/lib/keycipher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const db = getDb();
    const rs = await db.execute("SELECT id, label, api_key, status FROM api_keys WHERE provider = 'kie'");
    const keys: Array<{ id: string; label: string; status: string; masked: string; balance: number | null; error: string | null }> = [];
    for (const r of rs.rows) {
      const key = decryptApiKey(String(r.api_key || ""));
      const masked = key && !key.startsWith("enc:v1:") && key.length > 12
        ? `${key.slice(0, 8)}••••••••${key.slice(-4)}`
        : "••••";
      let balance: number | null = null;
      let error: string | null = null;
      if (!key || key.startsWith("enc:v1:")) {
        error = "تعذر فك التشفير — أعد إدخال المفتاح من اللوحة";
      } else if (/^\$env:/.test(key)) {
        error = "قيمة غير صالحة — لزقت مرجع PowerShell ($env:...) بدل المفتاح نفسه — احذف المفتاح وأدخل القيمة الحقيقية";
      } else {
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 12_000);
          const res = await fetch("https://api.kie.ai/api/v1/chat/credit", {
            headers: { Authorization: `Bearer ${key}` },
            signal: ctl.signal,
          });
          clearTimeout(t);
          const d = (await res.json().catch(() => ({}))) as { code?: number; data?: number; msg?: string };
          if (d?.code === 200 && typeof d.data === "number") balance = d.data;
          else error = d?.msg || `HTTP ${res.status}`;
        } catch {
          error = "فشل الاتصال بـ kie.ai — حاول مرة أخرى";
        }
      }
      keys.push({ id: String(r.id), label: String(r.label || ""), status: String(r.status || ""), masked, balance, error });
    }
    return NextResponse.json({ keys });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}
