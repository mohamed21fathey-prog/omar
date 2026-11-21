// ============================================================
// /api/visits — عداد الزوار الحقيقي + بيانات الرسم البياني
// GET: الإجمالي + اليوم + آخر 14 يوم (زيارات وتحميلات) | POST: تسجيل زيارة
// الجدول: visit_stats (day PK, visits, downloads) — سطر لكل يوم بتوقيت القاهرة
// ============================================================
import { NextResponse } from "next/server";
import { getDb } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let _schema: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!_schema) {
    _schema = (async () => {
      await getDb().execute(
        `CREATE TABLE IF NOT EXISTS visit_stats (
          day TEXT PRIMARY KEY,
          visits INTEGER DEFAULT 0
        )`
      );
      // عمود التحميلات — أُضيف لاحقًا للرسم البياني (تجاهل لو موجود)
      try { await getDb().execute("ALTER TABLE visit_stats ADD COLUMN downloads INTEGER DEFAULT 0"); } catch { /* موجود */ }
    })();
  }
  return _schema;
}

// التاريخ بتوقيت القاهرة (UTC+2) مع إزاحة أيام للخلف
function cairoDay(offset = 0): string {
  return new Date(Date.now() + 2 * 3600 * 1000 - offset * 86400 * 1000).toISOString().slice(0, 10);
}

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const start = cairoDay(13);
    const rs = await getDb().execute({
      sql: `SELECT day, visits, COALESCE(downloads, 0) AS downloads FROM visit_stats WHERE day >= ? ORDER BY day`,
      args: [start],
    });
    const map = new Map<string, { visits: number; downloads: number }>();
    for (const r of rs.rows) {
      map.set(String(r.day), { visits: Number(r.visits) || 0, downloads: Number(r.downloads) || 0 });
    }
    // 14 يوم كاملة — الأيام الفارغة صفر (بدون أي أرقام مختلقة)
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = cairoDay(i);
      const v = map.get(d);
      days.push({ day: d, visits: v?.visits ?? 0, downloads: v?.downloads ?? 0 });
    }
    const total = days.reduce((a, b) => a + b.visits, 0);
    const totalDownloads = days.reduce((a, b) => a + b.downloads, 0);
    const today = days[days.length - 1]?.visits ?? 0;
    return NextResponse.json({ total, today, totalDownloads, days });
  } catch {
    return NextResponse.json({ total: 0, today: 0, totalDownloads: 0, days: [], error: "تعذر قراءة العداد" }, { status: 500 });
  }
}

export async function POST(): Promise<Response> {
  try {
    await ensureSchema();
    await getDb().execute({
      sql: `INSERT INTO visit_stats (day, visits, downloads) VALUES (?, 1, 0)
            ON CONFLICT(day) DO UPDATE SET visits = visits + 1`,
      args: [cairoDay(0)],
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
