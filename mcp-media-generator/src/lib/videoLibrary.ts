// ============================================================
// مكتبة الفيديوهات — رفع شورتس/فيديو عرضي + استيراد فيديوهات الموقع
// (الحلقات المدمجة ومشاهد الاستوديو) + دمج أي مجموعة + حذف
// التخزين: مكتبة الملفات الحالية (filestore — Turso BLOB) للفيديوهات
// المرفوعة، وروابط خارجية للمستورد/المدمج. كل عنصر مملوك لمستخدم.
// ============================================================
import { getDb } from "./turso";
import { deleteUpload } from "./filestore";

let _schema: Promise<void> | null = null;
export function ensureLibrarySchema(): Promise<void> {
  if (!_schema) {
    _schema = getDb()
      .execute(
        `CREATE TABLE IF NOT EXISTS video_library (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          source TEXT NOT NULL,
          file_id TEXT,
          url TEXT,
          size INTEGER DEFAULT 0,
          orientation TEXT DEFAULT '16:9',
          status TEXT DEFAULT 'ready',
          job_id TEXT,
          result_url TEXT,
          error TEXT,
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

export interface LibraryItem {
  id: string;
  user_id: string;
  title: string;
  source: string; // upload | import | merge
  file_id: string | null;
  url: string | null;
  size: number | null;
  orientation: string;
  status: string; // ready | merging | failed
  job_id: string | null;
  result_url: string | null;
  error: string | null;
  created_at: string | null;
}

interface LibRow {
  id: string;
  user_id: string;
  title: string;
  source: string;
  file_id: string | null;
  url: string | null;
  size: number | null;
  orientation: string;
  status: string;
  job_id: string | null;
  result_url: string | null;
  error: string | null;
  created_at: string | null;
}

function rowToItem(r: LibRow): LibraryItem {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    source: r.source,
    file_id: r.file_id || null,
    url: r.url || null,
    size: r.size === null ? null : Number(r.size),
    orientation: r.orientation || "16:9",
    status: r.status || "ready",
    job_id: r.job_id || null,
    result_url: r.result_url || null,
    error: r.error || null,
    created_at: r.created_at,
  };
}

export async function listItems(userId: string): Promise<LibraryItem[]> {
  await ensureLibrarySchema();
  const rs = await getDb().execute({
    sql: "SELECT * FROM video_library WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100",
    args: [userId],
  });
  return (rs.rows as unknown as LibRow[]).map(rowToItem);
}

export async function getItem(id: string): Promise<LibraryItem | null> {
  await ensureLibrarySchema();
  const rs = await getDb().execute({ sql: "SELECT * FROM video_library WHERE id = ?", args: [id] });
  const r = (rs.rows as unknown as LibRow[])[0];
  return r ? rowToItem(r) : null;
}

export async function addItem(i: {
  id: string;
  user_id: string;
  title: string;
  source: string;
  file_id?: string | null;
  url?: string | null;
  size?: number | null;
  orientation?: string;
  status?: string;
  job_id?: string | null;
}): Promise<LibraryItem> {
  await ensureLibrarySchema();
  await getDb().execute({
    sql: `INSERT INTO video_library (id, user_id, title, source, file_id, url, size, orientation, status, job_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [i.id, i.user_id, i.title, i.source, i.file_id || null, i.url || null, i.size ?? null, i.orientation || "16:9", i.status || "ready", i.job_id || null],
  });
  const it = await getItem(i.id);
  if (!it) throw new Error("فشل إنشاء عنصر المكتبة");
  return it;
}

export async function updateItem(
  id: string,
  patch: { status?: string; result_url?: string | null; error?: string | null }
): Promise<void> {
  await ensureLibrarySchema();
  await getDb().execute({
    sql: "UPDATE video_library SET status = COALESCE(?, status), result_url = COALESCE(?, result_url), error = ? WHERE id = ?",
    args: [patch.status ?? null, patch.result_url ?? null, patch.error ?? null, id],
  });
}

// حذف عنصر + تنظيف ملفه المرفوع من مكتبة الملفات — يعمل للمكتمل وغير المكتمل
export async function deleteItem(id: string, userId: string): Promise<boolean> {
  await ensureLibrarySchema();
  const it = await getItem(id);
  if (!it || it.user_id !== userId) return false;
  if (it.file_id) await deleteUpload(it.file_id).catch(() => undefined);
  await getDb().execute({ sql: "DELETE FROM video_library WHERE id = ?", args: [id] });
  return true;
}

// مصادر الاستيراد: فيديوهات الموقع الجاهزة (حلقات مدمجة + مشاهد استوديو مكتملة)
export async function listSources(): Promise<{ episodes: Array<{ title: string; url: string }>; scenes: Array<{ title: string; url: string }> }> {
  await ensureLibrarySchema();
  const db = getDb();
  const ep = await db
    .execute(
      `SELECT DISTINCT m.url AS url, COALESCE(q.title, 'حلقة مدمجة') AS title
       FROM episode_merges m
       LEFT JOIN episode_queue q ON q.group_id = m.group_id
       WHERE m.url IS NOT NULL AND m.url != '' AND m.status = 'done'
       ORDER BY title DESC LIMIT 30`
    )
    .catch(() => ({ rows: [] as unknown as Array<{ url: string; title: string }> }));
  const sc = await db
    .execute(
      `SELECT DISTINCT video_url AS url, substr(prompt, 1, 60) AS title
       FROM studio_scenes
       WHERE status = 'completed' AND video_url IS NOT NULL AND video_url != ''
       ORDER BY updated_at DESC LIMIT 30`
    )
    .catch(() => ({ rows: [] as unknown as Array<{ url: string; title: string }> }));
  const map = (rows: unknown) =>
    (rows as Array<{ url: string; title: string }>)
      .filter((r) => r.url)
      .map((r) => ({ url: r.url, title: r.title || "فيديو" }));
  return { episodes: map(ep.rows), scenes: map(sc.rows) };
}
