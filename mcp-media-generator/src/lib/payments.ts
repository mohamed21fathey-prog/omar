// ============================================================
// طلبات شحن الرصيد — فودافون كاش / إنستاباي
// كل طلب يُحفظ في القاعدة + رسالة واتساب جاهزة للمشرف
// الأمان المالي: تأكيد ذري (صف واحد يفوز) + سجل حركات ledger بإحالة
// فريدة لكل (مرجع، سبب) تمنع الشحن/الاسترداد المزدوج + مرجع تحويل فريد
// الإيصالات (base64) تُقرأ عند الطلب فقط — لا تُعاد في القوائم (حجم Turso)
// ============================================================
import { getDb, ensureSchema } from "@/lib/turso";
import { setInternalSetting } from "@/lib/settings";

// 💰 ترحيل نهائي: إزالة الأرصدة المجانية من الحسابات الحالية — مع الحفاظ على المشتريات المدفوعة
// القاعدة: المسموح = مجموع حركات الشحن (recharge) + التعديلات الإدارية (admin).
// لو الرصيد الحالي أكبر من المسموح → يُخفض للمسموح مع تسجيل الفرق في ledger (مرجع فريد لكل مستخدم).
// حسابات بلا أي سجل ledger تُترك كما هي (أصل الرصيد غير معروف — قرار يدوي للمالك من اللوحة).
async function migrateRemoveFreeCredits(): Promise<void> {
  const flag = "free_credit_cleanup_v1";
  const done = await getDb().execute({ sql: "SELECT value FROM site_settings WHERE key = ?", args: [flag] }).catch(() => null);
  if (done && done.rows.length) return;
  const users = await getDb().execute(`SELECT id, COALESCE(credits, 0) AS c FROM users`).catch(() => null);
  let adjusted = 0;
  let removedTotal = 0;
  for (const row of users?.rows || []) {
    const uid = String(row.id);
    const cur = Number(row.c) || 0;
    if (cur <= 0) continue;
    const hist = await getDb().execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN reason IN ('recharge','admin') THEN delta ELSE 0 END), 0) AS allowed,
                   COUNT(*) AS n FROM ledger WHERE user_id = ?`,
      args: [uid],
    }).catch(() => null);
    if (!hist || !hist.rows.length || Number(hist.rows[0]?.n) === 0) continue; // بلا سجل → قرار يدوي
    const allowed = Math.max(Number(hist.rows[0]?.allowed) || 0, 0);
    if (cur > allowed) {
      const cut = cur - allowed;
      const rs = await getDb().execute({
        sql: `UPDATE users SET credits = ? WHERE id = ? AND COALESCE(credits, 0) = ?`,
        args: [allowed, uid, cur],
      });
      if (rs.rowsAffected > 0) {
        removedTotal += cut;
        adjusted++;
        await addLedger(uid, -cut, "admin", `cleanup:${uid}`).catch(() => undefined);
      }
    }
  }
  await setInternalSetting(flag, `${new Date().toISOString()} | حسابات معدّلة: ${adjusted} | رصيد مجاني مُزال: ${removedTotal}`).catch(() => undefined);
}

let _schema: Promise<void> | null = null;
function ensurePaymentsSchema(): Promise<void> {
  if (!_schema) {
    _schema = getDb().execute(
      `CREATE TABLE IF NOT EXISTS payment_requests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        method TEXT NOT NULL,
        amount TEXT NOT NULL,
        reference TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT
      )`
    ).then(async () => {
      // ربط الطلب بحساب الزبون (لو كان مسجل دخول عند التقديم)
      try { await getDb().execute(`ALTER TABLE payment_requests ADD COLUMN user_id TEXT`); } catch { /* العمود موجود */ }
      // بيانات تحقق خاصة: المحفظة المحوّل منها + صورة الإيصال (data URL اختياري)
      // تُقرأ في مسار /api/payments المحمي فقط — لا تُعاد في مسارات الزبائن
      for (const col of ["wallet_from TEXT", "receipt TEXT", "admin_note TEXT"]) {
        try { await getDb().execute(`ALTER TABLE payment_requests ADD COLUMN ${col}`); } catch { /* العمود موجود */ }
      }
      // تفرد مرجع التحويل — نفس العملية لا تُسجَّل مرتين (لو المرجع موجود)
      await getDb().execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference ON payment_requests (reference) WHERE reference IS NOT NULL AND reference != ''`
      ).catch(() => undefined); // لو تكرارات قديمة بالفعل يبقى الفحص اليدوي
      // سجل حركات الرصيد — مصدر الحقيقة المالي (شحن/خصم/استرداد/إحالة)
      await getDb().execute(
        `CREATE TABLE IF NOT EXISTS ledger (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          delta INTEGER NOT NULL,
          reason TEXT NOT NULL,      -- recharge | reserve | charge | refund | referral | admin
          ref_id TEXT NOT NULL,      // معرف العملية المرتبطة (مشهد/طلب/مستخدم)
          created_at TEXT DEFAULT (datetime('now'))
        )`
      ).catch(() => undefined);
      await getDb().execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_ref ON ledger (ref_id, reason)`
      ).catch(() => undefined);
      // 💰 الترحيل الواحد: إزالة الأرصدة المجانية القديمة (يُنفذ مرة واحدة فقط)
      await migrateRemoveFreeCredits().catch(() => undefined);
    });
  }
  return _schema;
}

export interface PaymentRequest {
  id: string;
  name: string;
  method: string; // vodafone | instapay
  amount: string;
  reference: string | null;
  status: string; // pending | confirmed | rejected
  user_id: string | null; // حساب الزبون المسجل (null = زائر بدون حساب)
  wallet_from: string | null; // رقم المحفظة المحوّل منها — للمشرف فقط
  receipt: string | null; // صورة الإيصال (data URL) — للمشرف فقط وعند الطلب فقط
  admin_note: string | null;
  created_at: string | null;
}

export async function createPaymentRequest(
  name: string,
  method: string,
  amount: string,
  reference: string,
  userId?: string | null,
  walletFrom?: string | null,
  receipt?: string | null
): Promise<PaymentRequest> {
  await ensureSchema();
  await ensurePaymentsSchema();
  const id = crypto.randomUUID();
  await getDb().execute({
    sql: `INSERT INTO payment_requests (id, name, method, amount, reference, user_id, wallet_from, receipt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, name, method, amount, reference || null, userId || null, walletFrom || null, receipt || null],
  });
  return { id, name, method, amount, reference: reference || null, status: "pending", user_id: userId || null, wallet_from: walletFrom || null, receipt: receipt || null, admin_note: null, created_at: new Date().toISOString() };
}

// القائمة بدون إيصالات (هي base64 حتى 700KB للطلب — تثقل القاعدة والاستجابة)
// الإيصال يُجلب فرديًا بـ getPaymentReceipt عند الطلب
export async function listPaymentRequests(): Promise<PaymentRequest[]> {
  await ensurePaymentsSchema();
  const rs = await getDb().execute(`SELECT id, name, method, amount, reference, status, user_id, wallet_from, admin_note, created_at FROM payment_requests ORDER BY created_at DESC LIMIT 30`);
  return rs.rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    method: r.method as string,
    amount: r.amount as string,
    reference: (r.reference as string) || null,
    status: (r.status as string) || "pending",
    user_id: (r.user_id as string) || null,
    wallet_from: (r.wallet_from as string) || null,
    receipt: null, // عند الطلب فقط
    admin_note: (r.admin_note as string) || null,
    created_at: (r.created_at as string) || null,
  }));
}

export async function getPaymentReceipt(id: string): Promise<string | null> {
  await ensurePaymentsSchema();
  const rs = await getDb().execute({ sql: `SELECT receipt FROM payment_requests WHERE id = ?`, args: [id] });
  return (rs.rows[0]?.receipt as string) || null;
}

export async function getPaymentRequest(id: string): Promise<PaymentRequest | null> {
  await ensurePaymentsSchema();
  const rs = await getDb().execute({ sql: `SELECT * FROM payment_requests WHERE id = ?`, args: [id] });
  const r = rs.rows[0];
  return r ? {
    id: r.id as string,
    name: r.name as string,
    method: r.method as string,
    amount: r.amount as string,
    reference: (r.reference as string) || null,
    status: (r.status as string) || "pending",
    user_id: (r.user_id as string) || null,
    wallet_from: (r.wallet_from as string) || null,
    receipt: (r.receipt as string) || null,
    admin_note: (r.admin_note as string) || null,
    created_at: (r.created_at as string) || null,
  } : null;
}

export async function setPaymentStatus(id: string, status: string): Promise<boolean> {
  await ensurePaymentsSchema();
  // قائمة بيضاء للحالات — أي قيمة أخرى ترجع pending
  const allowed = status === "confirmed" || status === "rejected" ? status : "pending";
  const rs = await getDb().execute({
    sql: `UPDATE payment_requests SET status=?, updated_at=datetime('now') WHERE id=?`,
    args: [allowed, id],
  });
  return rs.rowsAffected > 0;
}

// ---------------- التأكيد الذري مع الشحن ----------------
// INSERT/UPDATE واحدة تحسم الملكية: من ينتقل status!='confirmed' → 'confirmed'
// يفوز بشحن الرصيد. طلبان متزامنان أو تبديل confirmed→pending→confirmed لا يكرر الشحن.
// كل شيء داخل batch واحد (transaction) في القاعدة: الحالة + ledger + رصيد المستخدم.
export async function confirmPaymentAtomically(id: string, credits: number): Promise<{ claimed: boolean; request: PaymentRequest | null }> {
  await ensureSchema();
  await ensurePaymentsSchema();
  const req = await getPaymentRequest(id);
  if (!req) return { claimed: false, request: null };
  const db = getDb();
  // 1) حسم الملكية أولًا وحده: من ينتقل status!='confirmed' → confirmed يفوز بالشحن.
  //    التأكيد المتكرر لا يعيد الحركة ولا يرمي خطأ — يرجع already برسالة واضحة.
  const claim = await db.execute({
    sql: `UPDATE payment_requests SET status='confirmed', updated_at=datetime('now') WHERE id=? AND status!='confirmed'`,
    args: [id],
  });
  const claimed = Number((claim as { rowsAffected?: number })?.rowsAffected || 0) > 0;
  if (!claimed) return { claimed: false, request: req };
  // 2) الفائز فقط يسجل الحركة ويشحن الرصيد (batch ذري) — الفهرس الفريد حماية ثانية
  if (req.user_id && credits > 0) {
    await db.batch([
      {
        sql: `INSERT INTO ledger (id, user_id, delta, reason, ref_id) VALUES (?, ?, ?, 'recharge', ?)`,
        args: [crypto.randomUUID(), req.user_id, credits, id],
      },
      {
        sql: `UPDATE users SET credits = COALESCE(credits, 0) + ? WHERE id = ?`,
        args: [credits, req.user_id],
      },
    ] as never, "write");
  }
  return { claimed: true, request: req };
}

// حركة رصيد في السجل — بمرجع فريد (ref_id, reason) يمنع التكرار مطلقًا
export async function addLedger(userId: string, delta: number, reason: string, refId: string): Promise<boolean> {
  try {
    await getDb().execute({
      sql: `INSERT INTO ledger (id, user_id, delta, reason, ref_id) VALUES (?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), userId, delta, reason, refId],
    });
    return true;
  } catch {
    return false; // المرجع مسجل مسبقًا لنفس السبب — استخدم واحدًا جديدًا أو تجاهل
  }
}

export async function deletePaymentRequest(id: string): Promise<boolean> {
  await ensurePaymentsSchema();
  const rs = await getDb().execute({ sql: `DELETE FROM payment_requests WHERE id=?`, args: [id] });
  return rs.rowsAffected > 0;
}
