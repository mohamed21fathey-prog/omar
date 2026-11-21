// ============================================================
// نظام الحلقات اليومية — مصنع حلقات كوكب الكرتون
// قائمة انتظار سيناريوهات + توليد الحلقة التالية أوتوماتيكيًا
// + حزمة النشر الجاهزة (عنوان + وصف + هاشتاقات بنمط الرابح)
// ============================================================
import { getDb, ensureSchema, expireAllStaleTasks } from "@/lib/turso";
import { runGeneration } from "@/lib/coordinator";
import { geminiConfigured, generatePublishKitAi } from "@/lib/gemini";
import { mergerClient } from "@/lib/merger";
import { telegramPostEpisode } from "@/lib/telegram";
import { setInternalSetting, getSettings } from "@/lib/settings";
import { pickGenerationKey } from "./keys";
import { MODELS } from "./models";
import { arabicVideoPrompt } from "./voice";
import { addLedger } from "./payments";

// كريدت الموقع المسحوب من حساب الزبون لكل مشهد فيديو يتولد من مفتاحه:
// الباقات بالقسمة الصحيحة: 1000 كريدت (باقة 50ج) = 66 مشهد | 2000 = 133 | 4000 = 266 → المشهد = 15 كريدت بالظبط — متوافق مع الباقات
export const SCENE_SITE_COST = 15;

let _queueSchema: Promise<void> | null = null;

function ensureQueueSchema(): Promise<void> {
  if (!_queueSchema) {
    _queueSchema = (async () => {
      const db = getDb();
      await db.execute(
        `CREATE TABLE IF NOT EXISTS episode_queue (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          script TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          publish_json TEXT DEFAULT '{}',
          task_id TEXT,
          error_message TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT
        )`
      );
      // أعمدة حلقات المشاهد المتعددة (مجموعة قصة واحدة) + مفتاح الفوترة + اتجاه الفيديو
      // is_public: النشر العلني — لا شيء يظهر في الرئيسية إلا ما علّمه المشرف صراحةً (خصوصية الزبائن)
      for (const col of ["group_id TEXT", "scene_no INTEGER", "assigned_key TEXT", "aspect_ratio TEXT", "is_public INTEGER DEFAULT 0"]) {
        try { await db.execute(`ALTER TABLE episode_queue ADD COLUMN ${col}`); } catch { /* العمود موجود */ }
      }
      // سجل دمج الحلقات المركبة
      await db.execute(
        `CREATE TABLE IF NOT EXISTS episode_merges (
          group_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          job_id TEXT,
          status TEXT DEFAULT 'merging',
          url TEXT,
          publish_json TEXT,
          error TEXT,
          updated_at TEXT
        )`
      );
      try { await db.execute(`ALTER TABLE episode_merges ADD COLUMN is_public INTEGER DEFAULT 0`); } catch { /* العمود موجود */ }
      // الصور المصغرة الذكية لكل مجموعة حلقة (فكرة → صورة غلاف بالذكاء الاصطناعي)
      await db.execute(
        `CREATE TABLE IF NOT EXISTS episode_thumbs (
          group_id TEXT PRIMARY KEY,
          title TEXT,
          url TEXT,
          task_id TEXT,
          created_at TEXT
        )`
      );
    })();
  }
  return _queueSchema;
}

// جدول الصور المصغرة — يضمن وجوده قبل أي قراءة/كتابة
let _thumbsSchema: Promise<void> | null = null;
function ensureThumbsSchema(): Promise<void> {
  if (!_thumbsSchema) {
    _thumbsSchema = getDb()
      .execute(
        `CREATE TABLE IF NOT EXISTS episode_thumbs (
          group_id TEXT PRIMARY KEY,
          title TEXT,
          url TEXT,
          task_id TEXT,
          created_at TEXT
        )`
      )
      .then(() => undefined)
      .catch(() => undefined);
  }
  return _thumbsSchema;
}

export interface QueueItem {
  id: string;
  title: string;
  script: string;
  status: string;
  publish: { youtube_title: string; youtube_description: string; hashtags: string };
  task_id: string | null;
  task_status: string | null;
  task_progress: number | null; // نسبة تقدم توليد المشهد 0-100 (شريط التحميل)
  thumbnail_url: string | null; // الصورة المصغرة الذكية للمجموعة (فكرة → غلاف)
  thumbnail_task_id: string | null;
  result_urls: string[];
  error_message: string | null;
  created_at: string;
  group_id: string | null;
  scene_no: number | null;
  assigned_key: string | null; // مفتاح الزبون المحدد لفوترة هذا المشهد (null = مفاتيح المالك)
  aspect_ratio: string | null; // اتجاه الفيديو: "16:9" عرضي أو "9:16" شورتس (null = عرضي)
  merge_status: string | null;
  merged_url: string | null;
  is_public: boolean; // معلَّم النشر العلني في الرئيسية (المشرف فقط)
}

const HASHTAGS = "#قصص_عائلية #كوكب_الكرتون #كرتون_عربي #cartoon #قصص_مصوره";

function buildPublishKit(title: string, script: string) {
  const desc = script.replace(/\s+/g, " ").trim().slice(0, 180);
  return {
    youtube_title: title,
    youtube_description: `${desc}\n\n🌟 قصة تعليمية ممتعة من كوكب الكرتون\nاشترك في القناة وفعّل الجرس ليصلك كل جديد!`,
    hashtags: HASHTAGS,
    source: "template" as const,
  };
}

// حزمة النشر الذكية: Gemini إن كان مضبوطًا — والنمط الثابت رجوعًا آمنًا عند أي فشل
async function buildPublishKitSmart(title: string, script: string) {
  if (geminiConfigured()) {
    try {
      return await generatePublishKitAi(title, script);
    } catch { /* أي فشل → النمط الثابت */ }
  }
  return buildPublishKit(title, script);
}

function parseUrls(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function addQueueItem(
  title: string,
  script: string,
  kitOverride?: { youtube_title: string; youtube_description: string; hashtags: string; source?: string },
  assignedKeyId?: string
): Promise<QueueItem> {
  await ensureQueueSchema();
  const id = crypto.randomUUID();
  const kit = kitOverride || (await buildPublishKitSmart(title, script));
  await getDb().execute({
    sql: `INSERT INTO episode_queue (id, title, script, status, publish_json, assigned_key, created_at)
          VALUES (?, ?, ?, 'pending', ?, ?, datetime('now'))`,
    args: [id, title, script, JSON.stringify(kit), assignedKeyId || null],
  });
  return {
    id, title, script,
    status: "pending",
    publish: kit,
    task_id: null, task_status: null, task_progress: null, thumbnail_url: null, thumbnail_task_id: null, result_urls: [],
    error_message: null,
    created_at: new Date().toISOString(),
    group_id: null,
    scene_no: null,
    assigned_key: assignedKeyId || null,
    aspect_ratio: null,
    merge_status: null,
    merged_url: null,
    is_public: false,
  };
}

// إضافة قصة كاملة مقسمة لمشاهد — مجموعة واحدة مرتبطة تُدمج تلقائيًا عند اكتمالها
export async function addStoryScenes(
  title: string,
  scenes: string[],
  assignedKeyId?: string,
  aspectRatio?: string
): Promise<{ group: string; count: number }> {
  await ensureQueueSchema();
  const group = crypto.randomUUID();
  const n = scenes.length;
  for (let i = 0; i < n; i++) {
    // تأخير ثانية لكل مشهد يضمن ترتيب التنفيذ الصحيح في طابور FIFO
    await getDb().execute({
      sql: `INSERT INTO episode_queue (id, title, script, status, publish_json, group_id, scene_no, assigned_key, aspect_ratio, created_at)
            VALUES (?, ?, ?, 'pending', '{}', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))`,
      args: [
        crypto.randomUUID(),
        `${title} — مشهد ${i + 1}/${n}`,
        scenes[i],
        group,
        i + 1,
        assignedKeyId || null,
        aspectRatio === "9:16" ? "9:16" : "16:9",
        String(i),
      ],
    });
  }
  return { group, count: n };
}

export async function deleteQueueItem(id: string): Promise<boolean> {
  await ensureQueueSchema();
  const rs = await getDb().execute({ sql: "DELETE FROM episode_queue WHERE id = ?", args: [id] });
  return rs.rowsAffected > 0;
}

// حذف بالجملة من واجهة المصنع:
// incomplete = المشاهد غير المكتملة (منتظرة/قيد التوليد/فاشلة) + صفوف الدمج غير المكتملة
// done = المشاهد المكتملة + الحلقات المدمجة الجاهزة
export async function deleteQueueByScope(scope: "incomplete" | "done"): Promise<number> {
  await ensureQueueSchema();
  const db = getDb();
  if (scope === "done") {
    await db.execute(`DELETE FROM episode_merges WHERE status='done'`).catch(() => undefined);
    const rs = await db.execute(`DELETE FROM episode_queue WHERE status='done'`);
    return rs.rowsAffected;
  }
  await db.execute(`DELETE FROM episode_merges WHERE status IN ('merging','failed')`).catch(() => undefined);
  const rs = await db.execute(`DELETE FROM episode_queue WHERE status IN ('pending','generating','failed')`);
  // نظافة: صور مصغرة يتيمة لمجموعات/عناصر لم تعد موجودة
  await db.execute(`DELETE FROM episode_thumbs WHERE group_id NOT IN (SELECT COALESCE(group_id, id) FROM episode_queue)`).catch(() => undefined);
  return rs.rowsAffected;
}

// أحدث الحلقات المدمجة المكتملة — للصفحة الرئيسية العامة (العنوان والرابط والتاريخ والغلاف فقط)
export async function listPublicEpisodes(): Promise<{ title: string; url: string; thumb_url: string; updated_at: string | null; scenes: number }[]> {
  await ensureQueueSchema();
  await ensureThumbsSchema();
  // 🔒 الخصوصية: لا يظهر شيء علنًا إلا ما علّمه المشرف صراحةً (is_public=1).
  // مشاهد الزبائن أو أي مهمة توليد عامة (MCP/أدمن) لا تُعرض أبدًا بدون علم المشرف.
  const rs = await getDb().execute(
    `SELECT title, url, group_id, updated_at FROM (
       SELECT title, url, group_id, updated_at FROM episode_merges WHERE status='done' AND url IS NOT NULL AND COALESCE(is_public, 0) = 1
       UNION ALL
       SELECT q.title, t.result_urls_json AS url, COALESCE(q.group_id, q.id) AS group_id, q.updated_at FROM episode_queue q
         JOIN tasks t ON t.id = q.task_id
         WHERE q.status='done' AND COALESCE(q.is_public, 0) = 1 AND t.status='completed' AND t.result_urls_json LIKE '%http%'
     ) ORDER BY updated_at DESC LIMIT 6`
  );
  // الأغلفة الذكية لكل مجموعة حلقة — تظهر كصورة مصغرة للمشغل
  const thumbs = new Map<string, string>();
  try {
    const trs = await getDb().execute(`SELECT group_id, url FROM episode_thumbs WHERE url IS NOT NULL AND url != ''`);
    for (const t of trs.rows) thumbs.set((t.group_id as string) || "", (t.url as string) || "");
  } catch { /* الأغلفة اختيارية */ }
  // 🔢 عدد مشاهد كل حلقة — أرقام حقيقية من القاعدة تُعرض على بطاقات الرئيسية
  const sceneCounts = new Map<string, number>();
  try {
    const gids = [...new Set(rs.rows.map((r) => (r.group_id as string) || "").filter(Boolean))];
    if (gids.length) {
      const ph = gids.map(() => "?").join(",");
      const cs = await getDb().execute({
        sql: `SELECT COALESCE(group_id, id) AS gid, COUNT(*) AS n FROM episode_queue WHERE COALESCE(group_id, id) IN (${ph}) GROUP BY 1`,
        args: gids,
      });
      for (const c of cs.rows) sceneCounts.set((c.gid as string) || "", Number(c.n) || 1);
    }
  } catch { /* العدّ اختياري — القيمة الافتراضية 1 */ }
  return rs.rows.map((r) => {
    const raw = (r.url as string) || "";
    let url = raw;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && typeof arr[0] === "string" && arr[0].startsWith("http")) url = arr[0];
    } catch { /* الرابط نص مباشر */ }
    return {
      title: (r.title as string).replace(/ — مشهد \d+\/\d+$/, ""),
      url,
      thumb_url: thumbs.get((r.group_id as string) || "") || "",
      updated_at: (r.updated_at as string) || null,
      // 🔢 أرقام حقيقية فقط: عدد مشاهد الحلقة من القاعدة (بدون أي أرقام مخترعة)
      scenes: sceneCounts.get((r.group_id as string) || "") || 1,
    };
  });
}

// إعادة محاولة مشهد عالق (بانتظار مفتاح) أو فاشل — يرجع للطابور بترتيبه
// تعليم/إلغاء تعليم نشر علني للمشرف — للمشهد أو لمجموعة كاملة (جعل الحلقة ظاهرة في الرئيسية)
export async function setPublicFlag(id: string, isPublic: boolean): Promise<{ scenes: number; groups: number }> {
  await ensureQueueSchema();
  const db = getDb();
  const q = await db.execute({ sql: `SELECT group_id FROM episode_queue WHERE id = ?`, args: [id] });
  const gid = (q.rows[0]?.group_id as string) || null;
  let scenes = 0;
  let groups = 0;
  if (gid) {
    // مجموعة كاملة: علّم كل مشاهد المجموعة + صف الدمج الخاص بها
    const r1 = await db.execute({ sql: `UPDATE episode_queue SET is_public = ?, updated_at = datetime('now') WHERE group_id = ?`, args: [isPublic ? 1 : 0, gid] });
    const r2 = await db.execute({ sql: `UPDATE episode_merges SET is_public = ?, updated_at = datetime('now') WHERE group_id = ?`, args: [isPublic ? 1 : 0, gid] }).catch(() => null);
    scenes = r1.rowsAffected;
    groups = r2?.rowsAffected || 0;
  } else {
    const r = await db.execute({ sql: `UPDATE episode_queue SET is_public = ?, updated_at = datetime('now') WHERE id = ?`, args: [isPublic ? 1 : 0, id] });
    scenes = r.rowsAffected;
    // مشهد مفرد بلا مجموعة: إن كان له task مكتمل ومدمج — علّم الدمج الفردي إذا وُجد
    await db.execute({ sql: `UPDATE episode_merges SET is_public = ?, updated_at = datetime('now') WHERE group_id = ?`, args: [isPublic ? 1 : 0, id] }).catch(() => undefined);
  }
  return { scenes, groups };
}

export async function retryQueueItem(id: string): Promise<boolean> {
  await ensureQueueSchema();
  const rs = await getDb().execute({
    sql: `UPDATE episode_queue SET status='pending', task_id=NULL, error_message=NULL, updated_at=datetime('now')
          WHERE id=? AND status IN ('generating','failed')`,
    args: [id],
  });
  return rs.rowsAffected > 0;
}

// مراقبة مجموعات القصص: عند اكتمال كل المشاهد → ابدأ الدمج، وعند انتهاء الدمج → اطلب حزمة النشر الذكية
interface GroupAcc {
  title: string;
  items: Array<{ no: number; status: string; url: string }>;
}

async function checkAndMergeGroups(): Promise<void> {
  const db = getDb();
  // تنظيف أقفال دمج عالقة (بدأت منذ 5 دقائق ولم تصل merging) — حررها لإعادة المحاولة
  await db.execute(
    `DELETE FROM episode_merges WHERE status = 'starting' AND updated_at < datetime('now', '-5 minutes')`
  ).catch(() => undefined);
  const rs = await db.execute(
    `SELECT q.group_id, q.title, q.scene_no, q.status, t.result_urls_json
     FROM episode_queue q LEFT JOIN tasks t ON t.id = q.task_id
     WHERE q.group_id IS NOT NULL`
  );
  const groups = new Map<string, GroupAcc>();
  for (const r of rs.rows) {
    const gid = r.group_id as string;
    if (!gid) continue;
    const acc = groups.get(gid) || {
      title: ((r.title as string) || "").split(" — مشهد ")[0] || "حلقة",
      items: [],
    };
    acc.items.push({
      no: (r.scene_no as number) || 0,
      status: (r.status as string) || "pending",
      url: parseUrls(r.result_urls_json)[0] || "",
    });
    groups.set(gid, acc);
  }

  const mergeRs = await db.execute(`SELECT group_id, job_id, status FROM episode_merges`);
  const merges = new Map(mergeRs.rows.map((r) => [r.group_id as string, r]));

  for (const [gid, g] of groups) {
    const existing = merges.get(gid);
    if (existing && (existing.status as string) !== "failed") {
      if ((existing.status as string) === "merging" && existing.job_id) {
        const j = await mergerClient.getJob(existing.job_id as string).catch(() => null);
        if (j && j.status === "done" && (j.videoUrl || j.downloadUrl)) {
          const url = j.videoUrl || j.downloadUrl || "";
          const kit = geminiConfigured()
            ? await generatePublishKitAi(g.title, `حلقة كرتون عائلي قصيرة مكونة من عدة مشاهد متصلة بعنوان: ${g.title}`).catch(() => null)
            : null;
          await db.execute({
            sql: `UPDATE episode_merges SET status='done', url=?, publish_json=?, updated_at=datetime('now') WHERE group_id=?`,
            args: [
              url,
              JSON.stringify(kit || { youtube_title: g.title, youtube_description: "حلقة كاملة من كوكب الكرتون — اشترك وفعّل الجرس!", hashtags: HASHTAGS, source: "template" }),
              gid,
            ],
          }).catch(() => undefined);
          // 📣 النشر الآلي على قناة تليجرام: الغلاف + الوصف + الهاشتاقات + الرابط — لو الإعدادات مفعّلة
          void (async () => {
            try {
              const th = await db.execute({ sql: "SELECT url FROM episode_thumbs WHERE group_id = ?", args: [gid] }).catch(() => null);
              const thumbUrl = ((th?.rows[0]?.url as string) || "") || undefined;
              await telegramPostEpisode({
                title: g.title,
                description: kit?.youtube_description,
                hashtags: kit?.hashtags || HASHTAGS,
                url,
                thumbUrl,
              });
            } catch { /* القناة اختيارية — فشلها لا يوقف التدفق */ }
          })();
        } else if (j && j.status === "failed") {
          await db.execute({
            sql: `UPDATE episode_merges SET status='failed', error=?, updated_at=datetime('now') WHERE group_id=?`,
            args: [((j.error || "فشل الدمج") as string).slice(0, 400), gid],
          }).catch(() => undefined);
        }
      }
      continue;
    }

    // لا يوجد دمج بعد — هل اكتملت كل مشاهد المجموعة؟
    if (g.items.length < 2) continue;
    const allDone = g.items.every((x) => x.status === "done" && x.url);
    if (!allDone) continue;

    const ordered = [...g.items].sort((a, b) => a.no - b.no).map((x) => x.url);
    try {
      // قفل ذري: INSERT بمعرف المجموعة (مفتاح أساسي) — نداءان متزامنان: واحد فقط يفوز
      await db.execute({
        sql: `INSERT INTO episode_merges (group_id, title, status, updated_at) VALUES (?, ?, 'starting', datetime('now'))`,
        args: [gid, g.title],
      });
      const { jobId } = await mergerClient.createJob(ordered);
      await db.execute({
        sql: `UPDATE episode_merges SET job_id = ?, status = 'merging', updated_at = datetime('now') WHERE group_id = ?`,
        args: [jobId, gid],
      });
      // خدمة الدمج تبدأ المعالجة بنفسها عند الإنشاء؛ هذا نداء احتياطي بعد الرد (لا يجمّد الدالة)
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(mergerClient.processJob(jobId).catch(() => {}));
    } catch (e) {
      // حرر القفل ليُعاد تكرار المحاولة في التحديث القادم
      await db.execute({ sql: `DELETE FROM episode_merges WHERE group_id = ? AND status = 'starting'`, args: [gid] }).catch(() => undefined);
      /* الخدمة مشغولة — المحاولة تُعاد في التحديث القادم */
      void e;
    }
  }
}

// 🧹 كاسحة الطابور: مهام تجاوزت عمرها + عناصر يتيمة بلا مهمة — تُستدعى من القراءة ومن cron
export async function sweepQueue(): Promise<{ expired: number; requeued: number; synced: number }> {
  const expired = await expireAllStaleTasks(30).catch(() => 0);
  const r = await getDb().execute(
    `UPDATE episode_queue SET status = 'pending', task_id = NULL, error_message = 'انقطع التوليد قبل بدئه — أُعيد للطابور تلقائيًا', updated_at = datetime('now')
     WHERE status = 'generating' AND (task_id IS NULL OR task_id = '') AND updated_at < datetime('now', '-10 minutes')`
  ).catch(() => ({ rowsAffected: 0 }));
  const synced = await getDb().execute(
    `UPDATE episode_queue SET status = 'failed', updated_at = datetime('now')
     WHERE status = 'generating' AND task_id IN (SELECT id FROM tasks WHERE status = 'failed')`
  ).catch(() => ({ rowsAffected: 0 }));
  return { expired: Number(expired || 0), requeued: r.rowsAffected, synced: synced.rowsAffected };
}

export async function listQueue(): Promise<QueueItem[]> {
  await ensureQueueSchema();
  await ensureThumbsSchema();
  // 🧹 كاسحة عالمية: أي مهمة processing تجاوزت 30 دقيقة → failed — لا مهام معلقة
  // للأبد حتى لو لم يفتح الطابور أحد (كانت تعتمد على refreshTask من صفحة مفتوحة)
  await sweepQueue().catch(() => undefined);
  await checkAndMergeGroups().catch(() => undefined);
  const rs = await getDb().execute(
    `SELECT q.*, t.status AS task_status, t.progress AS task_progress, t.result_urls_json, t.error_message AS task_error,
            m.status AS merge_status, m.url AS merged_url, th.url AS thumb_url, th.task_id AS thumb_task_id
     FROM episode_queue q
     LEFT JOIN tasks t ON t.id = q.task_id
     LEFT JOIN episode_merges m ON m.group_id = q.group_id
     LEFT JOIN episode_thumbs th ON th.group_id = COALESCE(q.group_id, q.id)
     ORDER BY q.created_at DESC, q.id DESC`
  );
  const items: QueueItem[] = rs.rows.map((r) => {
    const taskStatus = (r.task_status as string) || null;
    // مزامنة كسالبة: حدّث حالة الصف من حالة المهمة
    let status = (r.status as string) || "pending";
    if (status === "generating" && taskStatus === "completed") status = "done";
    if (status === "generating" && taskStatus === "failed") status = "failed";
    if (status !== r.status) {
      void getDb().execute({
        sql: "UPDATE episode_queue SET status = ?, updated_at = datetime('now') WHERE id = ?",
        args: [status, r.id as string],
      }).catch(() => undefined);
    }
    const publish = (() => {
      try { return JSON.parse((r.publish_json as string) || "{}"); }
      catch { return { youtube_title: r.title as string, youtube_description: "", hashtags: HASHTAGS }; }
    })();
    return {
      id: r.id as string,
      title: r.title as string,
      script: r.script as string,
      status,
      publish,
      task_id: (r.task_id as string) || null,
      task_status: taskStatus,
      task_progress: (r.task_progress as number) ?? null,
      thumbnail_url: (r.thumb_url as string) || null,
      thumbnail_task_id: (r.thumb_task_id as string) || null,
      result_urls: parseUrls(r.result_urls_json),
      error_message: (r.error_message as string) || (r.task_error as string) || null,
      created_at: (r.created_at as string) || "",
      group_id: (r.group_id as string) || null,
      scene_no: (r.scene_no as number) || null,
      assigned_key: (r.assigned_key as string) || null,
      aspect_ratio: (r.aspect_ratio as string) || null,
      merge_status: (r.merge_status as string) || null,
      merged_url: (r.merged_url as string) || null,
      is_public: Number(r.is_public || 0) === 1,
    };
  });
  return items;
}

// صورة مصغرة ذكية لمجموعة حلقة — مبنية على القصة وتُخزن مع المجموعة (بالذكاء الاصطناعي)
// لو المهمة أخدت وقتها تُخزن task_id ويجيبها زر التحديث في المصنع أو النداء المتكرر
export async function generateGroupThumbnail(
  groupId: string,
  title: string,
  story: string,
  aspect: string,
  keyId?: string
): Promise<{ ok: boolean; url?: string; taskId?: string; error?: string }> {
  await ensureQueueSchema();
  await ensureThumbsSchema();
  const orientation = aspect === "9:16" ? "مكون عمودي 9:16 مناسب للشورتس" : "مكون أفقي 16:9 مناسب ليوتيوب";
  const prompt = `صورة مصغرة غلاف لفيديو كرتون عائلي عن: ${story.slice(0, 320)}. أسلوب كرتون ثلاثي الأبعاد مشرق ومناسب لجميع أفراد الأسرة، ألوان زاهية مبهجة، البطل الرئيسي كما ورد في القصة نفسها (بنفس اسمه وملامحه وملابسه، شخصية كرتونية مبتسمة) واضح في منتصف الصورة، خلفية من عالم القصة، إضاءة سينمائية دافئة، بدون أي نصوص أو حروف أو كلمات في الصورة، ${orientation}`;
  const existing = await getDb().execute({
    sql: `SELECT task_id, url FROM episode_thumbs WHERE group_id = ?`,
    args: [groupId],
  });
  const prevTaskId = (existing.rows[0]?.task_id as string) || null;
  try {
    const task = await runGeneration({
      type: "image",
      model: "gpt-image-2-6/flare-text-to-image",
      input: { prompt: prompt.slice(0, 1500), aspect_ratio: aspect === "9:16" ? "9:16" : "16:9" },
      waitSeconds: 35,
      // فوترة الصورة المصغرة من مفتاح الزبون نفسه لو مرتبط
      keyId: keyId || undefined,
    });
    const url = task.result_urls?.[0] || null;
    if (url) {
      await getDb().execute({
        sql: `INSERT INTO episode_thumbs (group_id, title, url, task_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))
              ON CONFLICT(group_id) DO UPDATE SET url = excluded.url, task_id = excluded.task_id, title = excluded.title`,
        args: [groupId, title.slice(0, 120), url, task.id],
      });
      return { ok: true, url, taskId: task.id };
    }
    await getDb().execute({
      sql: `INSERT INTO episode_thumbs (group_id, title, url, task_id, created_at) VALUES (?, ?, NULL, ?, datetime('now'))
            ON CONFLICT(group_id) DO UPDATE SET task_id = excluded.task_id`,
      args: [groupId, title.slice(0, 120), task.id],
    });
    return { ok: false, taskId: task.id, error: "الصورة لسه بتتولد — اضغط تحديث بعد لحظات" };
  } catch (e) {
    if (prevTaskId) return { ok: false, taskId: prevTaskId, error: e instanceof Error ? e.message : "فشل توليد الصورة" };
    return { ok: false, error: e instanceof Error ? e.message : "فشل توليد الصورة" };
  }
}

// استكمال صورة مصغرة قيد التوليد — يحدّث المهمة من المزود ويخزن الرابط لو اكتملت
export async function refreshGroupThumbnail(groupId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await ensureQueueSchema();
  await ensureThumbsSchema();
  const rs = await getDb().execute({
    sql: `SELECT task_id, url, title FROM episode_thumbs WHERE group_id = ?`,
    args: [groupId],
  });
  const row = rs.rows[0];
  if (!row) return { ok: false, error: "لا توجد صورة مصغرة لهذه المجموعة" };
  const storedUrl = (row.url as string) || null;
  if (storedUrl) return { ok: true, url: storedUrl };
  const taskId = (row.task_id as string) || null;
  if (!taskId) return { ok: false, error: "لا توجد مهمة صورة — ولّد صورة جديدة" };
  try {
    const { refreshTask } = await import("./coordinator");
    const task = await refreshTask(taskId);
    const url = task?.result_urls?.[0] || null;
    if (task?.status === "completed" && url) {
      await getDb().execute({
        sql: `UPDATE episode_thumbs SET url = ? WHERE group_id = ?`,
        args: [url, groupId],
      });
      return { ok: true, url };
    }
    if (task?.status === "failed") return { ok: false, error: task.error_message || "فشل توليد الصورة — ولّد صورة جديدة" };
    return { ok: false, error: "الصورة لسه بتتولد — جرّب تاني بعد لحظات" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "فشل تحديث الصورة" };
  }
}

async function nextPending(): Promise<{ id: string; title: string; script: string; assigned_key: string | null; aspect_ratio: string | null } | null> {
  const rs = await getDb().execute(
    `SELECT id, title, script, assigned_key, aspect_ratio FROM episode_queue
     WHERE status = 'pending' ORDER BY created_at ASC, id ASC LIMIT 1`
  );
  const row = rs.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    script: row.script as string,
    assigned_key: (row.assigned_key as string) || null,
    aspect_ratio: (row.aspect_ratio as string) || null,
  };
}

export async function nextPendingPreview(): Promise<{ id: string; title: string; created_at: string } | null> {
  await ensureQueueSchema();
  const rs = await getDb().execute(
    `SELECT id, title, created_at FROM episode_queue WHERE status = 'pending'
     ORDER BY created_at ASC, id ASC LIMIT 1`
  );
  const row = rs.rows[0];
  if (!row) return null;
  return { id: row.id as string, title: row.title as string, created_at: (row.created_at as string) || "" };
}

// ------------------------------------------------------------
// توليد الحلقة التالية: يُستخدم من cron اليومي ومن زر التشغيل اليدوي
// ------------------------------------------------------------
export async function generateNextEpisode(itemId?: string): Promise<
  { ok: true; title: string; taskId: string; deducted: number; balance: number | null } | { ok: false; reason: string }
> {
  await ensureSchema();
  await ensureQueueSchema();
  let item: { id: string; title: string; script: string; assigned_key: string | null; aspect_ratio: string | null } | null = null;
  if (itemId) {
    const rs = await getDb().execute({
      sql: `SELECT id, title, script, assigned_key, aspect_ratio FROM episode_queue WHERE id = ? AND status = 'pending'`,
      args: [itemId],
    });
    const row = rs.rows[0];
    if (row) item = {
      id: row.id as string,
      title: row.title as string,
      script: row.script as string,
      assigned_key: (row.assigned_key as string) || null,
      aspect_ratio: (row.aspect_ratio as string) || null,
    };
  }
  if (!item) item = await nextPending();
  if (!item) {
    await setInternalSetting("last_cron_run", `${new Date().toISOString()} | القائمة فاضية — لا يوجد سيناريو`).catch(() => undefined);
    return { ok: false, reason: "قائمة الانتظار فاضية — أضف سيناريوهات أولًا" };
  }

  // claim ذري: من ينتقل pending → generating يفوز (الكرون والتشغيل اليدوي لا يولّدان نفس المشهد مرتين)
  const claim = await getDb().execute({
    sql: "UPDATE episode_queue SET status = 'generating', updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
    args: [item.id],
  });
  if (claim.rowsAffected === 0) {
    return { ok: false, reason: "المشهد جارٍ التوليد بالفعل أو لم يعد منتظرًا" };
  }

  // ---------------- اختيار المفتاح + الفوترة ----------------
  // 💰 النموذج الموحد النهائي: مفاتيح المنصة السرية هي وقود كل التوليدات
  // (حساب المنصة الرئيسي)، وحلقات المصنع إنتاج المنصة — لا فوترة زبائن هنا
  // (فوترة الزبائن في الاستوديو فقط عبر reserveSceneCredit من المحفظة الواحدة).
  const videoDef = MODELS.find((m) => m.type === "video");
  const genProviders = videoDef?.providers || ["kie", "cometapi", "apiframe"];
  const keyPick = await pickGenerationKey(genProviders);
  if (!keyPick.platform) {
    // لا مفاتيح منصة → فشل واضح بدون أي خصم (رسالة ودودة بلا مصطلحات تقنية)
    const note = "⏸️ التوليد متوقف مؤقتًا للصيانة المقررة — الرصيد محفوظ بالكامل ولم يُخصم. جرّب بعد شوية أو تواصل معنا واتساب.";
    await getDb().execute({
      sql: "UPDATE episode_queue SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
      args: [note, item.id],
    }).catch(() => undefined);
    return { ok: false, reason: note };
  }
  const genKeyRole = keyPick.keyRole;

  try {
    // 💰 موديل الفيديو من إعدادات المشرف (قسم الإعدادات في صفحة الشحن) — الافتراضي grok
    // التغيير لموديل أرخص (من docs.kie.ai) يوفر كريدت المنصة ويطيل عمر الرصيد
    const genModel = (await getSettings()).video_model?.trim() || "grok-imagine-video-1-5-preview";
    // 🔊 الصوت عربي إلزامي في أول البرومبت + توقيع توليد فريد — لا لغة غريبة ولا فيديو متكرر
    const genPrompt = arabicVideoPrompt(item.script, `حلقة: ${item.title}`);
    const task = await runGeneration({
      type: "video",
      model: genModel,
      input: {
        prompt: genPrompt,
        aspect_ratio: item.aspect_ratio || "16:9", // شورتس 9:16 أو عرضي 16:9 — لكل قصة اختيارها
        resolution: "480p", // نصف السعر — الفرق غير محسوس على شاشة موبايل الشورتس
        enable_audio: true,
        duration: 8,
      },
      waitSeconds: 10,
      keyRole: genKeyRole, // مفاتيح المنصة فقط — المالك أولًا ثم البقية
    });
    await getDb().execute({
      sql: "UPDATE episode_queue SET task_id = ?, updated_at = datetime('now') WHERE id = ?",
      args: [task.id, item.id],
    });
    // إنتاج المنصة — بلا فوترة زبائن (الفوترة في الاستوديو فقط)
    await setInternalSetting("last_cron_run", `${new Date().toISOString()} | بدأ توليد: ${item.title}`).catch(() => undefined);
    return { ok: true, title: item.title, taskId: task.id, deducted: 0, balance: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await getDb().execute({
      sql: "UPDATE episode_queue SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
      args: [msg.slice(0, 500), item.id],
    });
    await setInternalSetting("last_cron_run", `${new Date().toISOString()} | فشل: ${msg.slice(0, 120)}`).catch(() => undefined);
    return { ok: false, reason: `فشل التوليد: ${msg.slice(0, 200)}` };
  }
}

// ---------------- حجوزات ledger لفوترة المشاهد ----------------
// reserve: خصم ذري (فقط لو الرصيد يكفي) + سجل فريد لكل مشهد — المحاولات المتكررة لا تخصم مرتين
export async function reserveSceneCredit(userId: string, sceneId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  // حارس الحساب الموقوف — الإيقاف يدوي من الأدمن فقط ولا يخصم من حساب موقوف
  try {
    const { isUserSuspended } = await import("./auth");
    if (await isUserSuspended(userId)) return { ok: false, error: "الحساب موقوف مؤقتًا — تواصل معنا من زر الواتساب" };
  } catch { /* تعذر الفحص نادرًا — نكمل بلا حاجز */ }
  // محاولة سابقة فشلت ورد رصيدها → ابدأ محاولة جديدة نظيفة (امسح أثر المحاولة القديمة)
  await db.execute({ sql: `DELETE FROM ledger WHERE ref_id = ? AND reason IN ('reserve','refund')`, args: [sceneId] }).catch(() => undefined);
  // خصم ذري: فقط لو الرصيد يكفي — لا يصبح السالب أبدًا
  const rs = await db.execute({
    sql: `UPDATE users SET credits = COALESCE(credits, 0) - ? WHERE id = ? AND COALESCE(credits, 0) >= ?`,
    args: [SCENE_SITE_COST, userId, SCENE_SITE_COST],
  });
  if (rs.rowsAffected === 0) return { ok: false, error: `رصيد الحساب غير كافٍ — المشهد يحتاج ${SCENE_SITE_COST} كريدت` };
  const logged = await addLedger(userId, -SCENE_SITE_COST, "reserve", sceneId);
  if (!logged) {
    // السجل فشل (مرجع موجود) — أعد الرصيد فورًا حتى لا يُخصم بلا سجل
    await db.execute({ sql: `UPDATE users SET credits = COALESCE(credits, 0) + ? WHERE id = ?`, args: [SCENE_SITE_COST, userId] }).catch(() => undefined);
    return { ok: false, error: "المشهد محجوز مسبقًا — جارٍ توليده في محاولة أخرى" };
  }
  return { ok: true };
}

// refund: رد حجز أو خصم مشهد بعد فشل توليده — السجل الفريد يمنع الرد المزدوج
// يشمل حالتين: reserve (فشل فوري قبل التحويل لـcharge) و charge (المهمة قُبلت ثم فشلت لاحقًا لدى المزود)
export async function refundSceneCredit(userId: string, sceneId: string): Promise<void> {
  const db = getDb();
  // احكم عبر السجل: لا رد إن لم يوجد حجز أو خصم فعلي (أو تم رده مسبقًا)
  const rs = await db.execute({ sql: `SELECT 1 FROM ledger WHERE ref_id = ? AND reason IN ('reserve','charge')`, args: [sceneId] });
  if (!rs.rows.length) return;
  const done = await addLedger(userId, SCENE_SITE_COST, "refund", sceneId);
  if (done) {
    await db.execute({ sql: `UPDATE users SET credits = COALESCE(credits, 0) + ? WHERE id = ?`, args: [SCENE_SITE_COST, userId] }).catch(() => undefined);
    await db.execute({ sql: `DELETE FROM ledger WHERE ref_id = ? AND reason = 'reserve'`, args: [sceneId] }).catch(() => undefined);
  }
}

// 💰 خصم نهائي عند الاكتمال المتأخر: مشهد اكتمل دون حجز/خصم فعلي — كان بانتظار
// وقود المزود ورُد حجزه فورًا، ثم عاد الوقود واكتمل التوليد لاحقًا → يُحاسب هنا
// مرة واحدة بالسجل الفريد (قد يجعل الرصيد سالبًا عمدًا: الفيديو سُلِّم فعلًا)
export async function chargeSceneIfUnpaid(userId: string, sceneId: string): Promise<void> {
  const db = getDb();
  const rs = await db.execute({ sql: `SELECT 1 FROM ledger WHERE ref_id = ? AND reason IN ('reserve','charge')`, args: [sceneId] });
  if (rs.rows.length) return; // مدفوع أو محجوز بالفعل
  const done = await addLedger(userId, -SCENE_SITE_COST, "charge", sceneId);
  if (done) {
    await db.execute({ sql: `UPDATE users SET credits = COALESCE(credits, 0) - ? WHERE id = ?`, args: [SCENE_SITE_COST, userId] }).catch(() => undefined);
    await db.execute({ sql: `DELETE FROM ledger WHERE ref_id = ? AND reason = 'refund'`, args: [sceneId] }).catch(() => undefined);
  }
}
