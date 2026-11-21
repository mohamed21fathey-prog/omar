// ============================================================
// حد معدل الطلبات — نسختان:
// 1) rateLimit: نافذة منزلقة في الذاكرة (سريعة، لكن لكل نسخة سيرفر على حدة)
// 2) rateLimitDb: عداد محفوظ في قاعدة البيانات — يعمل عبر كل نسخ Vercel (المعتمدة فعليًا)
// ============================================================
import { getDb, ensureSchema } from "@/lib/turso";

const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return false; // تجاوز الحد — ارفض
  }
  arr.push(now);
  buckets.set(key, arr);
  // نظافة دورية تمنع تضخم الذاكرة
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  }
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// ---------------- العداد المعتمد في القاعدة ----------------
let _rlSchema: Promise<void> | null = null;
function ensureRlSchema(): Promise<void> {
  if (!_rlSchema) {
    _rlSchema = getDb()
      .execute(
        `CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          hits INTEGER DEFAULT 0,
          window_start TEXT
        )`
      )
      .then(() => undefined)
      .catch(() => undefined);
  }
  return _rlSchema;
}

// حد معدل في القاعدة — يعمل موثوقًا عبر كل نسخ السيرفر
export async function rateLimitDb(key: string, max: number, windowMs: number): Promise<boolean> {
  try {
    await ensureRlSchema();
    const db = getDb();
    const now = Date.now();
    const rs = await db.execute({ sql: "SELECT hits, window_start FROM rate_limits WHERE key = ?", args: [key] });
    const row = rs.rows[0];
    const started = row ? Number(row.window_start) || 0 : 0;
    if (!row || now - started > windowMs) {
      // نافذة جديدة — إعادة العد من 1 (تنظيف عرضي للصفوف المنتهية)
      await db.execute({
        sql: `INSERT INTO rate_limits (key, hits, window_start) VALUES (?, 1, ?)
              ON CONFLICT(key) DO UPDATE SET hits = 1, window_start = excluded.window_start`,
        args: [key, String(now)],
      });
      if (Math.random() < 0.05) {
        await db.execute({ sql: "DELETE FROM rate_limits WHERE window_start < ?", args: [String(now - 3600_000)] }).catch(() => undefined);
      }
      return true;
    }
    if ((Number(row.hits) || 0) >= max) return false;
    await db.execute({ sql: "UPDATE rate_limits SET hits = hits + 1 WHERE key = ?", args: [key] });
    return true;
  } catch {
    return true; // فشل القاعدة لا يحجب الزبائن الحقيقيين
  }
}
