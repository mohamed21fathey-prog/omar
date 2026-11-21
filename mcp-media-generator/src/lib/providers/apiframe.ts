// ============================================================
// مزود Apiframe — الواجهة الموحدة v2، كل الأشكال مقاسة من الـAPI
// الحقيقي بالمفتاح (استكشاف بالتحقق: طلب صالح → 402 رصيد، ناقص → 400 تفاصيل)
//  - المصادقة: ترويسة X-API-Key (مفاتيح afk_...)
//  - الفيديو والصور مهام غير متزامنة: POST …/generate → { jobId } ثم GET /v2/jobs/{jobId}
//  - الموديلات المقاسة:
//      grok-imagine-video (نص→فيديو، نفس عائلة grok، 38 كريدت):
//          grokImagineVideoParams { aspect_ratio 1:1..2:3, duration 6|10|15 }
//      grok-imagine-video-1.5 (صورة→فيديو فقط — الصورة إلزامية، 60 كريدت):
//          grokImagineVideo15Params { image إلزامي, aspect_ratio + auto }
//      gpt-image-2 (صور):
//          gptImage2Params { input_images[], aspect_ratio 1:1|3:2|2:3 }
//  - 402 insufficient credits → استنزاف (exhausted) — يستأنف تلقائيًا بعد شحن الحساب
// ============================================================
import { ProviderError } from "../keys";
import type { ProviderAdapter } from "./types";

const BASE = "https://api.apiframe.ai";

const GROK_VIDEO_ASPECTS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);
const GROK_VIDEO_DURATIONS = [6, 10, 15];
const GROK15_ASPECTS = new Set(["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);
const IMAGE_ASPECTS: Record<string, string> = {
  "16:9": "3:2", "2:1": "3:2", "21:9": "3:2", "3:2": "3:2", "4:3": "3:2",
  "9:16": "2:3", "2:3": "2:3", "1:2": "2:3", "9:21": "2:3", "3:4": "2:3",
};

// أقرب مدة مدعومة (6|10|15) — التعادل يميل للأرخص
function pickDuration(seconds: number): number | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return GROK_VIDEO_DURATIONS.reduce((best, d) =>
    Math.abs(d - seconds) < Math.abs(best - seconds) ? d : best,
    GROK_VIDEO_DURATIONS[0]);
}

async function apiframeFetch(key: string, path: string, init?: RequestInit): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "X-API-Key": key,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    throw new ProviderError(`تعذّر الاتصال بـ Apiframe: ${(e as Error).message}`);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    let msg = body.slice(0, 300) || `HTTP ${resp.status}`;
    try {
      const j = JSON.parse(body) as {
        error?: unknown;
        message?: unknown;
        details?: Record<string, string[]>;
      };
      // تفاصيل أخطاء التحقق أغنى من «Validation failed» العام
      const firstDetail = j.details && typeof j.details === "object"
        ? Object.values(j.details)[0]?.[0]
        : undefined;
      const errStr = typeof j.error === "string" ? j.error : undefined;
      msg = String(firstDetail || j.message || errStr || msg);
    } catch { /* نص خام */ }
    throw new ProviderError(msg, resp.status);
  }
  return resp;
}

export const apiframeAdapter: ProviderAdapter = {
  async createTask(key, model, input) {
    const prompt = String(input.prompt || "");
    if (!prompt) throw new ProviderError("برومبت مفقود لمهمة Apiframe");
    const aspect = String(input.aspect_ratio || "");
    const image = String(input.image_url || "");

    let body: Record<string, unknown>;
    switch (model) {
      case "grok-imagine-video": {
        // نص→فيديو (نفس عائلة grok) — المعاملات اختيارية وتُرسل فقط عند توفرها
        const p: Record<string, unknown> = {};
        if (GROK_VIDEO_ASPECTS.has(aspect)) p.aspect_ratio = aspect;
        const dur = pickDuration(Number(input.duration));
        if (dur) p.duration = dur;
        body = { model, prompt, ...(Object.keys(p).length ? { grokImagineVideoParams: p } : {}) };
        break;
      }
      case "grok-imagine-video-1.5": {
        // صورة→فيديو فقط — الإطار الأول إلزامي حسب مخططهم
        if (!image) throw new ProviderError("Apiframe grok-1.5 يحتاج صورة إطار أول (image_url)");
        const p: Record<string, unknown> = { image };
        p.aspect_ratio = GROK15_ASPECTS.has(aspect) ? aspect : "auto";
        body = { model, prompt, grokImagineVideo15Params: p };
        break;
      }
      case "gpt-image-2": {
        const p: Record<string, unknown> = { aspect_ratio: IMAGE_ASPECTS[aspect] || "1:1" };
        if (image) p.input_images = [image];
        body = { model, prompt, gptImage2Params: p };
        break;
      }
      default:
        // بلا حالة HTTP → تصنيف «مؤقت» → ينتقل للمزود التالي بهدوء
        throw new ProviderError(`Apiframe لا يخدم الموديل ${model}`);
    }

    const endpoint = model === "gpt-image-2" ? "/v2/images/generate" : "/v2/videos/generate";
    const resp = await apiframeFetch(key.api_key, endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const j = (await resp.json()) as { jobId?: string; id?: string; job_id?: string };
    const jobId = j.jobId || j.id || j.job_id;
    if (!jobId) throw new ProviderError("Apiframe لم تعُد jobId للمهمة");
    return { providerTaskId: String(jobId) };
  },

  async checkTask(key, providerTaskId) {
    const resp = await apiframeFetch(key.api_key, `/v2/jobs/${encodeURIComponent(providerTaskId)}`);
    const j = (await resp.json()) as Record<string, unknown>;
    // الغلاف قد يكون { job: {...} } أو مسطحًا — نتعامل مع الاثنين
    const job = ((j.job as Record<string, unknown> | undefined) || j);
    const status = String(job.status || "").toUpperCase();
    if (status === "COMPLETED") {
      // النتائج في job.result: مصفوفة روابط، أو نص واحد، أو كائن يحمل رابطًا
      const raw = job.result;
      let urls: string[] = [];
      if (Array.isArray(raw)) {
        urls = raw.filter((u): u is string => typeof u === "string" && u.startsWith("http"));
      } else if (typeof raw === "string" && raw.startsWith("http")) {
        urls = [raw];
      } else if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        const cand = o.url || o.video_url || (Array.isArray(o.videos) ? (o.videos as unknown[])[0] : undefined);
        if (typeof cand === "string" && cand.startsWith("http")) urls = [cand];
      }
      if (!urls.length) return { status: "failed", error: "اكتملت المهمة لدى Apiframe دون روابط نتيجة" };
      return { status: "completed", urls, progress: 100 };
    }
    if (status === "FAILED") {
      const err = String(job.error || job.failure_reason || job.message || "فشل التوليد لدى Apiframe");
      return { status: "failed", error: err.slice(0, 300) };
    }
    // QUEUED | STARTED | PROCESSING | …
    const prog = typeof job.progress === "number"
      ? Math.max(1, Math.min(99, Math.round(job.progress)))
      : status === "QUEUED" ? 5 : 35;
    return { status: "processing", progress: prog };
  },
};
