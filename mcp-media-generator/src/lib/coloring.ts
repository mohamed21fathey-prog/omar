// ============================================================
// كتب التلوين للأطفال — منتجات PDF بسعر جنيه مصري
// الجدول مرتبط بمكتبة الملفات (uploads) — الـPDF يُرفع من لوحة الإدارة ثم يتحول لكتاب بمنتج
// السعر الأساسي لكل كتاب + نسبة خصم عامة من إعدادات الموقع (coloring_discount)
// ============================================================
import { getDb, ensureSchema } from "./turso";

let _schema: Promise<void> | null = null;
export function ensureColoringSchema(): Promise<void> {
  if (!_schema) {
    _schema = getDb()
      .execute(
        `CREATE TABLE IF NOT EXISTS coloring_books (
          id TEXT PRIMARY KEY,
          file_id TEXT NOT NULL,
          title TEXT NOT NULL,
          price_egp REAL NOT NULL DEFAULT 49,
          pages INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          sort INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .then(() => undefined)
      .catch((e) => {
        _schema = null;
        throw e;
      });
  }
  return _schema;
}

export interface ColoringBook {
  id: string;
  file_id: string;
  title: string;
  price_egp: number;
  pages: number;
  active: number;
  sort: number;
  created_at: string | null;
}

export async function listColoringBooks(onlyActive = false): Promise<ColoringBook[]> {
  await ensureColoringSchema();
  const rs = await getDb().execute(
    onlyActive
      ? "SELECT * FROM coloring_books WHERE active = 1 ORDER BY sort ASC, created_at DESC, id DESC"
      : "SELECT * FROM coloring_books ORDER BY sort ASC, created_at DESC, id DESC"
  );
  return rs.rows.map((r) => ({
    id: r.id as string,
    file_id: r.file_id as string,
    title: r.title as string,
    price_egp: Number(r.price_egp || 0),
    pages: Number(r.pages || 0),
    active: Number(r.active || 0),
    sort: Number(r.sort || 0),
    created_at: (r.created_at as string) || null,
  }));
}

export async function createColoringBook(b: {
  id: string;
  file_id: string;
  title: string;
  price_egp: number;
  pages?: number;
  sort?: number;
}): Promise<void> {
  await ensureColoringSchema();
  await getDb().execute({
    sql: `INSERT INTO coloring_books (id, file_id, title, price_egp, pages, sort) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [b.id, b.file_id, b.title, b.price_egp, b.pages ?? 0, b.sort ?? 0],
  });
}

export async function updateColoringBook(
  id: string,
  patch: Partial<{ title: string; price_egp: number; active: number; sort: number }>
): Promise<boolean> {
  await ensureColoringSchema();
  const cols: string[] = [];
  const args: unknown[] = [];
  if (patch.title !== undefined) { cols.push("title = ?"); args.push(patch.title); }
  if (patch.price_egp !== undefined) { cols.push("price_egp = ?"); args.push(patch.price_egp); }
  if (patch.active !== undefined) { cols.push("active = ?"); args.push(patch.active ? 1 : 0); }
  if (patch.sort !== undefined) { cols.push("sort = ?"); args.push(patch.sort); }
  if (!cols.length) return false;
  args.push(id);
  const rs = await getDb().execute({ sql: `UPDATE coloring_books SET ${cols.join(", ")} WHERE id = ?`, args: args as never[] });
  return rs.rowsAffected > 0;
}

export async function deleteColoringBook(id: string): Promise<boolean> {
  await ensureColoringSchema();
  const rs = await getDb().execute({ sql: "DELETE FROM coloring_books WHERE id = ?", args: [id] });
  return rs.rowsAffected > 0;
}

// حساب السعر النهائي بعد الخصم — الخصم 0-90٪ ويقرّب لأقرب جنيه
export function finalPrice(price: number, discountPercent: number): number {
  const d = Math.max(0, Math.min(90, discountPercent || 0));
  return Math.round(price * (1 - d / 100));
}
