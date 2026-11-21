// ============================================================
// 🎬 استوديو الإنتاج الذاتي — نظام المشاريع والمشاهد
// العميل ينشئ مشروعًا، يكتب القصة، يقسمها لمشاهد، يحدد الشخصيات،
// يولّد كل مشهد فيديو (15 كريدت موقع لكل مشهد)، يعاين، يدمج وينزّل.
// قواعد الفوترة نفس نظام الحلقات: SCENE_SITE_COST = 15 كريدت لكل مشهد
// التوليد عبر runGeneration نفسه، والدمج عبر runMerge نفسه.
// ============================================================
import { randomUUID } from "crypto";
import { getDb, ensureSchema, expireAllStaleTasks } from "./turso";
import { isUserSuspended } from "./auth";
import { runGeneration, runMerge, refreshTask, RequestError } from "./coordinator";
import { pickGenerationKey } from "./keys";
import { MODELS } from "./models";
import { arabicVideoPrompt } from "./voice";
import { SCENE_SITE_COST, reserveSceneCredit, refundSceneCredit, chargeSceneIfUnpaid } from "./episodes";
import { splitStoryIntoScenes } from "./gemini";

export interface StudioCharacter {
  name: string;
  description: string;
}

export interface StudioProject {
  id: string;
  user_id: string;
  title: string;
  story: string;
  aspect_ratio: string; // "16:9" | "9:16"
  category: string; // نوع المحتوى — يضبط أسلوب القصة والمشاهد (مفتاح CONTENT_CATEGORIES)
  characters: StudioCharacter[]; // JSON في العمود
  status: string; // draft | producing | merged
  merged_url: string | null;
  created_at: string;
  updated_at: string;
}

// 🎛️ أقسام الخدمات الأحد عشر — ضبط أسلوب عبر البرومبت فقط (نفس محرك التوليد الحالي):
// لا مزود جديد ولا خدمة وهمية — كل قسم إرشاد أسلوب حقيقي يُحقن في تقسيم القصة
export const CONTENT_CATEGORIES: Array<{ key: string; label: string; guide: string }> = [
  { key: "kids_edu", label: "🎓 تعليمية للصغار", guide: "أسلوب فيديو تعليمي للصغار: لغة بسيطة مبهجة، ألوان زاهية، إيقاع هادئ، تكرار المعلومة الأساسية بصريًا وصوتيًا، ونهاية مشجعة تحفز على التعلم." },
  { key: "nursery", label: "🔤 محتوى الحضانة (حروف وأرقام وألوان وأشكال)", guide: "أسلوب محتوى حضانة لأصغر أفراد الأسرة (2-5 سنوات) عن الحروف والأرقام والألوان والأشكال: عنصر تعليمي واحد واضح لكل مشهد، رسومات كرتونية كبيرة بسيطة، تكرار وإيقاع أناشيد، بدون أي تشويش بصري." },
  { key: "curriculum", label: "📚 شرح المناهج والدروس", guide: "أسلوب شرح منهج دراسي خطوة بخطوة: مثال عملي في كل مشهد، نص توضيحي كبير على الشاشة، لغة مبسطة دقيقة، وخلاصة مراجعة في المشهد الأخير." },
  { key: "adults_edu", label: "🧠 تعليمية للكبار", guide: "أسلوب فيديو تعليمي للكبار: معلومات عملية مركزة، أمثلة واقعية، إيقاع متوسط، عرض احترافي واضح بدون مبالغة كرتونية." },
  { key: "cartoon_film", label: "🎬 أفلام كرتون لكل أفراد الأسرة", guide: "أسلوب فيلم كرتون عائلي: بناء درامي كامل (بداية ثم مشكلة ثم حل)، شخصيات ثابتة معبرة، خلفيات سينمائية، وإضاءة وأجواء تتغير بتطور الأحداث." },
  { key: "adventure", label: "🕵️ مغامرات وغموض وتشويق", guide: "أسلوب مغامرة وغموض وتشويق: تشنّج تدريجي، ألغاز بصرية، إيقاع متصاعد، أجواء غامضة، ونهاية مفاجئة مرضية مناسبة للعائلة." },
  { key: "ads", label: "📢 إعلانات وتسويق", guide: "أسلوب إعلان تسويقي قصير: خطاف جذاب في أول ثانيتين، عرض المنتج أو الخدمة بوضوح، لقطات احترافية مصقولة، ودعوة صريحة لاتخاذ إجراء في النهاية." },
  { key: "social", label: "📱 عامة وسوشيال ميديا", guide: "أسلوب فيديو سوشيال ميديا عمومي: إيقاع سريع، مشاهد قوية بصريًا، نص كبير مناسب للموبايل، صيغة شورتس عمودية تصلح للنشر المباشر." },
  { key: "puzzles", label: "🧩 ألغاز وتحديات", guide: "أسلوب ألغاز وتحديات ذهنية: لغز بصري أو سؤال واضح في كل مشهد، إيقاع معلق يبني الترقب، تلميحات تدريجية، ثم الإجابة الكاملة في النهاية مع تشجيع المشاهد على المحاولة قبل الكشف." },
  { key: "bedtime", label: "🌙 قصص قبل النوم", guide: "أسلوب قصص قبل النوم للأطفال: حكاية هادئة بطيئة الإيقاع، صوت دافئ وهدوء، إضاءة خافتة دافئة الألوان، مشاهد لطيفة متتابعة، وانتهاء مريح بجملة نوم هادئة — بدون مفاجآت أو أصوات عالية." },
  { key: "songs", label: "🎵 أغاني أطفال", guide: "أسلوب أغاني أطفال قصيرة: حرف أو كلمة متكررة يردد عليها الطفل، إيقاع حماسي منتظم، مشاهد مرحة متزامنة مع الإيقاع، حركات ولعب في كل مشهد، وتجمع الكلمات الأساسية للتعلم مع المرح." },
];

export function categoryGuide(key: string): string {
  return CONTENT_CATEGORIES.find((c) => c.key === key)?.guide || "";
}

export interface StudioScene {
  id: string;
  project_id: string;
  scene_no: number;
  prompt: string;
  status: string; // pending | generating | completed | failed
  task_id: string | null;
  video_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

let schemaReady: Promise<void> | null = null;

export function ensureStudioSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureSchema();
      const db = getDb();
      await db.execute(`CREATE TABLE IF NOT EXISTS studio_projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        story TEXT NOT NULL DEFAULT '',
        aspect_ratio TEXT NOT NULL DEFAULT '16:9',
        characters TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft',
        merged_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      try { await db.execute(`ALTER TABLE studio_projects ADD COLUMN category TEXT DEFAULT ''`); } catch { /* العمود موجود */ }
      await db.execute(`CREATE TABLE IF NOT EXISTS studio_scenes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        scene_no INTEGER NOT NULL,
        prompt TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        task_id TEXT,
        video_url TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

function rowToProject(r: Record<string, unknown>): StudioProject {
  let characters: StudioCharacter[] = [];
  try {
    const parsed = JSON.parse(String(r.characters || "[]"));
    if (Array.isArray(parsed)) {
      characters = parsed
        .filter((c) => c && typeof c === "object")
        .map((c) => ({ name: String(c.name || "").slice(0, 80), description: String(c.description || "").slice(0, 600) }))
        .filter((c) => c.name || c.description);
    }
  } catch {
    characters = [];
  }
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    title: String(r.title || "مشروع بدون عنوان"),
    story: String(r.story || ""),
    aspect_ratio: String(r.aspect_ratio || "16:9"),
    category: String(r.category || ""),
    characters,
    status: String(r.status || "draft"),
    merged_url: (r.merged_url as string) || null,
    created_at: String(r.created_at || ""),
    updated_at: String(r.updated_at || ""),
  };
}

function rowToScene(r: Record<string, unknown>): StudioScene {
  return {
    id: String(r.id),
    project_id: String(r.project_id),
    scene_no: Number(r.scene_no || 0),
    prompt: String(r.prompt || ""),
    status: String(r.status || "pending"),
    task_id: (r.task_id as string) || null,
    video_url: (r.video_url as string) || null,
    error_message: (r.error_message as string) || null,
    created_at: String(r.created_at || ""),
    updated_at: String(r.updated_at || ""),
  };
}

export class StudioError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function touchProject(projectId: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE studio_projects SET updated_at = datetime('now') WHERE id = ?",
    args: [projectId],
  });
}

// ---------- المشاريع ----------
export async function listProjects(userId: string): Promise<Array<StudioProject & { scenes_total: number; scenes_done: number }>> {
  await ensureStudioSchema();
  const rs = await getDb().execute({
    sql: `SELECT p.*,
            (SELECT COUNT(*) FROM studio_scenes s WHERE s.project_id = p.id) AS scenes_total,
            (SELECT COUNT(*) FROM studio_scenes s WHERE s.project_id = p.id AND s.status = 'completed') AS scenes_done
          FROM studio_projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC, p.created_at DESC`,
    args: [userId],
  });
  return rs.rows.map((r) => {
    const rec = r as unknown as Record<string, unknown>;
    return { ...rowToProject(rec), scenes_total: Number(rec.scenes_total || 0), scenes_done: Number(rec.scenes_done || 0) };
  });
}

async function ownedProject(id: string, userId: string): Promise<StudioProject> {
  const rs = await getDb().execute({
    sql: "SELECT * FROM studio_projects WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  const row = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) throw new StudioError("المشروع غير موجود أو ليس لديك صلاحية عليه", 404);
  return rowToProject(row);
}

export async function getProject(id: string, userId: string): Promise<{ project: StudioProject; scenes: StudioScene[] }> {
  await ensureStudioSchema();
  const project = await ownedProject(id, userId);
  // حدّث المشاهد قيد التوليد من المزود قبل الإرجاع — عشان المعاينة تلحق آخر حالة
  const scenes = await refreshProjectScenes(project.id);
  return { project, scenes };
}

export async function createProject(
  userId: string,
  input: { title?: string; story?: string; aspect_ratio?: string; category?: string; characters?: StudioCharacter[] }
): Promise<StudioProject> {
  await ensureStudioSchema();
  const title = String(input.title || "").trim().slice(0, 120) || "مشروع جديد";
  const story = String(input.story || "").trim().slice(0, 8000);
  const aspect = input.aspect_ratio === "9:16" ? "9:16" : "16:9";
  const category = CONTENT_CATEGORIES.some((c) => c.key === input.category) ? String(input.category) : "";
  const characters = (input.characters || [])
    .filter((c) => c && typeof c === "object")
    .map((c) => ({ name: String(c.name || "").slice(0, 80), description: String(c.description || "").slice(0, 600) }))
    .filter((c) => c.name || c.description)
    .slice(0, 8);
  const id = randomUUID();
  await getDb().execute({
    sql: `INSERT INTO studio_projects (id, user_id, title, story, aspect_ratio, category, characters, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
    args: [id, userId, title, story, aspect, category, JSON.stringify(characters)],
  });
  return ownedProject(id, userId);
}

export async function updateProject(
  id: string,
  userId: string,
  patch: { title?: string; story?: string; aspect_ratio?: string; category?: string; characters?: StudioCharacter[]; status?: string }
): Promise<StudioProject> {
  await ensureStudioSchema();
  await ownedProject(id, userId);
  const sets: string[] = [];
  const args: string[] = [];
  if (patch.title !== undefined) {
    const t = String(patch.title).trim().slice(0, 120);
    if (!t) throw new StudioError("العنوان مطلوب");
    sets.push("title = ?"); args.push(t);
  }
  if (patch.story !== undefined) { sets.push("story = ?"); args.push(String(patch.story).trim().slice(0, 8000)); }
  if (patch.aspect_ratio !== undefined) {
    sets.push("aspect_ratio = ?"); args.push(patch.aspect_ratio === "9:16" ? "9:16" : "16:9");
  }
  if (patch.category !== undefined) {
    const cat = CONTENT_CATEGORIES.some((c) => c.key === patch.category) ? String(patch.category) : "";
    sets.push("category = ?"); args.push(cat);
  }
  if (patch.characters !== undefined) {
    const characters = (patch.characters || [])
      .filter((c) => c && typeof c === "object")
      .map((c) => ({ name: String(c.name || "").slice(0, 80), description: String(c.description || "").slice(0, 600) }))
      .filter((c) => c.name || c.description)
      .slice(0, 8);
    sets.push("characters = ?"); args.push(JSON.stringify(characters));
  }
  if (patch.status !== undefined && ["draft", "producing", "merged"].includes(patch.status)) {
    sets.push("status = ?"); args.push(patch.status);
  }
  if (!sets.length) return ownedProject(id, userId);
  sets.push("updated_at = datetime('now')");
  await getDb().execute({
    sql: `UPDATE studio_projects SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
    args: [...args, id, userId],
  });
  return ownedProject(id, userId);
}

export async function deleteProject(id: string, userId: string): Promise<void> {
  await ensureStudioSchema();
  await ownedProject(id, userId);
  await getDb().execute({ sql: "DELETE FROM studio_scenes WHERE project_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM studio_projects WHERE id = ? AND user_id = ?", args: [id, userId] });
}

// ---------- المشاهد ----------
async function listScenes(projectId: string): Promise<StudioScene[]> {
  const rs = await getDb().execute({
    sql: "SELECT * FROM studio_scenes WHERE project_id = ? ORDER BY scene_no ASC, created_at ASC",
    args: [projectId],
  });
  return rs.rows.map((r) => rowToScene(r as unknown as Record<string, unknown>));
}

// متابعة المشاهد قيد التوليد من المزود وتحديث حالتها وروابطها
// سياسة الاسترداد: أي مشهد فشل بعد ما اتحاسب (charge) بيرجع له رصيده تلقائيًا هنا
async function refreshProjectScenes(projectId: string): Promise<StudioScene[]> {
  // 🧹 كاسحة عالمية أولًا: أي مهمة processing تجاوزت 30 دقيقة → failed حتى
  // لو لم يفتحها أحد أبدًا (كانت المهام بلا زائر تعلق في «قيد التوليد» للأبد)
  await expireAllStaleTasks(30).catch(() => undefined);
  const scenes = await listScenes(projectId);
  const generating = scenes.filter((s) => s.status === "generating");
  // مالك المشروع — للاسترداد التلقائي عند فشل مشهد مدفوع
  const ownerRs = await getDb().execute({ sql: "SELECT user_id FROM studio_projects WHERE id = ?", args: [projectId] }).catch(() => null);
  const ownerId = ((ownerRs?.rows?.[0] as unknown as Record<string, unknown> | undefined)?.user_id as string) || null;

  // 🩹 مشاهد يتيمة: generating بلا task_id (انقطعت دالة التوليد قبل حفظ المهمة
  // بسبب حد Vercel الزمني) — بعد 10 دقائق → failed + استرداد، لا تعلق للأبد
  for (const scene of generating) {
    if (scene.task_id) continue;
    const ageMin = (Date.now() - Date.parse(String(scene.updated_at || "").replace(" ", "T") + "Z")) / 60000;
    if (Number.isFinite(ageMin) && ageMin >= 10) {
      const msg = "انقطع التوليد قبل بدئه (انقطاع مؤقت في الخادم) — يُرد الرصيد تلقائيًا، أعد المحاولة";
      await getDb().execute({
        sql: "UPDATE studio_scenes SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ? AND status = 'generating'",
        args: [msg, scene.id],
      });
      scene.status = "failed";
      scene.error_message = msg;
      if (ownerId) await refundSceneCredit(ownerId, scene.id).catch(() => undefined);
    }
  }

  for (const scene of generating.filter((s) => s.task_id)) {
    try {
      const task = await refreshTask(String(scene.task_id));
      if (task.status === "completed" && task.result_urls.length) {
        await getDb().execute({
          sql: "UPDATE studio_scenes SET status = 'completed', video_url = ?, error_message = NULL, updated_at = datetime('now') WHERE id = ?",
          args: [task.result_urls[0], scene.id],
        });
        scene.status = "completed";
        scene.video_url = task.result_urls[0];
        scene.error_message = null;
        // 💰 خصم نهائي لو اكتمل متأخرًا بعد رد الحجز (اكتمل ولم يُدفع ثمنه بعد)
        if (ownerId) await chargeSceneIfUnpaid(ownerId, scene.id).catch(() => undefined);
      } else if (task.status === "failed") {
        await getDb().execute({
          sql: "UPDATE studio_scenes SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
          args: [String(task.error_message || "فشل التوليد لدى المزود").slice(0, 500), scene.id],
        });
        scene.status = "failed";
        scene.error_message = String(task.error_message || "فشل التوليد لدى المزود");
        // 💸 استرداد تلقائي: المشهد اتحاسب وكل فشل → رد الكريدت (السجل الفريد يمنع الرد المزدوج)
        if (ownerId) await refundSceneCredit(ownerId, scene.id).catch(() => undefined);
      }
    } catch (err) {
      // 🩹 المهمة نفسها غير موجودة في القاعدة (حُذفت أو تالفة) → فشل نهائي + استرداد
      if (err instanceof RequestError && /المهمة غير موجودة/.test(err.message)) {
        const msg = "تالفت مهمة التوليد في القاعدة — يُرد الرصيد تلقائيًا، أعد المحاولة";
        await getDb().execute({
          sql: "UPDATE studio_scenes SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ? AND status = 'generating'",
          args: [msg, scene.id],
        });
        scene.status = "failed";
        scene.error_message = msg;
        if (ownerId) await refundSceneCredit(ownerId, scene.id).catch(() => undefined);
        continue;
      }
      // تعذر الاستعلام هذه المرة — الحالة تبقى قيد التوليد وتتحدث في الاستعلام التالي
    }
  }
  // الحالة العامة للمشروع: أول توليد يحوّله من مسودة إلى قيد الإنتاج
  const after = generating.length ? scenes : await listScenes(projectId);
  if ((after.some((s) => s.status === "generating") || after.some((s) => s.status === "completed"))) {
    await getDb().execute({
      sql: "UPDATE studio_projects SET status = 'producing', updated_at = datetime('now') WHERE id = ? AND status = 'draft'",
      args: [projectId],
    });
  }
  return after;
}

// 🧹 لِمّ عالمي لكل المشاريع (يُستدعى من cron /api/cron/sweep): كل مشهد generating
// بمهمة failed أو مهمة محذوفة أو يتيم بلا مهمة أقدم من 10 دقائق → failed + استرداد
// يضمن عدم بقاء أي مشهد «قيد التوليد» أو رصيد محجوز للأبد حتى بلا أي زائر
export async function healAllStuckScenes(): Promise<{ failed: number; refunded: number }> {
  await expireAllStaleTasks(30).catch(() => undefined);
  const rows = await getDb().execute(
    `SELECT s.id, s.task_id, p.user_id, t.status AS tstatus, t.error_message AS terr
     FROM studio_scenes s
     JOIN studio_projects p ON p.id = s.project_id
     LEFT JOIN tasks t ON t.id = s.task_id
     WHERE s.status = 'generating'`
  );
  let failed = 0;
  let refunded = 0;
  for (const r of rows.rows) {
    const sid = String(r.id);
    const uid = String(r.user_id || "");
    const tstatus = (r.tstatus as string) || null;
    const hasTaskId = Boolean(r.task_id);
    // يتيم بلا مهمة → فقط بعد 10 دقائق (قد تكون المهمة لسه في طريق حفظ معرّفها)
    let orphanStale = false;
    if (!hasTaskId) {
      const chk = await getDb().execute({
        sql: "SELECT 1 FROM studio_scenes WHERE id = ? AND updated_at < datetime('now', '-10 minutes')",
        args: [sid],
      }).catch(() => ({ rows: [] }));
      orphanStale = chk.rows.length > 0;
    }
    const broken = tstatus === "failed" || orphanStale || (hasTaskId && tstatus === null);
    if (!broken) continue;
    const msg = tstatus === "failed"
      ? String(r.terr || "انتهت المدة القصوى للمعالجة دون اكتمال").slice(0, 500)
      : !hasTaskId
        ? "انقطع التوليد قبل بدئه (انقطاع مؤقت في الخادم) — يُرد الرصيد تلقائيًا، أعد المحاولة"
        : "تالفت مهمة التوليد في القاعدة — يُرد الرصيد تلقائيًا، أعد المحاولة";
    await getDb().execute({
      sql: "UPDATE studio_scenes SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ? AND status = 'generating'",
      args: [msg, sid],
    });
    failed += 1;
    if (uid) {
      // السجل الفريد في ledger يمنع الرد المزدوج — عدّاد تقديري فقط
      await refundSceneCredit(uid, sid).catch(() => undefined);
      refunded += 1;
    }
  }
  return { failed, refunded };
}

// 🧹 تبريد الكاسحة العالمية: تنفيذ مرة كل 60 ثانية كحد أقصى لكل نسخة خادم —
// تُستدعى من المسارات عالية التواتر (me/قائمة المشاريع) كي تلتئم المشاهد العالقة
// حتى على خطط Vercel التي تقيّد cron بليوم واحد
let _lastSweepAt = 0;
export async function maybeSweepGlobal(): Promise<void> {
  const now = Date.now();
  if (now - _lastSweepAt < 60_000) return;
  _lastSweepAt = now;
  try {
    await healAllStuckScenes();
  } catch { /* فشل نادر — المحاولة القادمة بعد 60 ثانية */ }
}

export async function replaceScenes(projectId: string, userId: string, prompts: string[]): Promise<StudioScene[]> {
  await ensureStudioSchema();
  await ownedProject(projectId, userId);
  const clean = prompts.map((p) => String(p).trim().slice(0, 1200)).filter(Boolean).slice(0, 12);
  if (!clean.length) throw new StudioError("لا توجد مشاهد صالحة من التقسيم");
  // استبدال المشاهد غير المكتملة فقط — المشاهد المكتملة (فيديوهات مدفوعة) لا تُمس
  await getDb().execute({
    sql: "DELETE FROM studio_scenes WHERE project_id = ? AND status != 'completed'",
    args: [projectId],
  });
  const existing = await listScenes(projectId);
  let no = existing.length;
  for (const prompt of clean) {
    no += 1;
    await getDb().execute({
      sql: `INSERT INTO studio_scenes (id, project_id, scene_no, prompt, status) VALUES (?, ?, ?, ?, 'pending')`,
      args: [randomUUID(), projectId, no, prompt],
    });
  }
  await touchProject(projectId);
  return listScenes(projectId);
}

export async function addScene(projectId: string, userId: string, prompt: string): Promise<StudioScene[]> {
  await ensureStudioSchema();
  await ownedProject(projectId, userId);
  const clean = String(prompt).trim().slice(0, 1200);
  if (!clean) throw new StudioError("اكتب وصف المشهد أولًا");
  const existing = await listScenes(projectId);
  if (existing.length >= 12) throw new StudioError("أقصى عدد مشاهد للمشروع 12 مشهد");
  const no = existing.length ? Math.max(...existing.map((s) => s.scene_no)) + 1 : 1;
  await getDb().execute({
    sql: `INSERT INTO studio_scenes (id, project_id, scene_no, prompt, status) VALUES (?, ?, ?, ?, 'pending')`,
    args: [randomUUID(), projectId, no, clean],
  });
  await touchProject(projectId);
  return listScenes(projectId);
}

export async function updateScene(sceneId: string, userId: string, patch: { prompt?: string; scene_no?: number }): Promise<StudioScene[]> {
  await ensureStudioSchema();
  const rs = await getDb().execute({
    sql: `SELECT s.* FROM studio_scenes s JOIN studio_projects p ON p.id = s.project_id
          WHERE s.id = ? AND p.user_id = ?`,
    args: [sceneId, userId],
  });
  const row = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) throw new StudioError("المشهد غير موجود أو ليس لديك صلاحية عليه", 404);
  if (String(row.status) === "completed") throw new StudioError("المشهد مكتمل بالفعل — مش هيتعدل (الفيديو جاهز)");
  if (String(row.status) === "generating") throw new StudioError("المشهد قيد التوليد حاليًا — استنى أو أعد المحاولة بعد اكتماله");
  const sets: string[] = [];
  const args: string[] = [];
  if (patch.prompt !== undefined) {
    const clean = String(patch.prompt).trim().slice(0, 1200);
    if (!clean) throw new StudioError("وصف المشهد مطلوب");
    sets.push("prompt = ?"); args.push(clean);
  }
  if (patch.scene_no !== undefined) {
    sets.push("scene_no = ?"); args.push(String(Math.max(1, Math.min(12, Number(patch.scene_no) || 1))));
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    await getDb().execute({ sql: `UPDATE studio_scenes SET ${sets.join(", ")} WHERE id = ?`, args: [...args, sceneId] });
    await touchProject(String(row.project_id));
  }
  return listScenes(String(row.project_id));
}

export async function deleteScene(sceneId: string, userId: string): Promise<StudioScene[]> {
  await ensureStudioSchema();
  const rs = await getDb().execute({
    sql: `SELECT s.* FROM studio_scenes s JOIN studio_projects p ON p.id = s.project_id
          WHERE s.id = ? AND p.user_id = ?`,
    args: [sceneId, userId],
  });
  const row = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) throw new StudioError("المشهد غير موجود أو ليس لديك صلاحية عليه", 404);
  if (String(row.status) === "completed") {
    // المشهد المكتمل (فيديو مدفوع) ما يتشالش من غير تأكيد — نسمح بحذفه لكن نحفظ قرار المستخدم في الواجهة
    await getDb().execute({ sql: "DELETE FROM studio_scenes WHERE id = ?", args: [sceneId] });
  } else {
    await getDb().execute({ sql: "DELETE FROM studio_scenes WHERE id = ?", args: [sceneId] });
  }
  await touchProject(String(row.project_id));
  return listScenes(String(row.project_id));
}

// ---------- توليد مشهد (15 كريدت موقع) ----------
export async function generateScene(
  sceneId: string,
  userId: string
): Promise<{ scene: StudioScene; taskId: string; deducted: number; balance: number | null }> {
  await ensureStudioSchema();
  const rs = await getDb().execute({
    sql: `SELECT s.*, p.aspect_ratio, p.characters, p.title AS project_title
          FROM studio_scenes s JOIN studio_projects p ON p.id = s.project_id
          WHERE s.id = ? AND p.user_id = ?`,
    args: [sceneId, userId],
  });
  const row = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) throw new StudioError("المشهد غير موجود أو ليس لديك صلاحية عليه", 404);
  const scene = rowToScene(row);
  if (scene.status === "generating") {
    // 🩹 استثناء الانتظار غير المدفوع: المشهد بانتظار وقود المزود ورُد حجزه فورًا
    // (لا حجز ولا خصم في السجل) — نسمح بإعادة المحاولة فورًا ونلغي المهمة القديمة
    // كي لا تتزامن محاولتان؛ أما المشهد المدفوع الجاري فيُحجب كالعادة
    const paid = await getDb().execute({
      sql: `SELECT 1 FROM ledger WHERE ref_id = ? AND reason IN ('reserve','charge')`,
      args: [scene.id],
    });
    if (paid.rows.length) throw new StudioError("المشهد قيد التوليد بالفعل — استنى اكتماله");
    if (scene.task_id) {
      await getDb().execute({
        sql: `UPDATE tasks SET status = 'failed', error_message = 'أُلغيت — بدأ الزبون محاولة جديدة', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'processing'`,
        args: [scene.task_id],
      }).catch(() => undefined);
    }
  }
  if (scene.status === "completed") throw new StudioError("المشهد مكتمل بالفعل — تقدر تعاينه أو تعيد توليده بعد حذفه");
  if (!scene.prompt.trim()) throw new StudioError("اكتب وصف المشهد قبل التوليد");

  // فحص الرصيد قبل أي شيء — المشهد = 15 كريدت (يُخصم فعليًا فقط عبر reserveSceneCredit الذرية)
  const balanceRs = await getDb().execute({ sql: "SELECT COALESCE(credits, 0) AS c FROM users WHERE id = ?", args: [userId] });
  const currentBalance = Number((balanceRs.rows[0] as unknown as Record<string, unknown> | undefined)?.c ?? 0);
  if (currentBalance < SCENE_SITE_COST) {
    throw new StudioError(`رصيدك ${currentBalance} كريدت — المشهد الواحد بـ ${SCENE_SITE_COST} كريدت. اشحن رصيدك من صفحة الشحن 💳`, 402);
  }
  if (await isUserSuspended(userId).catch(() => false)) {
    throw new StudioError("الحساب موقوف مؤقتًا — تواصل معنا من زر الواتساب", 403);
  }

  // بناء البرومبت النهائي: وصف المشهد + ثبات الشخصيات (نفس قواعد الحلقات)
  let charactersBlock = "";
  try {
    const chars = JSON.parse(String(row.characters || "[]")) as StudioCharacter[];
    const lines = (chars || [])
      .filter((c) => c.name && c.description)
      .map((c) => `- ${c.name}: ${c.description}`)
      .slice(0, 8);
    if (lines.length) charactersBlock = `\n\nشخصيات ثابتة لازم تظهر بنفس الشكل:\n${lines.join("\n")}`;
  } catch { /* بدون شخصيات */ }
  const prompt = `${scene.prompt.trim()}${charactersBlock}`;

  // توليد المشهد — نفس إعدادات الحلقات بالضبط (فيديو 8 ثوانٍ 480p بصوت)
  // 💰 مفاتيح المنصة السرية فقط (حساب المنصة الرئيسي) — والفوترة من المحفظة الواحدة
  // عبر reserveSceneCredit: حجز ذري قبل التوليد واسترداد تلقائي عند أي فشل
  const aspect = String(row.aspect_ratio || "16:9") === "9:16" ? "9:16" : "16:9";
  const videoDef = MODELS.find((m) => m.type === "video");
  const keyPick = await pickGenerationKey(videoDef?.providers || ["kie", "cometapi", "apiframe"]);
  const billingUser: string = userId; // 💰 الفوترة دائمًا من محفظة الزبون الواحدة — لا استثناءات
  if (!keyPick.platform) {
    // لا مفاتيح منصة → فشل واضح بدون أي خصم (رسالة للزبون بلا مصطلحات تقنية)
    const note = "⏸️ التوليد متوقف مؤقتًا للصيانة المقررة — رصيدك محفوظ بالكامل ولم يُخصم. جرّب بعد شوية أو ابعتنا واتساب من زر «اسألنا».";
    await getDb().execute({
      sql: "UPDATE studio_scenes SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
      args: [note, scene.id],
    });
    scene.status = "failed";
    scene.error_message = note;
    return { scene, taskId: "", deducted: 0, balance: currentBalance };
  }
  if (billingUser) {
    const reserve = await reserveSceneCredit(userId, scene.id);
    if (!reserve.ok) throw new StudioError(reserve.error || "فشل حجز الرصيد", 402);
  }
  await getDb().execute({
    sql: "UPDATE studio_scenes SET status = 'generating', error_message = NULL, updated_at = datetime('now') WHERE id = ?",
    args: [scene.id],
  });
  try {
    const task = await runGeneration({
      type: "video",
      model: "grok-imagine-video-1-5-preview",
      input: {
        // 🔊 الصوت عربي إلزامي في أول البرومبت + توقيع فريد لكل محاولة — لا لغة غريبة ولا تكرار
        prompt: arabicVideoPrompt(prompt, `مشهد استوديو ${scene.id}`),
        aspect_ratio: aspect,
        resolution: "480p",
        enable_audio: true,
        duration: 8,
      },
      waitSeconds: 10,
      keyId: keyPick.keyId,
      keyRole: keyPick.keyRole,
    });
    await getDb().execute({
      sql: "UPDATE studio_scenes SET task_id = ?, updated_at = datetime('now') WHERE id = ?",
      args: [task.id, scene.id],
    });
    // الفوترة عبر ledger: الحجز تحوّل charge نهائيًا فقط لما المزود يقبل المهمة فعليًا
    // (فيه مهمة مزود أو مكتملة) — الفشل الفوري يُرد فورًا، والفشل المتأخر يُرد في refreshProjectScenes
    const accepted = Boolean(task.provider_task_id) || task.status === "completed";
    let deducted = 0;
    let balance: number | null = null;
    if (billingUser) {
      if (accepted) {
        await getDb().execute({
          sql: `UPDATE ledger SET reason = 'charge' WHERE ref_id = ? AND reason = 'reserve'`,
          args: [scene.id],
        }).catch(() => undefined);
        deducted = SCENE_SITE_COST;
      } else {
        await refundSceneCredit(userId, scene.id).catch(() => undefined);
      }
      const u = await getDb().execute({ sql: "SELECT COALESCE(credits,0) AS c FROM users WHERE id = ?", args: [userId] }).catch(() => null);
      balance = u ? Number(u.rows[0]?.c) || 0 : currentBalance;
    }
    scene.task_id = task.id;
    scene.status = "generating";
    await touchProject(String(row.project_id));
    return { scene, taskId: task.id, deducted, balance };
  } catch (e) {
    const msg = e instanceof RequestError ? e.message : (e instanceof Error ? e.message : "خطأ غير معروف");
    // سياسة الاسترداد: أي فشل بدء توليد → رد الحجز فورًا (السجل الفريد يمنع الرد المزدوج)
    if (billingUser) await refundSceneCredit(userId, scene.id).catch(() => undefined);
    const msgStr = String(msg).slice(0, 500);
    const friendly = /لا يوجد مفتاح|مفتاح برصيد/.test(msgStr)
      ? "⏸️ التوليد متوقف مؤقتًا للصيانة المقررة — رصيدك محفوظ بالكامل واترد. جرّب بعد شوية أو ابعتنا واتساب من زر «اسألنا»."
      : msgStr;
    await getDb().execute({
      sql: "UPDATE studio_scenes SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
      args: [friendly, scene.id],
    });
    scene.status = "failed";
    scene.error_message = friendly;
    throw new StudioError(`فشل بدء التوليد: ${msg}`.slice(0, 300), 502);
  }
}

// ---------- دمج مشاهد المشروع ----------
export async function mergeProject(
  id: string,
  userId: string
): Promise<{ merged_url: string | null; status: string; taskId: string; parts: number }> {
  await ensureStudioSchema();
  await ownedProject(id, userId);
  const scenes = await refreshProjectScenes(id);
  const completed = scenes.filter((s) => s.status === "completed" && s.video_url);
  if (completed.length < 2) throw new StudioError("الدمج يحتاج مشهدَين مكتملَين على الأقل — ولّد باقي المشاهد أولًا");
  if (completed.length > 10) throw new StudioError("أقصى عدد مقاطع للدمج 10 — ولّد 10 مشاهد أو أقل لكل فيلم");
  // الدمج عبر runMerge نفسه المستخدم في الحلقات — بيمر بمعرّفات المهام المكتملة
  const mergeTask = await runMerge({
    taskIds: completed.map((s) => String(s.task_id)),
    waitSeconds: 8,
  });
  await getDb().execute({
    sql: "UPDATE studio_projects SET status = 'producing', updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return { merged_url: mergeTask.result_urls[0] || null, status: mergeTask.status, taskId: mergeTask.id, parts: completed.length };
}

// جلب رابط الفيلم المدمج النهائي (يُستدعى أثناء المعاينة بعد الدمج)
export async function getMergedUrl(id: string, userId: string): Promise<string | null> {
  await ensureStudioSchema();
  const project = await ownedProject(id, userId);
  if (project.merged_url) return project.merged_url;
  return null;
}

// حفظ رابط الدمج بعد اكتمال مهمة الدمج (تُستدعى من الواجهة بعد متابعة مهمة الدمج)
export async function saveMergedUrl(id: string, userId: string, url: string, mergeTaskId: string): Promise<StudioProject> {
  await ensureStudioSchema();
  await ownedProject(id, userId);
  const clean = String(url).trim();
  if (!/^https?:\/\//i.test(clean)) throw new StudioError("رابط الفيلم غير صالح");
  await getDb().execute({
    sql: "UPDATE studio_projects SET merged_url = ?, status = 'merged', updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    args: [clean.slice(0, 2000), id, userId],
  });
  void mergeTaskId;
  return ownedProject(id, userId);
}

// تقسيم القصة لمشاهد بالذكاء الاصطناعي — نفس splitStoryIntoScenes
// النوع المختار (الأحد عشر قسمًا) يُحقن كإرشاد أسلوب قبل القصة — نفس المحرك، أسلوب مضبوط
export async function splitStory(
  id: string,
  userId: string,
  count: number,
  category?: string
): Promise<{ scenes: StudioScene[]; split_count: number; category: string }> {
  await ensureStudioSchema();
  const project = await ownedProject(id, userId);
  if (!project.story.trim()) throw new StudioError("اكتب القصة أولًا قبل التقسيم");
  const effCategory = CONTENT_CATEGORIES.some((c) => c.key === category) ? String(category) : (project.category || "");
  if (effCategory && effCategory !== project.category) {
    await getDb().execute({
      sql: `UPDATE studio_projects SET category = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [effCategory, id],
    });
    project.category = effCategory;
  }
  const n = Math.max(2, Math.min(12, Math.floor(Number(count) || 4)));
  const guide = categoryGuide(effCategory);
  const storyForSplit = guide ? `${guide}\n\nالقصة:\n${project.story}` : project.story;
  const prompts = await splitStoryIntoScenes(storyForSplit, n);
  // حقن وصف الشخصيات في أول سطر لكل مشهد عشان الثبات البصري (زي قواعد الحلقات)
  const charsLine = project.characters
    .filter((c) => c.name && c.description)
    .map((c) => `${c.name}: ${c.description}`)
    .slice(0, 8)
    .join(" | ");
  const enriched = charsLine ? prompts.map((p) => `${p}\n(شخصيات ثابتة: ${charsLine})`) : prompts;
  const scenes = await replaceScenes(id, userId, enriched);
  await getDb().execute({
    sql: "UPDATE studio_projects SET status = 'producing', updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return { scenes, split_count: prompts.length, category: effCategory };
}
