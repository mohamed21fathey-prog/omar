// ============================================================
// منسّق التوليد والدمج — سلوك التبديل «لا توقف أبدًا»:
// 1) المرشحون بالترتيب الصارم (ترتيب الإضافة)، أول نجاح يربط المهمة.
// 2) فشل منتصف المهمة بسبب مفتاح/رصيد → إعادة إنشاء نفس المهمة بنفس
//    task_id على المفتاح التالي تلقائيًا — العميل لا يرى شيئًا.
// 3) فشل الإنشاء على كل المفاتيح → المهمة تبقى processing (وليست
//    failed) وتُعاد المحاولة مع كل get_task بعد تهدئة ~45 ثانية.
// 4) أخطاء خدمة الدمج المعلنة (HTTP 4xx/5xx بجسم error) = فشل حتمي
//    فوري؛ أخطاء شبكتنا نحن = مؤقتة وتستمر بالاستعلام حتى انتهاء النافذة.
// ============================================================
import { randomUUID } from "crypto";
import { after } from "next/server";
import { normalizeModel, type ModelDef, type ProviderId } from "./models";
import { PROVIDERS } from "./providers";
import {
  classifyProviderError,
  getKeyPool,
  isKeyOrBalanceRelated,
  ProviderError,
  recordAttemptOnKey,
} from "./keys";
import {
  getTask,
  getKey,
  insertTask,
  updateTask,
  claimTaskLock,
  releaseTaskLock,
  expireStaleTask,
  type ApiKeyRecord,
  type AttemptRecord,
  type TaskRecord,
} from "./turso";
import { mergerClient, MergerError } from "./merger";

const POLL_INTERVAL_MS = 3000; // استعلام كل 3 ثوانٍ أثناء نافذة الانتظار
const RECREATE_COOLDOWN_MS = 45000; // تهدئة إعادة المحاولة عند انتظار مفتاح صالح
const MAX_WAIT_SECONDS = 45; // سقف نافذة الانتظار داخل نداء واحد (حد الدالة ≈ 60ث + هامش آمن)
const TASK_MAX_AGE_MINUTES = 30; // عمر أقصى لأي مهمة processing → failed (لا مهام بلا نهاية)
// 💰 نموذج الفوترة الموحد: الوقود مسؤولية المنصة خلف الكواليس — الزبون يخصم من رصيده الداخلي فقط
const WAITING_NOTE = "⏳ وقود التوليد لدى مزوّدي المنصة غير متاح حاليًا — بجاري إعادة المحاولة تلقائيًا. لو لم يكتمل خلال 30 دقيقة يفشل المشهد ويُرد رصيدك تلقائيًا — تواصل معنا واتساب لو تكررت";

// خطأ منطقي واضح (معطيات/لا مفاتيح/دمج غير صالح) — يُعرض للعميل عربيًا مباشرة
export class RequestError extends Error {
  kind: "params" | "no_keys" | "merge_invalid" | "merge_limit";
  constructor(kind: RequestError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

export type ProgressCb = (progress: number, message: string) => void;

interface CreateOutcome {
  ok: boolean;
  provider?: ProviderId;
  providerTaskId?: string;
  key?: ApiKeyRecord;
  keyIndex?: number;
  syncUrls?: string[];
  blocked?: "params"; // خطأ معطيات — توقف فورًا
  waiting?: boolean; // فشل على كل المفاتيح → انتظار مفتاح صالح
  lastAttemptAt: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function attempt(
  provider: string,
  key: ApiKeyRecord | null,
  ok: boolean,
  errorClass?: string,
  error?: string
): AttemptRecord {
  return {
    provider,
    keyId: key?.id || "-",
    keyLabel: key?.label || key?.id?.slice(0, 8) || "-",
    ok,
    errorClass,
    error: error ? String(error).slice(0, 300) : undefined,
    at: nowIso(),
  };
}

// المحاولة على مفاتيح المرشحين بالترتيب حتى أول نجاح
async function tryCreateOnKeys(
  taskId: string,
  def: ModelDef,
  input: Record<string, unknown>,
  startFrom: number = 0,
  keyRole?: string,
  keyId?: string
): Promise<CreateOutcome> {
  const pool = await getKeyPool(def.providers, keyRole, keyId);
  let lastAttemptAt = Date.now();
  let sawKeys = false;

  for (let i = startFrom; i < pool.length; i++) {
    const key = pool[i];
    sawKeys = true;
    const provider = key.provider as ProviderId;
    const adapter = PROVIDERS[provider];
    if (!adapter) continue;
    const modelForProvider = def.providerModel[provider] || def.canonical;
    lastAttemptAt = Date.now();

    try {
      // الصور لدى مزود يدعم المتزامن → نتيجة فورية
      if (def.type === "image" && adapter.createImageSync) {
        const { urls } = await adapter.createImageSync(key, { ...input, __model: modelForProvider });
        await recordAttemptOnKey(key, { ok: true });
        await updateTask(taskId, { provider, key_id: key.id, status: "completed", progress: 100, result_urls: urls, error_message: null }, attempt(provider, key, true));
        return { ok: true, provider, key, keyIndex: i, syncUrls: urls, lastAttemptAt };
      }
      const { providerTaskId } = await adapter.createTask(key, modelForProvider, input);
      await recordAttemptOnKey(key, { ok: true });
      await updateTask(taskId, { provider, provider_task_id: providerTaskId, key_id: key.id, status: "processing", progress: 3, error_message: null }, attempt(provider, key, true));
      return { ok: true, provider, providerTaskId, key, keyIndex: i, lastAttemptAt };
    } catch (err) {
      const cls = classifyProviderError(err);
      const msg = err instanceof Error ? err.message : String(err);
      await recordAttemptOnKey(key, { ok: false, errorClass: cls, error: msg });
      await updateTask(taskId, {}, attempt(provider, key, false, cls, msg));
      if (cls === "params") {
        // تبديل المفاتيح لن يحل خطأ معطيات — توقف فورًا
        await updateTask(taskId, { status: "failed", error_message: `خطأ في المعطيات: ${msg}` });
        throw new RequestError("params", `❌ خطأ في معطيات الطلب: ${msg}`);
      }
      // disabled / exhausted / provider / temporary → انتقل للمفتاح التالي
      continue;
    }
  }

  if (!sawKeys) {
    // لا مفاتيح (أو أُضيفت منذ فحص الحوض؟) — انتظار
    return { ok: false, waiting: true, lastAttemptAt };
  }
  return { ok: false, waiting: true, lastAttemptAt };
}

// حلقة الاستعلام حتى نهاية نافذة الانتظار مع إعادة الإنشاء عند فشل مفتاح/رصيد
async function pollUntilDone(
  taskId: string,
  def: ModelDef,
  input: Record<string, unknown>,
  outcome: CreateOutcome,
  waitSeconds: number,
  onProgress?: ProgressCb,
  label = "قيد التوليد",
  keyRole?: string,
  keyId?: string
): Promise<TaskRecord> {
  const deadline = Date.now() + waitSeconds * 1000;
  let currentIndex = outcome.keyIndex ?? -1;
  let provider = outcome.provider!;
  let providerTaskId = outcome.providerTaskId!;
  let key = outcome.key!;
  let lastPercent = 3;

  while (Date.now() < deadline) {
    // فحص الوقت المتبقي قبل كل استعلام: لا نبدأ دورة لا نستطيع إكمالها داخل حدود الدالة
    if (Date.now() + POLL_INTERVAL_MS + 2000 > deadline) break;
    await sleep(POLL_INTERVAL_MS);
    const adapter = PROVIDERS[provider];
    try {
      const st = await adapter.checkTask(key, providerTaskId);
      if (st.status === "completed" && st.urls?.length) {
        await updateTask(taskId, { status: "completed", progress: 100, result_urls: st.urls, error_message: null });
        onProgress?.(100, "اكتمل التوليد");
        return (await getTask(taskId))!;
      }
      if (st.status === "failed") {
        const msg = st.error || "فشل التوليد لدى المزود";
        // فشل بسبب مفتاح/رصيد أو موديل غير مدعوم → إعادة إنشاء بنفس task_id على المفتاح التالي
        if (isKeyOrBalanceRelated(msg) || /model not found|unsupported model|model_not_found/i.test(msg)) {
          const recreated = await recreate(taskId, def, input, currentIndex + 1, onProgress, label, keyRole, keyId);
          if (recreated === "params") throw new RequestError("params", "❌ خطأ في معطيات الطلب");
          if (recreated) return recreated; // مكتملة (متزامنة) أو أُعيد تعيين المتغيرات
          // لا مفاتيح متبقية → استمر بالاستعلام حتى نهاية النافذة ثم معالجة
          provider = "" as ProviderId; // بلا مهمة نشطة حاليًا
          break;
        }
        // فشل حقيقي (انتهاك سياسة/معطيات) → failed نهائي
        await updateTask(taskId, { status: "failed", error_message: msg });
        throw new RequestError("params", `❌ فشل التوليد: ${msg}`);
      }
      // processing → حدّث التقدم (المزود قد لا يعطي نسبة → نزيدها تدريجيًا)
      lastPercent = Math.min(95, Math.max(lastPercent + 2, st.progress ?? 0));
      await updateTask(taskId, { progress: lastPercent });
      onProgress?.(lastPercent, `${label}… ${lastPercent}%`);
    } catch (err) {
      if (err instanceof RequestError) throw err;
      // خطأ استعلام (شبكة/مفتاح انتهى أثناء الفحص) → صنّف
      const cls = classifyProviderError(err);
      if (cls === "disabled" || cls === "exhausted") {
        const msg = err instanceof Error ? err.message : String(err);
        await recordAttemptOnKey(key, { ok: false, errorClass: cls, error: msg });
        await updateTask(taskId, {}, attempt(provider, key, false, cls, msg));
        const recreated = await recreate(taskId, def, input, currentIndex + 1, onProgress, label, keyRole, keyId);
        if (recreated === "params") throw new RequestError("params", "❌ خطأ في معطيات الطلب");
        if (recreated) return recreated;
        break; // لا مفاتيح متبقية
      }
      // temporary → استمر بالاستعلام
    }
  }

  // انتهت النافذة (أو انتظرنا مفتاحًا) → أعد المهمة بحالتها الحالية (processing)
  const t = (await getTask(taskId))!;
  if (t.status === "processing" && !t.provider_task_id) {
    await updateTask(taskId, { error_message: WAITING_NOTE });
  }
  return t;
}

// إعادة إنشاء نفس المهمة بنفس task_id على المفتاح التالي (ثم التالي…)
async function recreate(
  taskId: string,
  def: ModelDef,
  input: Record<string, unknown>,
  fromIndex: number,
  onProgress?: ProgressCb,
  label = "قيد التوليد",
  keyRole?: string,
  keyId?: string
): Promise<TaskRecord | null | "params"> {
  // صفرّ بيانات المهمة الجارية قبل إعادة الإنشاء
  await updateTask(taskId, { provider: null, provider_task_id: null, key_id: null, status: "processing", progress: 2, error_message: null });
  const outcome = await tryCreateOnKeys(taskId, def, input, fromIndex, keyRole, keyId);
  if (outcome.blocked === "params") return "params";
  if (!outcome.ok) {
    await updateTask(taskId, { error_message: WAITING_NOTE });
    return null; // لا مفاتيح متبقية → انتظار
  }
  if (outcome.syncUrls) return (await getTask(taskId))!;
  return pollUntilDone(taskId, def, input, outcome, 0, onProgress, label);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------- التوليد (صورة/فيديو) ----------------
export async function runGeneration(
  opts: { type: "image" | "video"; model: string; input: Record<string, unknown>; waitSeconds: number; keyRole?: string; keyId?: string },
  onProgress?: ProgressCb
): Promise<TaskRecord> {
  const def = normalizeModel(opts.model);
  if (!def) {
    throw new RequestError("params", `❌ موديل غير معروف: ${opts.model}. المتاح: ${"gpt-image-2-6/flare-text-to-image"} (صور) و ${"grok-imagine-video-1-5-preview"} (فيديو)`);
  }
  if (!opts.input.prompt || !String(opts.input.prompt).trim()) {
    throw new RequestError("params", "❌ المعامل prompt إلزامي");
  }

  const pool = await getKeyPool(def.providers, opts.keyRole, opts.keyId);
  if (!pool.length) {
    throw new RequestError(
      "no_keys",
      opts.keyId
        ? "⚠️ مفتاح الزبون المحدد غير متاح (معطّل أو غير موجود) — فعّله من مدير المفاتيح أو اشحن رصيده أولًا"
        : `❌ لا توجد مفاتيح نشطة لخدمة ${def.canonical}. أضف مفتاحًا واحدًا على الأقل من واجهة الإدارة، ثم أعد المحاولة.`
    );
  }

  // سقف نافذة الانتظار الفعلي — القيم الأكبر تُقص (لا انتظار صامت أطول من حد الدالة)
  const waitSeconds = Math.max(0, Math.min(opts.waitSeconds || 0, MAX_WAIT_SECONDS));

  const taskId = randomUUID();
  // سجّل المهمة في القاعدة قبل أي نداء خارجي — تبقى قابلة للتتبع حتى مع الانقطاع
  await insertTask({
    id: taskId,
    model: def.canonical,
    type: def.type,
    prompt: String(opts.input.prompt),
    params_json: JSON.stringify({ ...opts.input, type: def.type, waitSeconds, lastCreateAt: nowIso() }),
    status: "processing",
  });

  const outcome = await tryCreateOnKeys(taskId, def, opts.input, 0, opts.keyRole, opts.keyId);
  if (outcome.blocked === "params") throw new RequestError("params", "❌ خطأ في معطيات الطلب");
  if (!outcome.ok) {
    // فشل على كل المفاتيح → processing و«بانتظار توفر مفتاح صالح…»
    await updateTask(taskId, { error_message: WAITING_NOTE });
    return (await getTask(taskId))!;
  }
  if (outcome.syncUrls) return (await getTask(taskId))!; // صورة متزامنة اكتملت فورًا

  const label = def.type === "image" ? "قيد التوليد" : "قيد توليد الفيديو";
  onProgress?.(3, `${label}… بدأ التوليد`);
  return pollUntilDone(taskId, def, opts.input, outcome, waitSeconds, onProgress, label, opts.keyRole, opts.keyId);
}

// ---------------- الدمج ----------------
export async function runMerge(
  opts: { urls?: string[]; taskIds?: string[]; waitSeconds: number },
  onProgress?: ProgressCb
): Promise<TaskRecord> {
  // سقف نافذة الانتظار الفعلي (حد الدالة)
  const waitSeconds = Math.max(0, Math.min(opts.waitSeconds || 0, MAX_WAIT_SECONDS));
  // 1) حلل task_ids أولًا (بترتيبها) ثم روابط urls المباشرة بنفس ترتيبها
  const resolved: string[] = [];
  const failedDetails: string[] = [];
  for (const tid of opts.taskIds || []) {
    const t = await getTask(String(tid).trim());
    if (!t) failedDetails.push(`${tid}: المهمة غير موجودة في القاعدة`);
    else if (t.status !== "completed" || !t.result_urls.length)
      failedDetails.push(`${tid}: الحالة ${t.status} بلا روابط نتيجة`);
    else resolved.push(t.result_urls[0]);
  }
  const urls = [...resolved, ...(opts.urls || []).map((u) => String(u).trim()).filter(Boolean)];

  if (urls.length < 2) {
    let msg = "❌ الدمج يحتاج مقطعَين على الأقل. مرّر urls (روابط مباشرة) أو task_ids لمهام مكتملة.";
    if (failedDetails.length) msg += "\n\nتفاصيل المعرّفات غير الصالحة:\n" + failedDetails.map((d) => `- ${d}`).join("\n");
    throw new RequestError("merge_invalid", msg);
  }
  if (urls.length > 10) {
    throw new RequestError("merge_limit", "❌ أقصى عدد مقاطع للدمج هو 10 (خدمة الدمج تقبل 10 مقاطع كحد أقصى).");
  }
  const bad = urls.filter((u) => !/^https?:\/\//i.test(u));
  if (bad.length) {
    throw new RequestError("merge_invalid", `❌ هذه الروابط ليست روابط http/https مباشرة عامة:\n${bad.map((b) => `- ${b}`).join("\n")}`);
  }

  // 2) سجّل مهمة الدمج في القاعدة أولًا
  const taskId = randomUUID();
  await insertTask({
    id: taskId,
    model: "video-merger",
    type: "merge",
    prompt: `دمج ${urls.length} مقاطع`,
    params_json: JSON.stringify({ urls, taskIds: opts.taskIds || [], waitSeconds, lastCreateAt: nowIso() }),
    status: "processing",
  });

  // 3) أنشئ المهمة في خدمة الدمج ثم نفّذ process خلفيًا وبمرة واحدة فقط
  const { jobId } = await mergerClient.createJob(urls);
  await updateTask(taskId, { provider: "merger", provider_task_id: jobId, status: "processing", progress: 2 }, attempt("merger", null, true));
  fireProcessOnce(jobId);
  onProgress?.(2, `قيد الدمج… بدأ الدمج (${urls.length} مقاطع)`);

  // 4) نافذة انتظار مع بث التقدم — أي خطأ HTTP معلن = فشل نهائي فوري
  const deadline = Date.now() + waitSeconds * 1000;
  let lastPct = 2;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let job;
    try {
      job = await mergerClient.getJob(jobId);
    } catch (err) {
      if (err instanceof MergerError && err.status) {
        // خطأ معلن من الخدمة (4xx/5xx بجسم error) → فشل حتمي نهائي
        await updateTask(taskId, { status: "failed", error_message: err.message });
        throw new RequestError("merge_invalid", `❌ فشلت مهمة الدمج: ${err.message}`);
      }
      continue; // خطأ شبكتنا نحن → مؤقت، نستمر حتى انتهاء النافذة
    }
    if (job.status === "done") {
      const url = job.videoUrl || job.downloadUrl || mergerClient.signedVideoUrl(jobId);
      await updateTask(taskId, { status: "completed", progress: 100, result_urls: [url], error_message: null });
      onProgress?.(100, "اكتمل الدمج");
      return (await getTask(taskId))!;
    }
    if (job.status === "failed" || job.error) {
      // قد يرد الجسم فيه error بدون status → فشل فوري
      const msg = job.error || "فشلت خدمة الدمج";
      await updateTask(taskId, { status: "failed", error_message: msg });
      throw new RequestError("merge_invalid", `❌ فشلت مهمة الدمج: ${msg}`);
    }
    const pct = Math.max(lastPct, Math.min(95, Math.round(job.progress ?? 0)));
    lastPct = pct;
    await updateTask(taskId, { progress: pct });
    onProgress?.(pct, `قيد الدمج… ${pct}%`);
  }

  await updateTask(taskId, {});
  return (await getTask(taskId))!;
}

// أطلق process خلفيًا بعد إرسال الرد — after() (next/server) يبقي الدالة حية على
// Vercel بعد الاستجابة؛ الطلب غير المنتظر القديم قد يُجمَّد مع الدالة.
// كانت Set في الذاكرة ولا تعمل بين instances — التكرار آمن الآن لأن خدمة الدمج
// تحمي نفسها بقفل ذري (claimProcessing) فتعيد 202 للنداءات المتكررة.
function fireProcessOnce(jobId: string): void {
  try {
    after(() => mergerClient.processJob(jobId).catch(() => {}));
  } catch {
    // خارج سياق طلب (احتياط للبيئات القديمة) — أطلقه مباشرة
    void mergerClient.processJob(jobId).catch(() => {});
  }
}

// ---------------- تحديث حي من المزود/الخدمة (تُستخدم من get_task) ----------------
export async function refreshTask(taskId: string): Promise<TaskRecord> {
  const task = await getTask(taskId);
  if (!task) throw new RequestError("params", `❌ المهمة غير موجودة: ${taskId}`);
  if (task.status !== "processing") return task; // مكتملة/فاشلة كما هي

  // عمر أقصى: أي مهمة processing أقدم من 30 دقيقة → failed نهائيًا (لا مهام بلا نهاية)
  if (await expireStaleTask(taskId, TASK_MAX_AGE_MINUTES)) {
    return (await getTask(taskId))!;
  }

  if (task.type === "merge") return refreshMergeTask(task);

  // مهمة توليد: بلا provider_task_id → انتظار مفتاح، أعد المحاولة بعد التهدئة
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(task.params_json || "{}");
  } catch {
    params = {};
  }
  const lastCreateAt = Date.parse(String(params.lastCreateAt || task.updated_at)) || 0;

  if (!task.provider_task_id || !task.provider || task.provider === "merger") {
    if (Date.now() - lastCreateAt < RECREATE_COOLDOWN_MS) return task;
    // قفل ذري: نداءان متزامنان لـ get_task → واحد فقط ينشئ لدى المزود
    // (بدون القفل: ازدواج مهمة عند المزود وازدواج خصم الرصيد)
    const gotLock = await claimTaskLock(taskId, 90);
    if (!gotLock) return task; // نداء آخر ينشئ الآن — أعِد الحالة كما هي
    try {
      const def = normalizeModel(task.model);
      if (!def) return task;
      const { lastCreateAt: _l, ...input } = params as Record<string, unknown>;
      void _l;
      await updateTask(taskId, { error_message: null });
      const outcome = await tryCreateOnKeys(taskId, def, input as Record<string, unknown>, 0);
      await updateTask(taskId, { params_json: JSON.stringify({ ...params, lastCreateAt: nowIso() }) });
      if (outcome.ok && !outcome.syncUrls) {
        // أُنشئت الآن — استعلام واحد سريع ثم أعد الحالة للعميل
        return pollUntilDone(taskId, def, input as Record<string, unknown>, outcome, 0, undefined, "قيد التوليد");
      }
      if (outcome.ok && outcome.syncUrls) return (await getTask(taskId))!;
      await updateTask(taskId, { error_message: WAITING_NOTE });
      return (await getTask(taskId))!;
    } finally {
      await releaseTaskLock(taskId);
    }
  }

  // مهمة جارية لديها provider_task_id → حدّث من المزود
  const def = normalizeModel(task.model);
  const provider = task.provider as ProviderId;
  const adapter = PROVIDERS[provider];
  const keyId = task.key_id;
  if (!def || !adapter || !keyId) return task;

  // جلب المفتاح من القاعدة (قد يكون عُطّل أو استُنفد منذ آخر فحص)
  const key = await getKey(keyId);
  if (!key || key.status === "disabled") {
    // المفتاح لم يعد صالحًا → إعادة إنشاء على المفاتيح التالية
    return await recreateFromRefresh(task, def, params);
  }

  try {
    const st = await adapter.checkTask(key, task.provider_task_id);
    if (st.status === "completed" && st.urls?.length) {
      await updateTask(taskId, { status: "completed", progress: 100, result_urls: st.urls, error_message: null });
      return (await getTask(taskId))!;
    }
    if (st.status === "failed") {
      const msg = st.error || "فشل التوليد لدى المزود";
      if (isKeyOrBalanceRelated(msg) || /model not found|unsupported model|model_not_found/i.test(msg)) {
        return await recreateFromRefresh(task, def, params);
      }
      await updateTask(taskId, { status: "failed", error_message: msg });
      return (await getTask(taskId))!;
    }
    await updateTask(taskId, { progress: Math.min(95, st.progress ?? task.progress) });
    return (await getTask(taskId))!;
  } catch (err) {
    const cls = classifyProviderError(err);
    if (cls === "disabled" || cls === "exhausted") {
      const msg = err instanceof Error ? err.message : String(err);
      await recordAttemptOnKey(key, { ok: false, errorClass: cls, error: msg });
      await updateTask(taskId, {}, attempt(provider, key, false, cls, msg));
      return await recreateFromRefresh(task, def, params);
    }
    return (await getTask(taskId))!; // temporary → أعدها كما هي
  }
}

// إعادة إنشاء من مسار refresh: من المفتاح التالي بعد مفتاح المهمة الحالي
// 🔒 بقفل ذري: نداءان متزامنان (مشهد + get_task + كاسحة) على نفس المهمة الميتة
// كانا ينشئان مهمتين لدى المزود على مفتاحين مختلفين (ازدواج رصيد) — القفل يسمح لواحد فقط
async function recreateFromRefresh(task: TaskRecord, def: ModelDef, params: Record<string, unknown>): Promise<TaskRecord> {
  const gotLock = await claimTaskLock(task.id, 90);
  if (!gotLock) return (await getTask(task.id))!; // نداء آخر يعيد الإنشاء الآن — لا ازدواج
  try {
    const pool = await getKeyPool(def.providers);
    const idx = pool.findIndex((k) => k.id === task.key_id);
    const { lastCreateAt: _l, ...input } = params as Record<string, unknown>;
    void _l;
    await updateTask(task.id, { provider: null, provider_task_id: null, key_id: null, progress: 2, error_message: null });
    const outcome = await tryCreateOnKeys(task.id, def, input as Record<string, unknown>, idx + 1);
    await updateTask(task.id, { params_json: JSON.stringify({ ...params, lastCreateAt: nowIso() }) });
    if (outcome.ok && outcome.syncUrls) return (await getTask(task.id))!;
    if (outcome.ok) {
      // تحديث سريع واحد دون انتظار طويل
      return pollUntilDone(task.id, def, input as Record<string, unknown>, outcome, 0, undefined, "قيد التوليد");
    }
    await updateTask(task.id, { error_message: WAITING_NOTE });
    return (await getTask(task.id))!;
  } finally {
    await releaseTaskLock(task.id);
  }
}

async function refreshMergeTask(task: TaskRecord): Promise<TaskRecord> {
  // بلا jobId بعد → أنشئ المهمة ونفّذ process الآن
  if (!task.provider_task_id) {
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(task.params_json || "{}");
    } catch {
      params = {};
    }
    const urls = (params.urls as string[]) || [];
    if (urls.length < 2) return task;
    try {
      const { jobId } = await mergerClient.createJob(urls);
      await updateTask(task.id, { provider: "merger", provider_task_id: jobId }, attempt("merger", null, true));
      fireProcessOnce(jobId);
      return (await getTask(task.id))!;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateTask(task.id, { status: "failed", error_message: msg });
      return (await getTask(task.id))!;
    }
  }

  let job;
  try {
    job = await mergerClient.getJob(task.provider_task_id);
  } catch (err) {
    if (err instanceof MergerError && err.status === 404) {
      // فشل نهائي: المهمة حُذفت أو انتهت صلاحيتها
      await updateTask(task.id, {
        status: "failed",
        error_message: "مهمة الدمج غير موجودة في الخدمة (حُذفت أو انتهت صلاحيتها بعد 24 ساعة)",
      });
      return (await getTask(task.id))!;
    }
    if (err instanceof MergerError && err.status) {
      await updateTask(task.id, { status: "failed", error_message: err.message });
      return (await getTask(task.id))!;
    }
    return task; // خطأ شبكة مؤقت
  }

  if (job.status === "done") {
    const url = job.videoUrl || job.downloadUrl || mergerClient.signedVideoUrl(task.provider_task_id);
    await updateTask(task.id, { status: "completed", progress: 100, result_urls: [url], error_message: null });
    return (await getTask(task.id))!;
  }
  if (job.status === "failed" || job.error) {
    await updateTask(task.id, { status: "failed", error_message: job.error || "فشلت خدمة الدمج" });
    return (await getTask(task.id))!;
  }
  // إن كانت processing ولم يُنفَّذ process بعد → نفّذه الآن
  if (job.status === "queued" || (job.status === "processing" && Number(job.progress ?? 0) <= 1)) {
    fireProcessOnce(task.provider_task_id);
  }
  const pct = Math.max(task.progress, Math.min(95, Math.round(job.progress ?? 0)));
  await updateTask(task.id, { progress: pct });
  return (await getTask(task.id))!;
}
