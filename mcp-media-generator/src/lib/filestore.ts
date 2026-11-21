// ============================================================
// مكتبة الملفات — تخزين PDF / صور / ملفات كبيرة داخل Turso كـ BLOB مقسّم قطعًا
// التقسيم ضروري: منصات السيرفرلس (Vercel) تحدد حجم body الواحد بـ ~4.5MB —
// فالملف الكبير يُرفع على دفعات (كل قطعة ~2.5MB داخل JSON بترميز base64)
// والحذف من نفس المكتبة. التخزين نفسه مجاني مع قاعدة Turso الحالية.
// ============================================================
import { getDb } from "./turso";

let _schema: Promise<void> | null = null;
export function ensureFilesSchema(): Promise<void> {
  if (!_schema) {
    _schema = getDb()
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS uploads (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mime TEXT NOT NULL,
            kind TEXT NOT NULL,
            size INTEGER DEFAULT 0,
            chunks INTEGER DEFAULT 0,
            total_chunks INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
          )`,
          `CREATE TABLE IF NOT EXISTS upload_chunks (
            upload_id TEXT NOT NULL,
            idx INTEGER NOT NULL,
            data BLOB NOT NULL,
            PRIMARY KEY (upload_id, idx)
          )`,
        ],
        "write"
      )
      .then(() => undefined) // batch يرجع ResultSet[] — نحوّله void لمطابقة نوع الكاش
      .catch((e) => {
        _schema = null;
        throw e;
      });
  }
  return _schema;
}

// حجم القطعة قبل ترميز base64 — داخل JSON تصير ~3.4MB وتحت حد Vercel (4.5MB) بأمان
export const CHUNK_RAW_BYTES = 2.5 * 1024 * 1024;
// الحدود لكل نوع — الصور صغيرة، PDF متوسط، والملفات الكبيرة حتى 100MB
export const KIND_LIMITS: Record<string, number> = {
  image: 8 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  big: 100 * 1024 * 1024,
};
// أنواع الصور المسموح تقديمها مباشرة — SVG ممنوع (خطر XSS عبر سكربتات مضمّنة)
export const SAFE_IMAGE_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
]);

export interface UploadRecord {
  id: string;
  name: string;
  mime: string;
  kind: string; // pdf | image | big
  size: number;
  chunks: number;
  total_chunks: number;
  created_at: string | null;
}

interface UploadRow {
  id: string;
  name: string;
  mime: string;
  kind: string;
  size: number | null;
  chunks: number | null;
  total_chunks: number;
  created_at: string | null;
}

function rowToUpload(r: UploadRow): UploadRecord {
  return {
    id: r.id,
    name: r.name,
    mime: r.mime,
    kind: r.kind,
    size: Number(r.size || 0),
    chunks: Number(r.chunks || 0),
    total_chunks: Number(r.total_chunks || 0),
    created_at: r.created_at,
  };
}

// تنظيف اسم الملف: بلا مسارات ولا محارف تحكم، وبطول محدود
export function safeName(raw: string): string {
  const cleaned = String(raw || "")
    .replace(/[\\/\x00-\x1f"'?*<>|:]/g, "_")
    .trim()
    .slice(0, 120);
  return cleaned || "ملف";
}

export function validKind(kind: string): boolean {
  return kind === "pdf" || kind === "image" || kind === "big";
}

// إنشاء/تحديث سجل الرفع (يُستدعى مع أول قطعة أو عند إعادة رفع نفس المعرّف)
export async function upsertUploadMeta(u: {
  id: string;
  name: string;
  mime: string;
  kind: string;
  total_chunks: number;
}): Promise<void> {
  await ensureFilesSchema();
  await getDb().execute({
    sql: `INSERT INTO uploads (id, name, mime, kind, total_chunks)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, mime = excluded.mime,
            kind = excluded.kind, total_chunks = excluded.total_chunks`,
    args: [u.id, u.name, u.mime, u.kind, u.total_chunks],
  });
}

// حفظ قطعة واحدة (INSERT OR REPLACE يسمح بإعادة المحاولة لنفس القطعة بأمان)
export async function putChunk(id: string, idx: number, bytes: Uint8Array): Promise<void> {
  await ensureFilesSchema();
  await getDb().execute({
    sql: `INSERT OR REPLACE INTO upload_chunks (upload_id, idx, data) VALUES (?, ?, ?)`,
    args: [id, idx, bytes as unknown as ArrayBuffer],
  });
}

export async function getUpload(id: string): Promise<UploadRecord | null> {
  await ensureFilesSchema();
  const rs = await getDb().execute({ sql: "SELECT * FROM uploads WHERE id = ?", args: [id] });
  return rs.rows.length ? rowToUpload(rs.rows[0] as unknown as UploadRow) : null;
}

export async function listUploads(): Promise<UploadRecord[]> {
  await ensureFilesSchema();
  const rs = await getDb().execute("SELECT * FROM uploads ORDER BY created_at DESC, id DESC LIMIT 200");
  return rs.rows.map((r) => rowToUpload(r as unknown as UploadRow));
}

// إتمام الرفع: يتحقق من اكتمال القطع والحجم الإجمالي ثم يعلن الملف جاهزًا
// يرجع السجل الجاهز أو { error } برسالة عربية واضحة (يحذف الرفع التالف تلقائيًا)
export async function finishUpload(id: string): Promise<{ rec?: UploadRecord; error?: string }> {
  const rec = await getUpload(id);
  if (!rec) return { error: "الرفع غير موجود — ابدأ من جديد" };
  const rs = await getDb().execute({
    sql: `SELECT COUNT(*) AS c, COALESCE(SUM(length(data)), 0) AS total FROM upload_chunks WHERE upload_id = ?`,
    args: [id],
  });
  const count = Number(rs.rows[0]?.c || 0);
  const totalBytes = Number(rs.rows[0]?.total || 0);
  const limit = KIND_LIMITS[rec.kind] || KIND_LIMITS.big;
  if (count !== rec.total_chunks) {
    await deleteUpload(id);
    return { error: `قطع ناقصة (${count} من ${rec.total_chunks}) — أعد رفع الملف من جديد` };
  }
  if (totalBytes > limit) {
    await deleteUpload(id);
    return { error: `الملف أكبر من الحد المسموح (${Math.round(limit / 1024 / 1024)}MB) لهذا النوع` };
  }
  await getDb().execute({
    sql: `UPDATE uploads SET chunks = ?, size = ? WHERE id = ?`,
    args: [count, totalBytes, id],
  });
  return { rec: { ...rec, chunks: count, size: totalBytes } };
}

// قراءة كل القطع متسلسلة — تُدمج في مصفوفة واحدة لخدمة الملف كاملًا
export async function readAllChunks(id: string): Promise<Uint8Array | null> {
  const rs = await getDb().execute({
    sql: "SELECT data FROM upload_chunks WHERE upload_id = ? ORDER BY idx ASC",
    args: [id],
  });
  if (!rs.rows.length) return null;
  const parts = rs.rows.map((r) => new Uint8Array(r.data as unknown as ArrayBuffer));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// حذف ملف + قطعه (القطع أولًا حتى لو فشل حذف السجل يظل الملف غير قابل للتقديم)
export async function deleteUpload(id: string): Promise<boolean> {
  await ensureFilesSchema();
  await getDb().execute({ sql: "DELETE FROM upload_chunks WHERE upload_id = ?", args: [id] });
  const rs = await getDb().execute({ sql: "DELETE FROM uploads WHERE id = ?", args: [id] });
  return rs.rowsAffected > 0;
}
