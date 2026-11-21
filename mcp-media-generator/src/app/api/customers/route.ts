// GET /api/customers — حسابات الزبائن المسجلة + أرصدتها (محمية بـ Basic Auth عبر proxy)
// بتتغذى عليها قائمة اختيار الزبون في المصنع وربط المفاتيح في لوحة الفوترة
import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await ensureSchema();
  // عمود الرصيد يتأكد هنا أيضًا (نفس نمط auth.ts) حتى تعمل القائمة من أول نداء
  try { await getDb().execute(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0`); } catch { /* موجود */ }
  const rs = await getDb().execute(
    `SELECT id, username, email, COALESCE(credits, 0) AS credits, created_at FROM users ORDER BY created_at DESC LIMIT 100`
  );
  return NextResponse.json({
    users: rs.rows.map((r) => ({
      id: r.id as string,
      username: r.username as string,
      email: r.email as string,
      credits: (r.credits as number) || 0,
      created_at: (r.created_at as string) || null,
    })),
  });
}
