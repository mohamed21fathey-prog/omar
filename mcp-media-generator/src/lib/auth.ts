// ============================================================
// حسابات الزبائن — تسجيل ودخول بجلسات موقعة (كوكي HttpOnly)
// كلمة المرور متخزنة كـ scrypt hash — مفيش أي كلمة مرور صريحة
// الجلسة: userId.v<version>.<exp>.<sig> (HMAC-SHA256) — صالحة 30 يوم،
// بها انتهاء صلاحية (exp) ورقم إصدار (session_version) يسمح بالإبطال من الخادم
// ============================================================
import crypto from "node:crypto";
import { getDb, ensureSchema } from "@/lib/turso";
import { PACKAGES } from "@/lib/packages";

export const COOKIE_NAME = "mg_session";
export const SESSION_DAYS = 30;

// سر الجلسة إلزامي — لا قيمة افتراضية إطلاقًا. في الإنتاج يفشل التشغيل
// فورًا لو غاب؛ محليًا تُولَّد قيمة مؤقتة عشوائية مع تنبيه (تموت مع إعادة التشغيل).
let SECRET = process.env.SESSION_SECRET || "";
if (!SECRET) {
  if (process.env.VERCEL) {
    throw new Error("SESSION_SECRET إلزامي في الإنتاج — اضبطه في متغيرات البيئة (انظر .env.example)");
  }
  SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("⚠️ SESSION_SECRET غير مضبوط محليًا — استخدمت قيمة مؤقتة للجلسة فقط (ضعها في .env.local)");
}

let _users: Promise<void> | null = null;
function ensureUsersSchema(): Promise<void> {
  if (!_users) {
    _users = getDb().execute(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`
    ).then(async () => {
      // رصيد الزبون من الكريدت — يتشحن تلقائيًا لما المشرف يؤكد طلب الدفع
      try { await getDb().execute(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0`); } catch { /* العمود موجود */ }
      // حالة الحساب: active | suspended — الإيقاف يدوي من لوحة الأدمن فقط، ولا شيء يعطّل الحساب آليًا
      try { await getDb().execute(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`); } catch { /* العمود موجود */ }
      // نظام الإحالة: كود دعوة فريد + من دعاك + عدد الدعوات الناجحة + مكافأة الداعي تدفع بعد أول شحن
      for (const col of ["referral_code TEXT", "referred_by TEXT", "invited_count INTEGER DEFAULT 0",
                          "inviter_rewarded INTEGER DEFAULT 0", "session_version INTEGER DEFAULT 0",
                          "email_verified INTEGER DEFAULT 0"]) {
        try { await getDb().execute(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* العمود موجود */ }
      }
    });
  }
  return _users;
}

export interface User {
  id: string;
  email: string;
  username: string;
  credits: number; // رصيد الكريدت (0 = بدون)
  referral_code: string | null; // كود دعوة صاحب الحساب — كل صديق يسجل بيه الطرفان يكسبان
  invited_count: number; // عدد الأصدقاء اللي سجلوا بكوده فعليًا
  created_at: string | null;
}

// 💰 نموذج الكريديت الموحد (نهائي): محفظة واحدة لكل مستخدم — رصيد مدفوع فقط.
// لا هدية تسجيل ولا مكافآت إحالة ولا أي رصيد مجاني تلقائي — الرصيد يدخل بعد
// شراء باقة وتأكيد الدفع فقط (confirmPaymentAtomically) أو تعديل إداري مسجّل.
// معدل الشحن: باقات رسمية (50ج→1000، 100ج→2000، 200ج→4000) — مصدرها src/lib/packages.ts.
// المبلغ المطابق للباقة يأخذ كريدتها بالظبط — والمبالغ الأخرى على معدل أرخص باقة (1000÷50) مقرّبًا.
export function creditsForAmount(amount: string): number {
  const egp = parseFloat(amount);
  if (!isFinite(egp) || egp <= 0) return 0;
  const exact = PACKAGES.find((p) => p.egp === egp);
  if (exact) return exact.credits;
  return Math.round(egp * (PACKAGES[0].credits / PACKAGES[0].egp));
}

// شحن/خصم رصيد حساب زبون — يرجع الرصيد الجديد أو null لو الحساب غير موجود
// يقبل سالبًا أيضًا — الخصم التلقائي لكل مشهد يُولَّد من محفظة الموقع الواحدة
export async function creditUser(id: string, credits: number): Promise<number | null> {
  if (!credits) return null;
  await ensureSchema();
  await ensureUsersSchema();
  const rs = await getDb().execute({
    sql: `UPDATE users SET credits = COALESCE(credits, 0) + ? WHERE id = ?`,
    args: [credits, id],
  });
  if (rs.rowsAffected === 0) return null;
  const user = await getUserById(id);
  return user ? user.credits : null;
}

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const calc = crypto.scryptSync(pw, salt, 64);
    return crypto.timingSafeEqual(calc, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
}

// توقيع عام بقيمة سر الجلسة (لأغراض state/CSRF قصير العمر مثل OAuth)
export function sessionHmac(payload: string): string {
  return sign(payload);
}

export interface SessionToken {
  userId: string;
  version: number; // session_version من القاعدة — إبطال من الخادم يرفع الرقم
  exp: number; // unix ms
}

export function sessionCookie(userId: string, version = 0) {
  const exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const value = `${userId}.v${version}.${exp}.${sign(`${userId}.v${version}.${exp}`)}`;
  return { name: COOKIE_NAME, value, maxAge: SESSION_DAYS * 24 * 3600 };
}

// يقرأ ويحقق الكوكي (توقيع + انتهاء صلاحية) — بدون قاعدة البيانات
export function readSessionFull(req: Request): SessionToken | null {
  const raw = req.headers.get("cookie") || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length !== 4 || !parts[1].startsWith("v")) {
    // توكن قديم بصيغة userId.sig — غير صالح بعد الترقية (يُطلب دخول جديد)
    // الفحص على parts[1] (وسم الإصدار v<رقم>) — parts[0] هو معرف المستخدم
    return null;
  }
  const [id, vtag, expStr, sig] = parts;
  if (!id || !sig) return null;
  const version = Number(vtag.slice(1));
  const exp = Number(expStr);
  if (!Number.isFinite(version) || !Number.isFinite(exp) || exp < Date.now()) return null; // منتهية
  const expected = sign(`${id}.v${version}.${exp}`);
  if (sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { userId: id, version, exp };
  }
  return null;
}

// توافق قديم: يرجع معرف المستخدم فقط بعد التحقق (توقيع + انتهاء)
export function readSession(req: Request): string | null {
  return readSessionFull(req)?.userId ?? null;
}

// جلسة كاملة محققة ضد القاعدة: التوقيع + الانتهاء + رقم الإصدار (إبطال خادمي)
export async function getSessionUser(req: Request): Promise<User | null> {
  const t = readSessionFull(req);
  if (!t) return null;
  const user = await getUserById(t.userId);
  if (!user) return null;
  const curVersion = await getSessionVersion(t.userId);
  if (t.version !== curVersion) return null; // أُبطئت من الخادم (رقم إصدار أحدث)
  return user;
}

export async function getSessionVersion(userId: string): Promise<number> {
  await ensureUsersSchema();
  const rs = await getDb().execute({ sql: "SELECT COALESCE(session_version, 0) AS v FROM users WHERE id = ?", args: [userId] });
  return Number(rs.rows[0]?.v) || 0;
}

// إبطال كل جلسات مستخدم من الخادم — يرفع session_version فتصبح الجلسات القديمة غير صالحة
export async function bumpUserSessions(userId: string): Promise<void> {
  await ensureUsersSchema();
  await getDb().execute({ sql: "UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ?", args: [userId] });
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureSchema();
  await ensureUsersSchema();
  const rs = await getDb().execute({
    sql: `SELECT id, email, username, COALESCE(credits, 0) AS credits,
                 COALESCE(referral_code, '') AS referral_code, COALESCE(invited_count, 0) AS invited_count,
                 COALESCE(session_version, 0) AS session_version, COALESCE(email_verified, 0) AS email_verified, created_at
          FROM users WHERE id = ?`,
    args: [id],
  });
  const r = rs.rows[0];
  return r
    ? {
        id: r.id as string,
        email: r.email as string,
        username: r.username as string,
        credits: (r.credits as number) || 0,
        referral_code: (r.referral_code as string) || null,
        invited_count: (r.invited_count as number) || 0,
        created_at: (r.created_at as string) || null,
      }
    : null;
}

function genReferralCode(): string {
  return crypto.randomBytes(4).toString("hex"); // 8 خانات hex — 4.2 مليار تركيبة
}

// كود الإحالة — يُنشأ مرة واحدة عند أول طلب، مع إعادة محاولة عند تعارض نادر
export async function ensureReferralCode(id: string): Promise<string | null> {
  await ensureUsersSchema();
  for (let i = 0; i < 5; i++) {
    const rs = await getDb().execute({ sql: "SELECT referral_code FROM users WHERE id = ?", args: [id] });
    const cur = (rs.rows[0]?.referral_code as string) || "";
    if (cur) return cur;
    const code = genReferralCode();
    const dup = await getDb().execute({ sql: "SELECT 1 FROM users WHERE referral_code = ?", args: [code] });
    if (dup.rows.length) continue;
    await getDb().execute({
      sql: "UPDATE users SET referral_code = ? WHERE id = ? AND (referral_code IS NULL OR referral_code = '')",
      args: [code, id],
    });
    const chk = await getDb().execute({ sql: "SELECT referral_code FROM users WHERE id = ?", args: [id] });
    const got = (chk.rows[0]?.referral_code as string) || "";
    if (got) return got;
  }
  return null;
}

export async function findUserByIdentifier(identifier: string): Promise<{ id: string; password_hash: string; status: string } | null> {
  await ensureSchema();
  await ensureUsersSchema();
  const rs = await getDb().execute({
    sql: `SELECT id, password_hash, COALESCE(status, 'active') AS status FROM users WHERE email = ? OR username = ?`,
    args: [identifier.toLowerCase(), identifier],
  });
  const r = rs.rows[0];
  return r ? { id: r.id as string, password_hash: r.password_hash as string, status: (r.status as string) || "active" } : null;
}

// 🔵 حساب Google — إيجاد المستخدم بالإيميل أو إنشاؤه (كلمة مرور عشوائية غير قابلة للاستخدام — الدخول عبر جوجل فقط)
export async function findOrCreateGoogleUser(email: string): Promise<{ id: string; isNew: boolean }> {
  await ensureSchema();
  await ensureUsersSchema();
  const em = String(email || "").trim().toLowerCase();
  const rs = await getDb().execute({ sql: "SELECT id FROM users WHERE email = ?", args: [em] });
  if (rs.rows[0]?.id) return { id: String(rs.rows[0].id), isNew: false };
  // اسم مستخدم فريد من بادئة الإيميل — لو مشغول نضيف رقمًا
  const base = (em.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16) || "user";
  let username = base;
  for (let i = 0; i < 6; i++) {
    const dup = await getDb().execute({ sql: "SELECT 1 FROM users WHERE username = ?", args: [username] });
    if (!dup.rows.length) break;
    username = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
  }
  const id = crypto.randomUUID();
  const unusablePw = crypto.randomBytes(24).toString("hex");
  let code = "";
  for (let i = 0; i < 5 && !code; i++) {
    const c = genReferralCode();
    const dup = await getDb().execute({ sql: "SELECT 1 FROM users WHERE referral_code = ?", args: [c] });
    if (!dup.rows.length) code = c;
  }
  await getDb().execute({
    sql: `INSERT INTO users (id, email, username, password_hash, referral_code, credits, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, em, username, hashPassword(unusablePw), code || null, 0, "active"],
  });
  return { id, isNew: true };
}

export async function createUser(email: string, username: string, password: string, refCode?: string): Promise<User> {
  await ensureSchema();
  await ensureUsersSchema();
  const id = crypto.randomUUID();
  // كود إحالة فريد للحساب الجديد
  let code = "";
  for (let i = 0; i < 5 && !code; i++) {
    const c = genReferralCode();
    const dup = await getDb().execute({ sql: "SELECT 1 FROM users WHERE referral_code = ?", args: [c] });
    if (!dup.rows.length) code = c;
  }
  await getDb().execute({
    sql: `INSERT INTO users (id, email, username, password_hash, referral_code, credits) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, email.toLowerCase(), username, hashPassword(password), code || null, 0],
  });
  // 💰 لا رصيد مجاني عند التسجيل — المحفظة تبدأ صفرًا والشحن بعد الدفع فقط
  // (كود الإحالة يُحفظ للإحصاء فقط — بلا أي مكافآت رصيد)
  let credits = 0;
  const rc = (refCode || "").trim().toLowerCase();
  if (rc) {
    try {
      const inv = await getDb().execute({ sql: "SELECT id FROM users WHERE referral_code = ?", args: [rc] });
      const inviterId = inv.rows[0]?.id as string | undefined;
      if (inviterId && inviterId !== id) {
        await getDb().execute({
          sql: "UPDATE users SET invited_count = COALESCE(invited_count, 0) + 1, referred_by = ? WHERE id = ?",
          args: [inviterId, id],
        });
      }
    } catch { /* الإحالة استثناء نادر — الحساب يعمل بدونها */ }
  }
  return { id, email: email.toLowerCase(), username, credits, referral_code: code || null, invited_count: 0, created_at: new Date().toISOString() };
}

// ---------- إدارة الحسابات من لوحة الأدمن ----------
// الإيقاف يدوي فقط — لا شيء في النظام يعطّل حسابًا آليًا بسبب خطأ مؤقت
export async function setUserStatus(userId: string, status: "active" | "suspended"): Promise<boolean> {
  await ensureSchema();
  await ensureUsersSchema();
  const rs = await getDb().execute({
    sql: `UPDATE users SET status = ? WHERE id = ?`,
    args: [status, userId],
  });
  return rs.rowsAffected > 0;
}

export async function isUserSuspended(userId: string): Promise<boolean> {
  await ensureSchema();
  await ensureUsersSchema();
  const rs = await getDb().execute({
    sql: `SELECT COALESCE(status, 'active') AS s FROM users WHERE id = ?`,
    args: [userId],
  });
  return ((rs.rows[0]?.s as string) || "active") === "suspended";
}

// حذف حساب زبون مع الحفاظ على السجلات المالية (ledger + payment_requests تبقى كما هي)
// مفاتيحه تبقى موجودة فك الارتباط فقط، ومشاريع الاستوديو تُحذف معه
export async function deleteUserAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema();
  await ensureUsersSchema();
  // لا يُحذف حساب الأدمن الأساسي أبدًا
  const rs = await getDb().execute({ sql: `SELECT username, email FROM users WHERE id = ?`, args: [userId] });
  const uname = (rs.rows[0]?.username as string) || "";
  if (uname === "omar" || (rs.rows[0]?.email as string) === "omar@owner.local") {
    return { ok: false, error: "لا يمكن حذف حساب المالك الأساسي" };
  }
  await getDb().execute({ sql: `DELETE FROM studio_scenes WHERE project_id IN (SELECT id FROM studio_projects WHERE user_id = ?)`, args: [userId] }).catch(() => undefined);
  await getDb().execute({ sql: `DELETE FROM studio_projects WHERE user_id = ?`, args: [userId] }).catch(() => undefined);
  // فك ارتباط طوابير المصنع ومفاتيحه قبل حذف المفتاح المالك للارتباط
  await getDb().execute({ sql: `UPDATE episode_queue SET assigned_key = NULL WHERE assigned_key IN (SELECT id FROM api_keys WHERE user_id = ?)`, args: [userId] }).catch(() => undefined);
  await getDb().execute({ sql: `UPDATE api_keys SET user_id = NULL WHERE user_id = ?`, args: [userId] }).catch(() => undefined);
  const del = await getDb().execute({ sql: `DELETE FROM users WHERE id = ?`, args: [userId] });
  return { ok: del.rowsAffected > 0, error: del.rowsAffected > 0 ? undefined : "الحساب غير موجود" };
}
