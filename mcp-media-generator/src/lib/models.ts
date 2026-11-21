// ============================================================
// سجل الموديلات — أسماء موحّدة مع قبول الصيغ البديلة (شرطات/نقاط)
// والأسماء قابلة للتجاوز بمتغيرات البيئة
// ============================================================
export type ProviderId = "kie" | "cometapi" | "apiframe";
export type TaskProvider = ProviderId | "merger";
export type MediaType = "image" | "video" | "merge";

export interface ModelDef {
  canonical: string; // الاسم كما يراه عميل MCP
  aliases: string[]; // صيغ بديلة نقبلها ونوحّدها
  type: MediaType;
  providers: ProviderId[]; // من يستطيع خدمته — تُجرَّب مفاتيحهم كلها بالترتيب
  providerModel: Record<ProviderId, string>; // اسم الموديل كما يُرسل لكل مزود
}

const KIE_IMAGE_MODEL = process.env.KIE_IMAGE_MODEL || "gpt-image-2-6/flare-text-to-image";
const KIE_VIDEO_MODEL = process.env.KIE_VIDEO_MODEL || "grok-imagine-video-1-5-preview";
// اسم موديل الفيديو لدى CometAPI حسب توثيقها الحقيقي (apidoc.cometapi.com) هو "grok-imagine-video-1.5"
const COMETAPI_IMAGE_MODEL = process.env.COMETAPI_IMAGE_MODEL || "gpt-image-2.6-flare-text-to-image";
const COMETAPI_VIDEO_MODEL = process.env.COMETAPI_VIDEO_MODEL || "grok-imagine-video-1.5";
// موديلات Apiframe المقاسة من /v2/models والتحقق الحي بالمفتاح:
// الفيديو "grok-imagine-video" (نص→فيديو بنفس عائلة grok، 38 كريدت/فيديو) —
// أما "grok-imagine-video-1.5" فصورة→فيديو فقط (الصورة إلزامية، 60 كريدت)
const APIFRAME_IMAGE_MODEL = process.env.APIFRAME_IMAGE_MODEL || "gpt-image-2";
const APIFRAME_VIDEO_MODEL = process.env.APIFRAME_VIDEO_MODEL || "grok-imagine-video";

export const MODELS: ModelDef[] = [
  {
    canonical: "gpt-image-2-6/flare-text-to-image",
    aliases: ["gpt-image-2.6/flare-text-to-image", "gpt-image-2-6-flare-text-to-image", "gpt-image-2.6-flare-text-to-image"],
    type: "image",
    providers: ["kie", "cometapi", "apiframe"],
    providerModel: { kie: KIE_IMAGE_MODEL, cometapi: COMETAPI_IMAGE_MODEL, apiframe: APIFRAME_IMAGE_MODEL },
  },
  {
    canonical: "grok-imagine-video-1-5-preview",
    aliases: ["grok-imagine-video-1.5-preview", "grok-imagine-video-1-5", "grok-imagine-video-1.5"],
    type: "video",
    providers: ["kie", "cometapi", "apiframe"],
    providerModel: { kie: KIE_VIDEO_MODEL, cometapi: COMETAPI_VIDEO_MODEL, apiframe: APIFRAME_VIDEO_MODEL },
  },
];

// توحيد اسم الموديل: مطابقة تامة للـ canonical أو أي alias — غير معروف → null (خطأ معطيات)
export function normalizeModel(name: string): ModelDef | null {
  const n = String(name || "").trim();
  if (!n) return null;
  return (
    MODELS.find((m) => m.canonical === n || m.aliases.includes(n)) ?? null
  );
}
