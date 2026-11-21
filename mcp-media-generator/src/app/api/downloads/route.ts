// ============================================================
// POST /api/downloads — عدّاد التحميلات الحقيقي
// يُستدعى عند الضغط على زر «⬇️ تنزيل» (المكتبة وأي مكان آخر)
// نفس جدول الزيارات: عمود downloads لكل يوم بتوقيت القاهرة
// ============================================================
import { NextResponse } from "next/server";
import { getDb } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let _schema: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!_schema) {
    _schema = (async () => {
      try { await getDb().execute("ALTER TABLE visit_stats ADD COLUMN downloads INTEGER DEFAULT 0"); } catch { /* العمود موجود */ }
    })();
  }
  return _schema;
}

function today(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function POST(): Promise<Response> {
  try {
    await ensureSchema();
    await getDb().execute({
      sql: `INSERT INTO visit_stats (day, visits, downloads) VALUES (?, 0, 1)
            ON CONFLICT(day) DO UPDATE SET downloads = COALESCE(downloads, 0) + 1`,
      args: [today()],
    });
    const rs = await getDb().execute("SELECT COALESCE(SUM(downloads), 0) AS t FROM visit_stats");
    return NextResponse.json({ ok: true, totalDownloads: Number(rs.rows[0]?.t) || 0 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
