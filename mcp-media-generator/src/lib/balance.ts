// ============================================================
// رصيد الحساب — استعلام كريدتس kie.ai لكل مفتاح مخزن
// Endpoint الرسمي: GET https://api.kie.ai/api/v1/chat/credit
// ============================================================
import { getDb } from "@/lib/turso";
import { decryptApiKey } from "@/lib/keycipher";

export interface KeyBalance {
  key_id: string;
  label: string;
  provider: string;
  status: string;
  credits: number | null;
  error: string | null;
}

export interface BalanceInfo {
  total: number | null;
  keys: KeyBalance[];
  checked_at: string;
}

export async function getBalances(): Promise<BalanceInfo> {
  const rs = await getDb().execute(
    "SELECT id, label, api_key, status, provider FROM api_keys ORDER BY created_at ASC"
  );
  const keys: KeyBalance[] = [];
  let total = 0;
  let any = false;

  for (const row of rs.rows) {
    const provider = (row.provider as string) || "";
    const item: KeyBalance = {
      key_id: row.id as string,
      label: (row.label as string) || "بدون اسم",
      provider,
      status: (row.status as string) || "active",
      credits: null,
      error: null,
    };
    if (provider === "kie") {
      // المفتاح مخزّن مشفرًا (enc:v1:...) — فك التشفير أولًا، وإلا أُرسل النص المشفر لkie.ai ورجع Unauthorized
      const key = decryptApiKey(String(row.api_key || ""));
      if (!key || key.startsWith("enc:v1:")) {
        item.error = "تعذر فك التشفير — أعد إدخال المفتاح من اللوحة";
        keys.push(item);
        continue;
      }
      if (/^\$env:/.test(key)) {
        item.error = "قيمة غير صالحة — أُدخل مرجع PowerShell بدل المفتاح";
        keys.push(item);
        continue;
      }
      try {
        const res = await fetch("https://api.kie.ai/api/v1/chat/credit", {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(20000),
        });
        const j = (await res.json()) as { code?: number; data?: number; msg?: string };
        if (res.ok && j.code === 200 && typeof j.data === "number") {
          item.credits = j.data;
          total += j.data;
          any = true;
          // شفاء ذاتي: لو المفتاح معلّم exhausted والرصيد رجع أعلى من صفر → فعّله
          if (item.status === "exhausted" && j.data > 0) {
            await getDb().execute({
              sql: "UPDATE api_keys SET status = 'active', last_error = NULL WHERE id = ?",
              args: [item.key_id],
            }).catch(() => undefined);
            item.status = "active";
          }
        } else {
          item.error = j.msg || `HTTP ${res.status}`;
        }
      } catch (e) {
        item.error = e instanceof Error ? e.message.slice(0, 120) : "خطأ اتصال";
      }
    } else {
      item.error = "الرصيد متاح لمزود kie فقط";
    }
    keys.push(item);
  }

  return { total: any ? Math.round(total * 100) / 100 : null, keys, checked_at: new Date().toISOString() };
}
