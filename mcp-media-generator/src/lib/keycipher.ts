// ============================================================
// تشفير مفاتيح المزودين المخزنة — AES-256-GCM بمفتاح من البيئة
// الصيغة المخزنة: enc:v1:<iv b64>:<tag b64>:<ct b64>
// مفاتيح قديمة بلا بادئة تُقرأ نصًا (توافق) — الترحيل يتم عند أول قراءة/كتابة
// ============================================================
import crypto from "node:crypto";

export function cipherKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch { /* ليس base64 */ }
  return crypto.scryptSync(raw, "mg-key-cipher", 32);
}

export function isEncrypted(stored: string): boolean {
  return /^enc:v1:[^:]+:[^:]+:.+$/.test(String(stored || ""));
}

export function encryptApiKey(plain: string): string {
  const ck = cipherKey();
  if (!ck) return plain; // بدون ENCRYPTION_KEY: يبقى نصًا (وضع تطوير — اضبطه في الإنتاج)
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", ck, iv);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return `enc:v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decryptApiKey(stored: string): string {
  const s = String(stored || "");
  if (!isEncrypted(s)) return s; // نص قديم غير مشفر
  const m = /^enc:v1:([^:]+):([^:]+):(.+)$/.exec(s)!;
  try {
    const ck = cipherKey();
    if (!ck) return s;
    const d = crypto.createDecipheriv("aes-256-gcm", ck, Buffer.from(m[1], "base64"));
    d.setAuthTag(Buffer.from(m[2], "base64"));
    return Buffer.concat([d.update(Buffer.from(m[3], "base64")), d.final()]).toString("utf8");
  } catch {
    return s; // مفتاح تشفير مختلف — أعد ضبط ENCRYPTION_KEY بنفس القيمة الأصلية
  }
}
