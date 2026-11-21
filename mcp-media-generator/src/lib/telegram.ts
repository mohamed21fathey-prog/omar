// ============================================================
// قناة تليجرام الآلية — نشر كل حلقة جديدة أوتوماتيكيًا
// التوكن ومعرف القناة في جدول منفصل (tg_config) — لا يظهر أبدًا في
// /api/settings العام (الذي يقرأ site_settings كاملًا)
// التفعيل: بوت من @BotFather → التوكن هنا → أضف البوت أدمن في قناتك
// ============================================================
import { getDb, ensureSchema } from "@/lib/turso";

let _tgSchema: Promise<void> | null = null;
function ensureTgSchema(): Promise<void> {
  if (!_tgSchema) {
    _tgSchema = getDb()
      .execute(
        `CREATE TABLE IF NOT EXISTS tg_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          bot_token TEXT,
          chat_id TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .then(() => undefined)
      .catch(() => undefined);
  }
  return _tgSchema;
}

export interface TgConfig {
  bot_token: string;
  chat_id: string;
}

export async function getTgConfig(): Promise<TgConfig> {
  await ensureTgSchema();
  const rs = await getDb().execute(`SELECT bot_token, chat_id FROM tg_config WHERE id = 1`);
  return {
    bot_token: ((rs.rows[0]?.bot_token as string) || "").trim(),
    chat_id: ((rs.rows[0]?.chat_id as string) || "").trim(),
  };
}

export async function setTgConfig(patch: Partial<TgConfig>): Promise<void> {
  await ensureTgSchema();
  const cur = await getTgConfig();
  const bot_token = (patch.bot_token !== undefined ? patch.bot_token : cur.bot_token).trim().slice(0, 200);
  const chat_id = (patch.chat_id !== undefined ? patch.chat_id : cur.chat_id).trim().slice(0, 100);
  await getDb().execute({
    sql: `INSERT INTO tg_config (id, bot_token, chat_id, updated_at) VALUES (1, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET bot_token = excluded.bot_token, chat_id = excluded.chat_id, updated_at = datetime('now')`,
    args: [bot_token, chat_id],
  });
}

export async function clearTgConfig(): Promise<void> {
  await ensureTgSchema();
  await getDb().execute(`DELETE FROM tg_config WHERE id = 1`);
}

export function tgConfigured(c: TgConfig): boolean {
  return !!c.bot_token && !!c.chat_id;
}

// توكن بوت تليجرام: أرقام : سلسلة — ومعرف القناة: @اسم أو رقم سالب/موجب
export function tgValidToken(t: string): boolean {
  return /^\d{6,}:[\w-]{20,}$/.test(t.trim());
}
export function tgValidChatId(c: string): boolean {
  return /^(-?\d{5,}|@[\w]{4,64})$/.test(c.trim());
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tgCall(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const c = await getTgConfig();
    if (!tgConfigured(c)) return { ok: false, error: "غير مفعّل — أضف توكن البوت ومعرف القناة أولًا" };
    const resp = await fetch(`https://api.telegram.org/bot${c.bot_token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const d = (await resp.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!resp.ok || d.ok === false) return { ok: false, error: d.description || `HTTP ${resp.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطأ اتصال" };
  }
}

// رسالة نصية عادية (زر الاختبار)
export async function telegramSend(text: string): Promise<{ ok: boolean; error?: string }> {
  return tgCall("sendMessage", { chat_id: (await getTgConfig()).chat_id, text: text.slice(0, 4000) });
}

// نشر حلقة جديدة: غلاف + عنوان + وصف + هاشتاقات + رابط — تلقائي عند اكتمال الدمج
export async function telegramPostEpisode(opts: {
  title: string;
  description?: string;
  hashtags?: string;
  url?: string;
  thumbUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const cap = [
    `🎬 <b>${esc(opts.title)}</b>`,
    opts.description ? `\n\n${esc(opts.description.slice(0, 500))}` : "",
    opts.hashtags ? `\n\n${esc(opts.hashtags)}` : "",
    opts.url ? `\n\n🔗 ${esc(opts.url)}` : "",
    `\n\n✨ كوكب الكرتون — حلقة جديدة كل يوم ٨ صباحًا!`,
  ].join("");
  const c = await getTgConfig();
  if (opts.thumbUrl) {
    return tgCall("sendPhoto", { chat_id: c.chat_id, photo: opts.thumbUrl, caption: cap.slice(0, 1024), parse_mode: "HTML" });
  }
  return tgCall("sendMessage", { chat_id: c.chat_id, text: cap.slice(0, 4000), parse_mode: "HTML" });
}


// إرسال فيديو للحلقة للقناة مباشرة (sendVideo — تليجرام يسحب الرابط العام بنفسه)
export async function telegramSendVideo(url: string, caption: string): Promise<{ ok: boolean; error?: string }> {
  const c = await getTgConfig();
  if (!tgConfigured(c)) return { ok: false, error: "⚠️ اضبط بوت تليجرام ومعرف القناة من لوحة الإدارة أولًا" };
  return tgCall("sendVideo", { chat_id: c.chat_id, video: url, caption: caption.slice(0, 1000), supports_streaming: true });
}
