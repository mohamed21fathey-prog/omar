// GET /api/account/requests — طلبات شحن الزبون الحالي فقط (يتطلب جلسة)
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, readSession } from "@/lib/auth";
import { getDb, ensureSchema } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const id = readSession(req);
  if (!id) return NextResponse.json({ error: "سجّل دخول أولًا" }, { status: 401 });
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "الجلسة منتهية — سجّل دخول تاني" }, { status: 401 });
  await ensureSchema();
  const rs = await getDb().execute({
    sql: `SELECT id, method, amount, reference, status, created_at FROM payment_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`,
    args: [id],
  });
  const requests = rs.rows.map((r) => ({
    id: r.id as string,
    method: r.method as string,
    amount: r.amount as string,
    reference: (r.reference as string) || null,
    status: (r.status as string) || "pending",
    created_at: (r.created_at as string) || null,
  }));
  return NextResponse.json({ requests, credits: user.credits });
}
