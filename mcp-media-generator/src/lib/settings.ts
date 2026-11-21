// ============================================================
// إعدادات الموقع المخزنة في القاعدة — أرقام المحافظ وواتساب المشرف
// تتحدث من واجهة /recharge نفسها بدون إعادة نشر
// ============================================================
import { getDb, ensureSchema } from "@/lib/turso";

let _schema: Promise<void> | null = null;
function ensureSettingsSchema(): Promise<void> {
  if (!_schema) {
    _schema = getDb().execute(
      `CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`
    ).then(() => undefined);
  }
  return _schema;
}

export const SETTING_KEYS = [
  "vodafone_number",   // رقم فودافون كاش
  "instapay_handle",   // عنوان/رقم إنستاباي
  "wallet_holder_name",// اسم صاحب حساب المحفظة — يظهر للزبائن قبل التحويل
  "admin_whatsapp",    // واتساب المشرف (بمفتاح الدولة بدون +) — تُفتح عليه رسائل الطلبات
  "max_scenes",        // سقف مشاهد الحلقة الواحدة — وضع التوفير يقلل استهلاك الكريدت (افتراضي 5)
  "video_model",       // موديل توليد الفيديو في المصنع — الافتراضي grok؛ تغييره لموديل أرخص من docs.kie.ai يوفر الكريدت
  "adsense_client",    // معرف ناشر أدسنس (ca-pub-...) — لو اتحط يظهر إعلان أدسنس بدل البانر الداخلي
  "adsense_slot",      // معرف وحدة الإعلان (data-ad-slot) — يظهر مع adsense_client
  "coloring_discount", // نسبة الخصم العامة لكتب التلوين (0-90٪) — تُضبط من لوحة الإدارة فقط
  "paypal_email",      // إيميل استلام PayPal للشحن الدولي
  "bank_visa_note",    // تفاصيل فيزا/التحويل البنكي (اسم البنك + IBAN/رقم البطاقة)
  "fb_page_id",        // معرف صفحة فيسبوك المربوطة (النشر)
  "fb_page_name",      // اسم الصفحة للعرض
  "fb_page_token",     // توكن الصفحة طويل الأمد (سر — لا يظهر للزبائن)
  "ig_user_id",        // معرف حساب انستجرام Business المرتبط بالصفحة
  "ig_username",       // اسم مستخدم انستجرام للعرض
  "tiktok_access_token", // توكن تيك توك للنشر
  "tiktok_refresh_token",
  "tiktok_open_id",
  "tiktok_expires_at", // ميلي ثانية — انتهاء صلاحية التوكن
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getSettings(): Promise<Record<string, string>> {
  await ensureSchema();
  await ensureSettingsSchema();
  const rs = await getDb().execute(`SELECT key, value FROM site_settings`);
  const out: Record<string, string> = {};
  for (const r of rs.rows) out[r.key as string] = (r.value as string) || "";
  return out;
}

export async function setSettings(patch: Record<string, string>): Promise<void> {
  await ensureSettingsSchema();
  for (const [k, v] of Object.entries(patch)) {
    if (!(SETTING_KEYS as readonly string[]).includes(k)) continue;
    await getDb().execute({
      sql: `INSERT INTO site_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      args: [k, String(v).trim().slice(0, 200)],
    });
  }
}

// إعداد داخلي (مؤشر آخر تشغيل تلقائي) — بدون قائمة التصفية لأنه ليس من واجهة الإدارة
export async function setInternalSetting(key: string, value: string): Promise<void> {
  await ensureSettingsSchema();
  await getDb().execute({
    sql: `INSERT INTO site_settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    args: [key, String(value).slice(0, 200)],
  });
}
