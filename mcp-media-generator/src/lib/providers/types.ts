// ============================================================
// واجهة المزودات المشتركة — أي خطأ يُرمى كـ ProviderError ليُصنَّف
// في جدول 4.2 (disabled/exhausted/provider/params/temporary)
// ============================================================
import type { ApiKeyRecord } from "../turso";

export interface CreateTaskResult {
  providerTaskId: string;
}

export interface CheckTaskResult {
  status: "processing" | "completed" | "failed";
  urls?: string[];
  error?: string;
  progress?: number;
}

export interface ProviderAdapter {
  // مهمة غير متزامنة (فيديو، وبعض الصور): تعيد providerTaskId
  createTask(key: ApiKeyRecord, model: string, input: Record<string, unknown>): Promise<CreateTaskResult>;
  // صور متزامنة إن كان المزود يدعمها (CometAPI تعيد النتيجة فورًا)
  createImageSync?(key: ApiKeyRecord, input: Record<string, unknown>): Promise<{ urls: string[] }>;
  // استعلام حالة مهمة جارية
  checkTask(key: ApiKeyRecord, providerTaskId: string): Promise<CheckTaskResult>;
}
