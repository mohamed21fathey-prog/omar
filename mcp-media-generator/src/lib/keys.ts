// ============================================================
// نظام المفاتيح المتسلسلة — قلب المشروع:
// ترتيب تسلسلي صارم بترتيب الإضافة (ليس round-robin)، وتصنيف موحّد
// للأخطاء، وتحديث عدّادات كل مفتاح بعد كل محاولة، وإخفاء المفاتيح دائمًا.
// ============================================================
import crypto from "node:crypto";
import { getDb, ensureSchema, updateKey, type ApiKeyRecord } from "./turso";

import { cipherKey, isEncrypted, encryptApiKey, decryptApiKey } from "./keycipher";

// حوّل صف api_keys إلى سجل — يفك التشفير ويعيد كتابة المفاتيح النصية القديمة مشفرة
function rowToKeyRecord(r: Record<string, unknown>): ApiKeyRecord {
  const rec = r as unknown as ApiKeyRecord;
  const plain = decryptApiKey(rec.api_key);
  if (isEncrypted(rec.api_key)) {
    rec.api_key = plain;
  } else if ((rec.role || "customer") === "customer" && cipherKey()) {
    // ترحيل كسول: مفاتيح الزبائن النصية القديمة تُكتب مشفرة
    void getDb().execute({
      sql: "UPDATE api_keys SET api_key = ? WHERE id = ?",
      args: [encryptApiKey(plain), rec.id],
    }).catch(() => undefined);
  }
  return rec;
}

export class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export type ErrorClass = "disabled" | "exhausted" | "provider" | "params" | "temporary";

// ⚠️ التصنيف بالأولوية لكود الحالة HTTP من المزود — الأنماط النصية أدنى من ذلك
// ولمؤشرات صريحة فقط (لا أرقام 401/402 عارية ولا كلمات عامة مثل forbidden /
// unauthorized / credit / balance / quota — كانت تعطّل مفاتيح سليمة عند رفض
// المحتوى أو أي رسالة تحمل الأرقام/الكلمات هذه).
const AUTH_RE = /invalid api key|api key (is )?(not valid|invalid|incorrect)|invalid_api_key|authentication(_error)?|auth token/i;
const BALANCE_RE = /insufficient (balance|credits?|funds)|out of credits|not enough credits?|no enough balance|余额不足|余额|充值/i;
const CONTENT_RE = /content (policy|policies|violation|moderation)|content_policy|moderation (blocked|rejected)|safety system|flagged|inappropriate|sensitive content/i;
const PROVIDER_MODEL_RE = /model not found|unsupported model|model_not_found|unknown model/i;

// تصنيف موحّد لأي خطأ من مزود → يحدد الإجراء (تعطيل/استنفاد/التالي/توقف)
export function classifyProviderError(err: unknown): ErrorClass {
  const status = err instanceof ProviderError ? err.status : undefined;
  const msg = String(err instanceof Error ? err.message : err || "");

  // 1) الاستنزاف: 402 صراحةً أو نص رصيد صريح (بعض المزودين يرسلونه بحالة 400)
  if (status === 402 || BALANCE_RE.test(msg)) return "exhausted";
  // 2) رفض المحتوى = مشكلة معطيات الطلب لا المفتاح — لا تعطيل ولا استنزاف
  if (CONTENT_RE.test(msg)) return "params";
  // 3) مفتاح مرفوض: 401 صراحةً أو نص مصادقة صريح — 403 وحدها لا تعطّل (قد تكون WAF/منطقة)
  if (status === 401 || AUTH_RE.test(msg)) return "disabled";
  // 4) الموديل غير مدعوم لدى هذا المزود → انتقل للمزود التالي
  if (PROVIDER_MODEL_RE.test(msg) && (status === 400 || status === 404 || status === 422)) return "provider";
  // 5) معطيات الطلب — التبديل لن يحلها
  if (status === 400 || status === 422) return "params";
  // 6) 403 / 429 / 5xx / شبكة / timeout → مؤقتة (المفتاح يبقى سليمًا)
  if (status === 429 || (status !== undefined && status >= 500)) return "temporary";
  if (!(err instanceof ProviderError)) return "temporary"; // انقطاع شبكة/timeout/abort
  return "temporary";
}

// رسائل فشل المهام من المزود (بلا كود HTTP) — مؤشرات صريحة فقط
export function isKeyOrBalanceRelated(errorOrMsg: string | unknown): boolean {
  const msg = String(errorOrMsg instanceof Error ? errorOrMsg.message : errorOrMsg || "");
  return /insufficient (balance|credits?|funds)|out of credits|not enough credits?|余额不足|余额|充值|invalid api key|api key (is )?(not valid|invalid|incorrect)|invalid_api_key|authentication(_error)?/i.test(msg);
}

// عمود دور المفتاح (owner/customer) — ترحيل مرة واحدة لكل تشغيل خادم
let _roleCol: Promise<void> | null = null;
export function ensureKeyRoleColumn(): Promise<void> {
  if (!_roleCol) {
    _roleCol = getDb()
      .execute(`ALTER TABLE api_keys ADD COLUMN role TEXT DEFAULT 'customer'`)
      .then(() => undefined)
      .catch(() => undefined); // العمود موجود مسبقًا
  }
  return _roleCol;
}

// المفتاح المستنزف يبقى في القاعدة والقائمة — الاستثناء الوحيد هو التعطيل اليدوي
// role = "owner" → مفاتيح المالك أولًا (وحلقات القناة)؛ لو مفيش، الكل (توافق قديم)
// keyId = مفتاح زبون محدد → مفتاحه هو فقط بدون أي بديل (فوترة منفصلة)
// عمود ربط مفتاح الزبون بحسابه في الموقع (users.id) — للخصم التلقائي من رصيد الموقع
let _userCol: Promise<void> | null = null;
export function ensureKeyUserColumn(): Promise<void> {
  if (!_userCol) {
    _userCol = getDb()
      .execute(`ALTER TABLE api_keys ADD COLUMN user_id TEXT`)
      .then(() => undefined)
      .catch(() => undefined); // العمود موجود مسبقًا
  }
  return _userCol;
}

// الحساب المرتبط بمفتاح (عمود قديم محفوظ للتوافق — لا يُستخدم في الفوترة anymore)
// 💰 الفوترة الحالية: محفظة الموقع الواحدة (users.credits) عبر reserveSceneCredit

export async function getKeyPool(providers: string[], _role?: string, keyId?: string): Promise<ApiKeyRecord[]> {
  await ensureSchema();
  await ensureKeyRoleColumn();
  const placeholders = providers.map(() => "?").join(", ");
  const rs = await getDb().execute({
    sql: `SELECT * FROM api_keys WHERE status != 'disabled' AND provider IN (${placeholders}) ORDER BY created_at ASC, id ASC`,
    args: providers,
  });
  const pool = rs.rows.map((r) => rowToKeyRecord(r as unknown as Record<string, unknown>));
  if (keyId) return pool.filter((k) => k.id === keyId); // مفتاح محدد صراحةً (توافق قديم)
  // 💰 كل المفاتيح المخزنة في الخادم = مفاتيح المنصة السرية (عمود الدور القديم مُهمل —
  // لا يوجد مفاتيح زبائن بعد النموذج الموحد)
  return pool;
}

// تحديث حالة المفتاح + عدّاداته بعد كل محاولة (نجاحًا أو فشلًا)
export async function recordAttemptOnKey(
  key: ApiKeyRecord,
  opts: { ok: boolean; errorClass?: ErrorClass; error?: string }
): Promise<void> {
  const now = new Date().toISOString();
  if (opts.ok) {
    await updateKey(key.id, {
      bumpUsage: true,
      bumpSuccess: true,
      last_used_at: now,
      last_checked_at: now,
      last_error: null,
    });
    return;
  }
  const patch: Partial<Pick<ApiKeyRecord, "status" | "last_error" | "last_used_at" | "last_checked_at">> & {
    bumpUsage?: boolean;
    bumpFail?: boolean;
  } = {
    bumpUsage: true,
    bumpFail: true,
    last_used_at: now,
    last_checked_at: now,
    last_error: String(opts.error || "").slice(0, 500),
  };
  // المفتاح المستنزف يبقى في القاعدة والقائمة — الاستثناء الوحيد هو التعطيل اليدوي
  if (opts.errorClass === "disabled") patch.status = "disabled";
  if (opts.errorClass === "exhausted") patch.status = "exhausted";
  await updateKey(key.id, patch);
}

// إخفاء المفتاح: أول 7 + •••••••• + آخر 4 — القصير: أول 3 + ••••
export function maskKey(key: string): string {
  const k = String(key || "");
  if (k.length <= 14) return k.slice(0, 3) + "••••";
  return k.slice(0, 7) + "••••••••" + k.slice(-4);
}

// أرصدة مفاتيح kie عند المزود — للتحقق الإداري عند إضافة مفتاح (بدون كشف المفتاح نفسه)
export async function kieCreditFor(apiKey: string): Promise<{ credits: number | null; error: string | null }> {
  try {
    const res = await fetch("https://api.kie.ai/api/v1/chat/credit", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json()) as { code?: number; data?: number; msg?: string };
    if (res.ok && j.code === 200 && typeof j.data === "number") return { credits: j.data, error: null };
    return { credits: null, error: j.msg || `HTTP ${res.status}` };
  } catch (e) {
    return { credits: null, error: e instanceof Error ? e.message.slice(0, 120) : "خطأ اتصال" };
  }
}

// 💰 اختيار مفتاح التوليد — النموذج الموحد النهائي:
// كل التوليدات تمر عبر مفاتيح المنصة السرية داخل الخادم (حساب المنصة الرئيسي)،
// والفوترة من محفظة الموقع الواحدة (15 كريدت للمشهد). لا يوجد مفتاح زبون ولا
// أي اعتماد على حسابات خارجية من جانب العميل إطلاقًا.
// 1) مفاتيح المنصة موجودة → توليد + فوترة من المحفظة.
// 2) ولا واحد → التوليد متوقف برسالة واضحة وبدون أي خصم.
export async function pickGenerationKey(
  providers: string[],
  _userId?: string // معطّل — لم يعد له أي أثر (كان لمفتاح الزبون في النظام القديم)
): Promise<{ keyId?: string; keyRole?: string; platform: boolean; poolSize: number }> {
  const platform = await getKeyPool(providers);
  if (platform.length) return { keyRole: "owner", platform: true, poolSize: platform.length };
  return { platform: false, poolSize: 0 };
}
