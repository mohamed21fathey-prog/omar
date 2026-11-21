// ============================================================
// مزود kie.ai — Jobs API الموحد (الأشكال كما وردت في التوثيق الرسمي
// docs.kie.ai؛ resultJson نص يحتاج JSON.parse ثانيًا)
// ============================================================
import { ProviderError } from "../keys";
import type { ProviderAdapter } from "./types";

const BASE = "https://api.kie.ai";

interface KieResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

async function kieFetch(key: string, path: string, init?: RequestInit): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new ProviderError(`تعذّر الاتصال بـ kie.ai: ${(e as Error).message}`);
  }
  if (resp.status >= 400) {
    const body = await resp.text().catch(() => "");
    let msg = body.slice(0, 300) || `HTTP ${resp.status}`;
    try {
      const j = JSON.parse(body);
      msg = String(j.msg || j.message || j.error?.message || msg);
    } catch { /* نص خام */ }
    throw new ProviderError(msg, resp.status);
  }
  return resp;
}

export const kieAdapter: ProviderAdapter = {
  // مهمة غير متزامنة (صور وفيديو كلاهما عبر Jobs API)
  async createTask(key, model, input) {
    const resp = await kieFetch(key.api_key, "/api/v1/jobs/createTask", {
      method: "POST",
      body: JSON.stringify({ model, input }),
    });
    const j = (await resp.json()) as KieResponse<{ taskId: string }>;
    if (j.code !== 200 || !j.data?.taskId) {
      // بعض أخطاء kie تأتي بحالة HTTP 200 وcode داخلي مختلف
      const status = j.code === 401 || j.code === 403 ? j.code : j.code === 402 ? 402 : undefined;
      throw new ProviderError(j.msg || "فشل إنشاء المهمة لدى kie.ai", status);
    }
    return { providerTaskId: j.data.taskId };
  },

  // استعلام حالة المهمة
  async checkTask(key, providerTaskId) {
    const resp = await kieFetch(key.api_key, `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(providerTaskId)}`);
    const j = (await resp.json()) as KieResponse<{ state: string; resultJson?: string; failMsg?: string; progress?: number }>;
    if (j.code !== 200 || !j.data) {
      const status = j.code === 401 || j.code === 403 ? j.code : j.code === 402 ? 402 : undefined;
      throw new ProviderError(j.msg || "فشل الاستعلام عن المهمة", status);
    }
    const { state, resultJson, failMsg } = j.data;
    if (state === "success") {
      // resultJson نص JSON داخل JSON → {resultUrls: [...]} أو {resultUrl: "..."}
      let urls: string[] = [];
      try {
        const parsed = JSON.parse(resultJson || "{}");
        if (Array.isArray(parsed.resultUrls)) urls = parsed.resultUrls.filter(Boolean);
        else if (parsed.resultUrl) urls = [String(parsed.resultUrl)];
      } catch {
        urls = [];
      }
      if (!urls.length) return { status: "failed", error: "اكتملت المهمة لدى المزود دون روابط نتيجة" };
      return { status: "completed", urls };
    }
    if (state === "fail") return { status: "failed", error: failMsg || "فشل التوليد لدى المزود" };
    // waiting | queuing | generating → قيد المعالجة مع تقدم تقريبي بحسب الحالة
    const progress = state === "generating" ? 45 : state === "queuing" ? 15 : 5;
    return { status: "processing", progress };
  },
};
