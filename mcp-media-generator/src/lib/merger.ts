// ============================================================
// عميل خدمة دمج الفيديو (Video Merger API v2).
// المصادقة: Authorization Bearer MERGER_API_TOKEN على كل النداءات —
// وروابط /video تُبنى موقّعة (HMAC + exp) بمفتاح MERGER_SIGNING_SECRET.
// دفاعي في تحليل الحالة: progress قد يأتي كسرًا 0..1، والجسم قد يحوي
// error بدون status → عاملها فشلًا فورًا.
// ============================================================
import { createHmac } from "crypto";

export class MergerError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "MergerError";
    this.status = status;
  }
}

export const MERGER_BASE = (process.env.MERGER_API_BASE || "").replace(/\/$/, "");

// ترويسة المصادقة لب كل نداءات خدمة الدمج
function mergerHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = process.env.MERGER_API_TOKEN || "";
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// رابط /video موقّع (HMAC + exp) — مطابق لـ lib/sign.js في خدمة الدمج
export function signMergerVideoUrl(jobId: string, { download = false, hours = 25 } = {}): string {
  const secret = process.env.MERGER_SIGNING_SECRET || process.env.MERGER_API_TOKEN || "";
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const sig = createHmac("sha256", secret).update(`${jobId}.${exp}.${download ? "d" : ""}`).digest("hex").slice(0, 32);
  const params = new URLSearchParams({ exp: String(exp), sig });
  if (download) params.set("download", "1");
  return `${MERGER_BASE}/api/jobs/${encodeURIComponent(jobId)}/video?${params.toString()}`;
}

export interface MergerJob {
  jobId: string;
  status: string; // queued | uploading | processing | done | failed
  progress?: number;
  videoUrl?: string;
  downloadUrl?: string;
  size?: number;
  duration?: number;
  resolution?: string;
  expiresAt?: string;
  error?: string;
}

async function mergerFetch(path: string, init?: RequestInit, timeoutMs = 300000): Promise<Response> {
  try {
    return await fetch(`${MERGER_BASE}${path}`, {
      ...init,
      headers: { ...mergerHeaders(), ...(init?.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // أخطاء شبكتنا نحن → مؤقتة (يفرّق عليها المنسّق عن الأخطاء المعلنة)
    throw new MergerError(`تعذّر الاتصال بخدمة الدمج: ${(e as Error).message}`);
  }
}

// اجعل الروابط النسبية (مثل /api/jobs/{id}/video عند التشغيل المحلي) مطلقة
function absolutize(j: MergerJob): MergerJob {
  if (j.videoUrl?.startsWith("/")) j.videoUrl = `${MERGER_BASE}${j.videoUrl}`;
  if (j.downloadUrl?.startsWith("/")) j.downloadUrl = `${MERGER_BASE}${j.downloadUrl}`;
  return j;
}

export const mergerClient = {
  async createJob(videos: string[]): Promise<{ jobId: string; expiresAt?: string }> {
    const resp = await mergerFetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videos }),
    });
    const j = (await resp.json().catch(() => ({}))) as MergerJob & { error?: string };
    if (!resp.ok || !j.jobId) throw new MergerError(j.error || `فشل إنشاء مهمة الدمج (HTTP ${resp.status})`, resp.status);
    return { jobId: j.jobId, expiresAt: j.expiresAt };
  },

  // تنفيذ الدمج — 200 done | 202 processing | خطأ معلن = فشل حتمي
  async processJob(jobId: string): Promise<MergerJob> {
    const resp = await mergerFetch(`/api/jobs/${encodeURIComponent(jobId)}/process`, { method: "POST" });
    const j = (await resp.json().catch(() => ({}))) as MergerJob & { error?: string };
    if (resp.status === 202) return absolutize({ jobId, status: "processing", progress: j.progress });
    if (!resp.ok) throw new MergerError(j.error || `فشل الدمج (HTTP ${resp.status})`, resp.status);
    return absolutize({ ...j, jobId });
  },

  // استعلام الحالة — جسم فيه error بدون status → فشل فوري
  async getJob(jobId: string): Promise<MergerJob> {
    const resp = await mergerFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {}, 15000);
    const j = (await resp.json().catch(() => ({}))) as MergerJob & { error?: string };
    if (resp.status === 404) throw new MergerError("مهمة الدمج غير موجودة في الخدمة (حُذفت أو انتهت صلاحيتها بعد 24 ساعة)", 404);
    if (!resp.ok) throw new MergerError(j.error || `فشل الاستعلام عن مهمة الدمج (HTTP ${resp.status})`, resp.status);
    if (!j.status && j.error) throw new MergerError(j.error, 500);
    // progress قد يأتي كسرًا 0..1 → اضربه في 100
    if (typeof j.progress === "number" && j.progress > 0 && j.progress <= 1) j.progress = Math.round(j.progress * 100);
    return absolutize({ ...j, jobId });
  },

  async deleteJob(jobId: string): Promise<void> {
    await mergerFetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }, 10000).catch(() => {});
  },

  // رابط /video موقّع جاهز للاستخدام من العميل (HMAC + exp)
  signedVideoUrl(jobId: string): string {
    return signMergerVideoUrl(jobId);
  },

  // فحص الجهوزية — بمهلة 4 ثوانٍ
  async healthy(): Promise<boolean> {
    if (!MERGER_BASE) return false;
    try {
      const resp = await fetch(`${MERGER_BASE}/api/config`, { headers: mergerHeaders(), signal: AbortSignal.timeout(4000) });
      return resp.ok;
    } catch {
      return false;
    }
  },
};
