// ============================================================
// نظام رفع يوتيوب التلقائي — OAuth مرة واحدة ثم رفع للأبد
// التدفق: auth/start ← شاشة تأذين جوجل (مرة واحدة) ← callback يخزن
// refresh_token في قاعدة البيانات ← رفع أي فيديو عبر upload
// ============================================================
import { getDb } from "@/lib/turso";

let _ytSchema: Promise<void> | null = null;

function ensureYoutubeSchema(): Promise<void> {
  if (!_ytSchema) {
    _ytSchema = getDb().execute(
      `CREATE TABLE IF NOT EXISTS youtube_tokens (
        id TEXT PRIMARY KEY,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        expires_at TEXT,
        channel_title TEXT,
        channel_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`
    ).then(() => undefined);
  }
  return _ytSchema;
}

const SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function clientConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return `${origin}/api/youtube/callback`;
}

export function buildAuthUrl(origin: string, state?: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  if (state) p.set("state", state); // حماية CSRF لتدفق OAuth — يُتحقق منه في callback
  return `${AUTH_URL}?${p.toString()}`;
}

async function saveTokens(data: {
  refresh_token?: string;
  access_token?: string;
  expires_in?: number;
}): Promise<void> {
  await ensureYoutubeSchema();
  const refresh = data.refresh_token;
  if (refresh) {
    // توكن جديد — احفظه كسجل جديد (الأحدث يُستخدم)
    const id = crypto.randomUUID();
    await getDb().execute({
      sql: `INSERT INTO youtube_tokens (id, refresh_token, access_token, expires_at, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [id, refresh, data.access_token || null,
        data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null],
    });
  } else if (data.access_token) {
    // تحديث لأحدث سجل
    await getDb().execute({
      sql: `UPDATE youtube_tokens
            SET access_token = ?, expires_at = ?
            WHERE id = (SELECT id FROM youtube_tokens ORDER BY created_at DESC, id DESC LIMIT 1)`,
      args: [data.access_token,
        data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null],
    });
  }
}

export async function getLinked(): Promise<{ linked: boolean; channel_title: string | null }> {
  await ensureYoutubeSchema();
  const rs = await getDb().execute(
    "SELECT channel_title FROM youtube_tokens ORDER BY created_at DESC, id DESC LIMIT 1"
  );
  const row = rs.rows[0];
  return { linked: Boolean(row), channel_title: (row?.channel_title as string) || null };
}

async function getAccessToken(): Promise<string> {
  await ensureYoutubeSchema();
  const rs = await getDb().execute(
    "SELECT refresh_token, access_token, expires_at FROM youtube_tokens ORDER BY created_at DESC, id DESC LIMIT 1"
  );
  const row = rs.rows[0];
  if (!row?.refresh_token) throw new Error("لم يتم الربط بقناة يوتيوب بعد — ابدأ من خطوة التأذين");
  // لو الرمز الحالي ما زال صالحًا استخدمه
  const exp = row.expires_at ? new Date(row.expires_at as string).getTime() : 0;
  if (row.access_token && exp > Date.now() + 60_000) return row.access_token as string;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: row.refresh_token as string,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`فشل تجديد رمز جوجل: ${data.error_description || res.status}`);
  }
  await saveTokens({ access_token: data.access_token, expires_in: data.expires_in });
  return data.access_token;
}

export async function exchangeCode(origin: string, code: string): Promise<{ channel_title: string | null }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
    }),
  });
  const data = (await res.json()) as {
    refresh_token?: string; access_token?: string; expires_in?: number; error_description?: string;
  };
  if (!res.ok || !data.refresh_token) {
    throw new Error(`فشل تبادل الرمز: ${data.error_description || res.status}`);
  }
  await saveTokens(data);
  // معلومات القناة اختيارية — نحاول نجيبها برمز الوصول
  let channelTitle: string | null = null;
  try {
    const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const cj = (await ch.json()) as { items?: Array<{ snippet?: { title?: string }; id?: string }> };
    const item = cj.items?.[0];
    channelTitle = item?.snippet?.title || null;
    if (item?.id) {
      await getDb().execute({
        sql: "UPDATE youtube_tokens SET channel_title = ?, channel_id = ? WHERE id = (SELECT id FROM youtube_tokens ORDER BY created_at DESC, id DESC LIMIT 1)",
        args: [channelTitle, item.id],
      }).catch(() => undefined);
    }
  } catch { /* اختيارية */ }
  return { channel_title: channelTitle };
}

export interface UploadArgs {
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "private" | "unlisted" | "public";
  madeForKids?: boolean;
}

export async function uploadToYoutube(args: UploadArgs): Promise<{ videoId: string; url: string }> {
  const token = await getAccessToken();
  const title = args.title.slice(0, 100);
  const desc = (args.description || "").slice(0, 5000);
  const privacy = args.privacyStatus || "private";

  // 1) تنزيل الفيديو من الرابط
  const dl = await fetch(args.videoUrl);
  if (!dl.ok) throw new Error(`تعذر تنزيل الفيديو من المصدر (HTTP ${dl.status})`);
  const buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length < 10_000) throw new Error("ملف الفيديو فارغ أو غير صالح");
  if (buf.length > 250_000_000) throw new Error("الفيديو أكبر من 250MB — قصّره أو ارفعه يدويًا");

  // 2) بدء الرفع المتدرج (resumable)
  const meta = {
    snippet: {
      title,
      description: desc,
      tags: (args.tags || []).slice(0, 15),
      categoryId: "24", // ترفيه
    },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: args.madeForKids ?? true,
    },
  };
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(buf.length),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(meta),
    }
  );
  if (!init.ok) {
    const t = await init.text();
    throw new Error(`فشل بدء الرفع (HTTP ${init.status}): ${t.slice(0, 300)}`);
  }
  const location = init.headers.get("location");
  if (!location) throw new Error("جوجل لم يُرجع رابط الرفع");

  // 3) رفع البايتات
  const up = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length) },
    body: new Uint8Array(buf),
  });
  const data = (await up.json()) as { id?: string; error?: { message?: string } };
  if (!up.ok || !data.id) {
    throw new Error(`فشل رفع البايتات (HTTP ${up.status}): ${data.error?.message || ""}`);
  }
  return { videoId: data.id, url: `https://www.youtube.com/watch?v=${data.id}` };
}
