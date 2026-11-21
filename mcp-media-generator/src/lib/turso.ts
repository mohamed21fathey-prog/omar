// ============================================================
// طبقة Turso — عميل واحد + مخطط يُنشأ عند أول وصول (بدون migrations)
// تعمل مع libsql:// (Turso عبر HTTP، مناسب لـ Vercel) ومع file: محليًا للتجربة
// ============================================================
import { createClient, type Client, type InValue } from "@libsql/client";
import { encryptApiKey, isEncrypted } from "./keycipher";

let _client: Client | null = null;

export function getDb(): Client {
  if (!_client) {
    // قيم افتراضية مدمجة لتسهيل النشر على Vercel بدون متغيرات بيئة
    // (يمكن دائمًا تجاوزها بـ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN،
    //  أو التشغيل المحلي البحت بضبط file: يدويًا)
    let url = process.env.TURSO_DATABASE_URL
      || "libsql://ffff-ssssdw.aws-ap-northeast-1.turso.io";
    _client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN
        || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQ1MDAzMDksImlkIjoiMDFhMWQwOGMtNTIwMS03YTgzLTk5YWEtYjQzZjE0MmU2ZGMzIiwia2lkIjoiNDNaUkduUmVnUkt4aGxQazBVX3dwNU9xdmJkcnpFWFlPc09KREd0YjRnYyIsInJpZCI6IjBmNzM1NTllLTFiMWQtNDE3MS05MGU2LTg4YzMxNDE5ZGZjZSJ9.9_tX4YrgL1Vej64nUyFpGQfXt5dxGjYJU4xGm6NW2O9fKze_zMy4NOLAeukK-PqeyjSPvwS_8Ea5kiRU9EWbAw",
    });
  }
  return _client;
}

let _schema: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!_schema) {
    _schema = getDb()
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            provider TEXT,
            provider_task_id TEXT,
            key_id TEXT,
            model TEXT NOT NULL,
            type TEXT NOT NULL,
            prompt TEXT DEFAULT '',
            params_json TEXT DEFAULT '{}',
            status TEXT NOT NULL,
            progress INTEGER DEFAULT 0,
            result_urls_json TEXT,
            error_message TEXT,
            attempts_json TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            label TEXT DEFAULT '',
            api_key TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            usage_count INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            fail_count INTEGER DEFAULT 0,
            last_used_at TEXT,
            last_checked_at TEXT,
            last_error TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )`,
        ],
        "write"
      )
      .then(async () => {
        // ترحيلات أعمدة/فهارس — تتجاهل «موجود مسبقًا» بأمان
        await getDb().execute(`ALTER TABLE tasks ADD COLUMN lock_until TEXT`).catch(() => {});
        // فريد (مزود + مفتاح) بدل فحص التكرار بقراءة كل الصفوف — يتجاهل لو المكرر موجود مسبقًا
        await getDb().execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_keys_provider_key ON api_keys (provider, api_key)`).catch(() => {});
      })
      .catch((e) => {
        _schema = null;
        throw e;
      });
  }
  return _schema;
}

export async function dbHealthy(): Promise<boolean> {
  try {
    await getDb().execute("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// ---------------- سجل المحاولات ----------------
export interface AttemptRecord {
  provider: string;
  keyId: string;
  keyLabel: string;
  ok: boolean;
  errorClass?: string;
  error?: string;
  at: string;
}

// ---------------- المهام ----------------
export interface TaskRecord {
  id: string;
  provider: string | null;
  provider_task_id: string | null;
  key_id: string | null;
  model: string;
  type: string; // image | video | merge
  prompt: string;
  params_json: string;
  status: string; // pending | processing | completed | failed
  progress: number;
  result_urls: string[];
  error_message: string | null;
  attempts: AttemptRecord[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface TaskRow {
  id: string;
  provider: string | null;
  provider_task_id: string | null;
  key_id: string | null;
  model: string;
  type: string;
  prompt: string;
  params_json: string;
  status: string;
  progress: number | null;
  result_urls_json: string | null;
  error_message: string | null;
  attempts_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToTask(r: TaskRow): TaskRecord {
  let urls: string[] = [];
  try {
    urls = r.result_urls_json ? JSON.parse(r.result_urls_json) : [];
  } catch {
    urls = [];
  }
  let attempts: AttemptRecord[] = [];
  try {
    attempts = r.attempts_json ? JSON.parse(r.attempts_json) : [];
  } catch {
    attempts = [];
  }
  return { ...r, progress: Number(r.progress || 0), result_urls: urls, attempts };
}

export async function insertTask(t: {
  id: string;
  provider?: string;
  provider_task_id?: string;
  key_id?: string;
  model: string;
  type: string;
  prompt?: string;
  params_json?: string;
  status: string;
}): Promise<void> {
  await ensureSchema();
  await getDb().execute({
    sql: `INSERT INTO tasks (id, provider, provider_task_id, key_id, model, type, prompt, params_json, status, progress)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    args: [
      t.id,
      t.provider ?? null,
      t.provider_task_id ?? null,
      t.key_id ?? null,
      t.model,
      t.type,
      t.prompt ?? "",
      t.params_json ?? "{}",
      t.status,
    ] as InValue[],
  });
}

export async function getTask(id: string): Promise<TaskRecord | null> {
  await ensureSchema();
  const rs = await getDb().execute({ sql: "SELECT * FROM tasks WHERE id = ?", args: [id] });
  if (!rs.rows.length) return null;
  return rowToTask(rs.rows[0] as unknown as TaskRow);
}

// تحديث جزئي: يضيف محاولة إلى attempts_json ويضبط completed_at تلقائيًا عند الاكتمال
export async function updateTask(
  id: string,
  patch: Partial<{
    provider: string | null;
    provider_task_id: string | null;
    key_id: string | null;
    status: string;
    progress: number;
    result_urls: string[];
    error_message: string | null;
    params_json: string;
  }>,
  attempt?: AttemptRecord
): Promise<void> {
  await ensureSchema();
  const cols: string[] = [];
  const args: InValue[] = [];
  if (patch.provider !== undefined) { cols.push("provider = ?"); args.push(patch.provider); }
  if (patch.provider_task_id !== undefined) { cols.push("provider_task_id = ?"); args.push(patch.provider_task_id); }
  if (patch.key_id !== undefined) { cols.push("key_id = ?"); args.push(patch.key_id); }
  if (patch.status !== undefined) { cols.push("status = ?"); args.push(patch.status); }
  if (patch.progress !== undefined) { cols.push("progress = ?"); args.push(patch.progress); }
  if (patch.result_urls !== undefined) { cols.push("result_urls_json = ?"); args.push(JSON.stringify(patch.result_urls)); }
  if (patch.error_message !== undefined) { cols.push("error_message = ?"); args.push(patch.error_message); }
  if (patch.params_json !== undefined) { cols.push("params_json = ?"); args.push(patch.params_json); }
  if (attempt) {
    // إضافة المحاولة ذريًا داخل SQLite نفسه (json_insert) — لا سباق قراءة-ثم-كتابة
    // يفقد محاولات متزامنة، ولا json_patch الذي يستبدل المصفوفة بدل أن يضيف إليها.
    await getDb().execute({
      sql: `UPDATE tasks SET attempts_json = json_insert(COALESCE(attempts_json, json('[]')), '$[#]', json(?)) WHERE id = ?`,
      args: [JSON.stringify(attempt), id],
    });
    // حد أمان للحجم: قصّ لمئة محاولة أخيرة (دون المساس بالمهمة نفسها)
    await getDb().execute({
      sql: `UPDATE tasks
            SET attempts_json = (SELECT json_group_array(je.value) FROM json_each(attempts_json) AS je WHERE je.key >= json_array_length(attempts_json) - 100)
            WHERE id = ? AND json_array_length(attempts_json) > 100`,
      args: [id],
    });
  }
  if (patch.status === "completed") cols.push("completed_at = datetime('now')");
  cols.push("updated_at = datetime('now')");
  args.push(id);
  await getDb().execute({ sql: `UPDATE tasks SET ${cols.join(", ")} WHERE id = ?`, args });
}

export async function listRecentTasks(
  limit = 10,
  filter?: { type?: string; status?: string }
): Promise<TaskRecord[]> {
  await ensureSchema();
  const where: string[] = [];
  const args: InValue[] = [];
  if (filter?.type) { where.push("type = ?"); args.push(filter.type); }
  if (filter?.status) { where.push("status = ?"); args.push(filter.status); }
  args.push(limit);
  const rs = await getDb().execute({
    sql: `SELECT * FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC, id DESC LIMIT ?`,
    args,
  });
  return rs.rows.map((r) => rowToTask(r as unknown as TaskRow));
}

// ---------------- قفل إنشاء المهمة لدى المزود (سباق نداءات get_task المتزامنة) ----------------
// نداءان متزامنان لـ get_task على مهمة بلا provider_task_id كانا ينشئان مهمتين لدى
// المزود (ازدواج في الرصيد). القفل: عمود lock_until يُحجز بـ UPDATE مشروط —
// الصف يفوز مرة واحدة والباقي يرجع الحالة كما هي.
export async function claimTaskLock(taskId: string, seconds = 60): Promise<boolean> {
  await ensureSchema();
  const rs = await getDb().execute({
    sql: `UPDATE tasks SET lock_until = datetime('now', '+' || ? || ' seconds'), updated_at = datetime('now')
          WHERE id = ? AND (lock_until IS NULL OR lock_until < datetime('now'))`,
    args: [String(Math.max(5, Math.min(600, seconds))), taskId],
  });
  return rs.rowsAffected > 0;
}

export async function releaseTaskLock(taskId: string): Promise<void> {
  await getDb().execute({
    sql: `UPDATE tasks SET lock_until = NULL WHERE id = ?`,
    args: [taskId],
  }).catch(() => {});
}

// عمر أقصى للمهام الجارية (مثلاً 30 دقيقة) → failed برسالة ودودة — لا مهام بلا نهاية
export async function expireStaleTask(taskId: string, minutes = 30): Promise<boolean> {
  const rs = await getDb().execute({
    sql: `UPDATE tasks SET status = 'failed',
            error_message = 'انتهت المدة القصوى للمعالجة (${minutes} دقيقة) دون اكتمال — يُرد الرصيد تلقائيًا ويمكن إعادة المحاولة',
            completed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND status = 'processing'
            AND datetime(created_at) < datetime('now', '-' || ? || ' minutes')`,
    args: [taskId, String(Math.max(1, minutes))],
  });
  return rs.rowsAffected > 0;
}

// 🧹 كاسحة عالمية للمهام المعلقة: أي مهمة processing تجاوزت العمر الأقصى → failed
// تُستدعى من مسارات قراءة المشاهد/الطابور — تلتئم حتى المهام التي لم يفتحها أحد
// (كانت المهام تظل «قيد التوليد» للأبد إن لم يحدّثها refreshTask من صفحة مفتوحة)
export async function expireAllStaleTasks(minutes = 30): Promise<number> {
  const rs = await getDb().execute({
    sql: `UPDATE tasks SET status = 'failed',
            error_message = 'انتهت المدة القصوى للمعالجة (${minutes} دقيقة) دون اكتمال — يُرد الرصيد تلقائيًا ويمكن إعادة المحاولة',
            completed_at = datetime('now'), updated_at = datetime('now')
          WHERE status = 'processing'
            AND datetime(created_at) < datetime('now', '-' || ? || ' minutes')`,
    args: [String(Math.max(1, minutes))],
  });
  return rs.rowsAffected;
}

// حذف المهام حسب فلتر — لأزرار التنظيف في لوحة المهام (الإجمالي/مكتملة/فاشلة/جارية)
// «جارية» تشمل processing + pending (كل ما لم يكتمل ولم يفشل بعد)
export async function deleteTasksByFilter(
  filter: "all" | "completed" | "failed" | "processing"
): Promise<number> {
  await ensureSchema();
  const sql =
    filter === "all"
      ? "DELETE FROM tasks"
      : filter === "completed"
        ? "DELETE FROM tasks WHERE status = 'completed'"
        : filter === "failed"
          ? "DELETE FROM tasks WHERE status = 'failed'"
          : "DELETE FROM tasks WHERE status IN ('processing','pending')";
  const rs = await getDb().execute({ sql });
  return Number(rs.rowsAffected || 0);
}

export async function taskStats(): Promise<{ total: number; completed: number; failed: number; processing: number }> {
  await ensureSchema();
  const rs = await getDb().execute(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing
     FROM tasks`
  );
  const r = rs.rows[0];
  return {
    total: Number(r?.total || 0),
    completed: Number(r?.completed || 0),
    failed: Number(r?.failed || 0),
    processing: Number(r?.processing || 0),
  };
}

// ---------------- المفاتيح ----------------
export interface ApiKeyRecord {
  id: string;
  provider: string;
  label: string;
  role?: string; // "owner" = مالك الموقع (حلقات القناة) | "customer" = زبون (فوترة منفصلة)
  api_key: string;
  status: string;
  usage_count: number;
  success_count: number;
  fail_count: number;
  last_used_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
}

export async function insertKey(provider: string, apiKey: string, label = ""): Promise<ApiKeyRecord> {
  apiKey = isEncrypted(apiKey) ? apiKey : encryptApiKey(apiKey); // يُخزَّن مشفرًا AES-256-GCM
  await ensureSchema();
  const id = crypto.randomUUID();
  await getDb().execute({
    sql: "INSERT INTO api_keys (id, provider, label, api_key) VALUES (?, ?, ?, ?)",
    args: [id, provider, label, apiKey],
  });
  return (await getKey(id))!;
}

export async function getKey(id: string): Promise<ApiKeyRecord | null> {
  const rs = await getDb().execute({ sql: "SELECT * FROM api_keys WHERE id = ?", args: [id] });
  if (!rs.rows.length) return null;
  const r = rs.rows[0] as unknown as ApiKeyRecord;
  return { ...r, usage_count: Number(r.usage_count || 0), success_count: Number(r.success_count || 0), fail_count: Number(r.fail_count || 0) };
}

export async function listKeys(): Promise<ApiKeyRecord[]> {
  await ensureSchema();
  const rs = await getDb().execute("SELECT * FROM api_keys ORDER BY created_at ASC, id ASC");
  return rs.rows.map((r) => {
    const k = r as unknown as ApiKeyRecord;
    return { ...k, usage_count: Number(k.usage_count || 0), success_count: Number(k.success_count || 0), fail_count: Number(k.fail_count || 0) };
  });
}

export async function updateKey(id: string, patch: Partial<Pick<ApiKeyRecord, "status" | "label" | "role" | "last_error" | "last_used_at" | "last_checked_at">> & { bumpUsage?: boolean; bumpSuccess?: boolean; bumpFail?: boolean }): Promise<void> {
  const cols: string[] = [];
  const args: InValue[] = [];
  for (const field of ["status", "label", "role", "last_error", "last_used_at", "last_checked_at"] as const) {
    if (patch[field] !== undefined) { cols.push(`${field} = ?`); args.push(patch[field]!); }
  }
  if (patch.bumpUsage) cols.push("usage_count = usage_count + 1");
  if (patch.bumpSuccess) cols.push("success_count = success_count + 1");
  if (patch.bumpFail) cols.push("fail_count = fail_count + 1");
  args.push(id);
  await getDb().execute({ sql: `UPDATE api_keys SET ${cols.join(", ")} WHERE id = ?`, args });
}

export async function deleteKey(id: string): Promise<boolean> {
  const rs = await getDb().execute({ sql: "DELETE FROM api_keys WHERE id = ?", args: [id] });
  return rs.rowsAffected > 0;
}
