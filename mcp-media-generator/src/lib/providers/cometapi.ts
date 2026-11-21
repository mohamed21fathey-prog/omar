// ============================================================
// مزود CometAPI — الأشكال الحقيقية المقاسة من التوثيق الرسمي
// apidoc.cometapi.com:
//  - الصور: POST /v1/images/generations (متوافقة مع OpenAI، متزامنة)
//  - الفيديو (Grok): POST /grok/v1/videos/generations → {request_id}
//    ثم GET /grok/v1/videos/{request_id} حتى status = done|failed|expired
// ============================================================
import { ProviderError } from "../keys";
import type { ProviderAdapter } from "./types";

const BASE = "https://api.cometapi.com";

async function cometFetch(key: string, path: string, init?: RequestInit): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    throw new ProviderError(`تعذّر الاتصال بـ CometAPI: ${(e as Error).message}`);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    let msg = body.slice(0, 300) || `HTTP ${resp.status}`;
    try {
      const j = JSON.parse(body);
      msg = String(j.error?.message || j.message || j.msg || msg);
    } catch { /* نص خام */ }
    throw new ProviderError(msg, resp.status);
  }
  return resp;
}

// خريطة aspect_ratio → أحجام OpenAI المدعومة
function sizeFor(aspect?: string): string | undefined {
  switch (aspect) {
    case "1:1": case "4:3": case "5:4": case "3:4": case "4:5": return "1024x1024";
    case "3:2": case "16:9": case "2:1": case "21:9": case "3:1": return "1536x1024";
    case "2:3": case "9:16": case "1:2": case "9:21": case "1:3": return "1024x1536";
    default: return undefined; // auto → نرسل بلا size
  }
}

export const cometapiAdapter: ProviderAdapter = {
  // صور متزامنة — تُعاد فورًا
  async createImageSync(key, input) {
    const body: Record<string, unknown> = {
      model: input.__model as string,
      prompt: input.prompt as string,
      n: 1,
    };
    const size = sizeFor(input.aspect_ratio as string | undefined);
    if (size) body.size = size;
    const resp = await cometFetch(key.api_key, "/v1/images/generations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const j = (await resp.json()) as { data?: Array<{ url?: string; b64_json?: string }>; error?: { message?: string } };
    if (j.error?.message) throw new ProviderError(j.error.message);
    const item = j.data?.[0];
    if (!item) throw new ProviderError("CometAPI أعادت استجابة بلا بيانات صورة");
    // قاعدة «روابط فقط»: b64_json → data URI ضخم يُخزَّن في القاعدة ويرسل للنموذج — مرفوض.
    // نرميه كفشل لينتقل المفتاح/المزود التالي (ليس params — الرابط قد يأتي من مزود آخر).
    if (!item.url && item.b64_json) {
      throw new ProviderError("CometAPI أعادت الصورة كـ b64_json بدون رابط — مرفوض (سياسة روابط فقط)");
    }
    if (!item.url) throw new ProviderError("CometAPI لم تعُد رابط صورة");
    return { urls: [item.url] };
  },

  // فيديو غير متزامن بنمط xAI/Grok
  async createTask(key, model, input) {
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt as string,
      duration: input.duration ?? 8,
      aspect_ratio: input.aspect_ratio === "auto" ? undefined : input.aspect_ratio ?? "16:9",
      resolution: input.resolution ?? "480p",
    };
    if (input.image_url) body.image = { url: input.image_url }; // حسب التوثيق: كائن image.url وليس image_url
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    const resp = await cometFetch(key.api_key, "/grok/v1/videos/generations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const j = (await resp.json()) as { request_id?: string; id?: string; task_id?: string; error?: { message?: string } };
    if (j.error?.message) throw new ProviderError(j.error.message);
    const id = j.request_id || j.id || j.task_id;
    if (!id) throw new ProviderError("CometAPI لم تعُد request_id للمهمة");
    return { providerTaskId: id };
  },

  async checkTask(key, providerTaskId) {
    const resp = await cometFetch(key.api_key, `/grok/v1/videos/${encodeURIComponent(providerTaskId)}`);
    const j = (await resp.json()) as {
      status?: string;
      video?: { url?: string };
      video_url?: string;
      error?: { message?: string } | string;
    };
    if (j.error) {
      const msg = typeof j.error === "string" ? j.error : j.error.message || "خطأ غير معروف";
      throw new ProviderError(msg);
    }
    const status = String(j.status || "").toLowerCase();
    const url = j.video?.url || j.video_url;
    if (status === "done" || status === "completed" || status === "succeeded") {
      if (!url) return { status: "failed", error: "اكتملت المهمة دون رابط فيديو" };
      return { status: "completed", urls: [url] };
    }
    if (status === "failed" || status === "expired" || status === "error") {
      return { status: "failed", error: `فشل التوليد لدى CometAPI (${status})` };
    }
    return { status: "processing" };
  },
};
