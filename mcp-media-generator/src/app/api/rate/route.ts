// ============================================================
// /api/rate — ⭐ تقييم الموقع من المستخدمين المسجلين
// GET  → المتوسط الحقيقي + عدد التقييمات + تقييمي إن كنت مسجلًا
// POST { rating: 1-5, comment? } → حفظ/تحديث تقييم واحد لكل مستخدم (upsert)
// كل الأرقام حقيقية من قاعدة البيانات — بدون أي أرقام مخترعة
// ============================================================
import { NextResponse } from "next/server";
import { readSession, getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureRatingsSchema(): Promise<void> {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS site_ratings (
    user_id TEXT PRIMARY KEY,
    rating INTEGER NOT NULL,
    comment TEXT,
    updated_at TEXT NOT NULL
  )`).catch(() => undefined);
}

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureRatingsSchema();
    const db = getDb();
    const agg = await db.execute(`SELECT COUNT(*) AS n, AVG(rating) AS a FROM site_ratings`);
    const row = agg.rows[0] as unknown as Record<string, unknown> | undefined;
    const count = Number(row?.n ?? 0);
    const avg = Number(row?.a ?? 0);
    // تقييمي أنا — لو مسجل
    let mine: number | null = null;
    let myComment: string | null = null;
    const uid = readSession(req);
    if (uid) {
      const me = await db.execute({ sql: `SELECT rating, comment FROM site_ratings WHERE user_id = ?`, args: [uid] }).catch(() => null);
      const m = me?.rows?.[0] as unknown as Record<string, unknown> | undefined;
      if (m) { mine = Number(m.rating); myComment = (m.comment as string) || null; }
    }
    return NextResponse.json({ avg, count, mine, my_comment: myComment });
  } catch {
    return NextResponse.json({ avg: 0, count: 0, mine: null, my_comment: null });
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "سجّل دخولك أولًا علشان تقيّم" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const rating = Math.round(Number(body.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "التقييم لازم يكون من 1 لـ 5 نجوم" }, { status: 400 });
  }
  const comment = String(body.comment || "").trim().slice(0, 300) || null;
  try {
    await ensureRatingsSchema();
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO site_ratings (user_id, rating, comment, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = datetime('now')`,
      args: [user.id, rating, comment],
    });
    return NextResponse.json({ ok: true, rating, comment });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "تعذر حفظ التقييم" }, { status: 500 });
  }
}
