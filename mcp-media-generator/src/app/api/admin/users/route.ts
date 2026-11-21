// ============================================================
// /api/admin/users — إدارة الزبائن من لوحة الأدمن (محمية بحماية الأدمن عبر proxy)
// GET: قائمة المستخدمين وأرصدتهم وحالتهم + آخر حركات الرصيد (ledger)
// POST: إجراءات الإدارة:
//   adjust      { user_id, delta, note? }      → إضافة (+) أو خصم (-) أو استرجاع (+)
//   suspend     { user_id }                    → إيقاف الحساب (يدوي فقط — لا شيء يعطّل آليًا)
//   activate    { user_id }                    → إعادة تنشيط الحساب
//   delete      { user_id }                    → حذف الحساب مع الحفاظ على السجلات المالية
//   delete_all  { confirm: "حذف نهائي" }       → حذف جميع الحسابات والمحتوى المرتبط بها دفعة واحدة
//                 (users + ledger + payment_requests + studio_projects + studio_scenes)
//                 مفاتيح المنصة ومهام المصنع والحلقات العامة تبقى سليمة
// ============================================================
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ensureSchema, getDb } from "@/lib/turso";
import { setUserStatus, deleteUserAccount, creditUser } from "@/lib/auth";
import { addLedger } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  await ensureSchema();
  const rs = await getDb().execute(
    `SELECT id, username, email, COALESCE(credits, 0) AS credits,
            COALESCE(status, 'active') AS status, created_at
     FROM users ORDER BY created_at DESC LIMIT 200`
  );
  // آخر حركات الرصيد — اسم المستخدم يُجلب بـ LEFT JOIN (يبقى ظاهرًا «محذوف» بعد حذف صاحبه)
  let ledger: Array<{ user: string; delta: number; reason: string; ref: string; at: string }> = [];
  try {
    const l = await getDb().execute(
      `SELECT l.user_id, l.delta, l.reason, l.ref_id, l.created_at, u.username
       FROM ledger l LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC, l.rowid DESC LIMIT 40`
    );
    ledger = l.rows.map((r) => ({
      user: (r.username as string) || "(محذوف)",
      delta: Number(r.delta || 0),
      reason: String(r.reason || ""),
      ref: String(r.ref_id || "").slice(0, 18),
      at: String(r.created_at || ""),
    }));
  } catch { /* جدول ledger قد لا يكون موجودًا بعد */ }
  const users = rs.rows.map((r) => ({
    id: r.id as string,
    username: r.username as string,
    email: r.email as string,
    credits: (r.credits as number) || 0,
    status: (r.status as string) || "active",
    created_at: (r.created_at as string) || null,
  }));
  return NextResponse.json({ users, ledger });
}

export async function POST(req: Request): Promise<Response> {
  let body: { action?: string; user_id?: string; delta?: number; note?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const action = String(body.action || "");

  // حذف جميع الحسابات دفعة واحدة — يتطلب تأكيدًا نصيًا صريحًا ("حذف نهائي")
  if (action === "delete_all") {
    if (String(body.confirm || "").trim() !== "حذف نهائي") {
      return NextResponse.json({ error: 'التأكيد غير صحيح — اكتب بالحرف: "حذف نهائي"' }, { status: 400 });
    }
    const tables = ["users", "ledger", "payment_requests", "studio_projects", "studio_scenes"];
    const counts: Record<string, number> = {};
    for (const t of tables) {
      try {
        const before = await getDb().execute(`SELECT COUNT(*) AS c FROM ${t}`);
        const n = Number(before.rows[0]?.c ?? 0);
        await getDb().execute(`DELETE FROM ${t}`);
        counts[t] = n;
      } catch {
        counts[t] = -1; // الجدول غير موجود بعد — يُتجاهل بأمان
      }
    }
    // فك ربط الحسابات عن أي مفاتيح (لو وُجد ربط قديم) — المفاتيح نفسها تبقى للمنصة
    await getDb().execute(`UPDATE api_keys SET user_id = NULL`).catch(() => undefined);
    return NextResponse.json({ ok: true, deleted: counts });
  }

  const userId = String(body.user_id || "");
  if (!userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 });

  if (action === "adjust") {
    const delta = Math.trunc(Number(body.delta) || 0);
    if (!delta) return NextResponse.json({ error: "اكتب رقمًا غير صفر: + للإضافة أو - للخصم" }, { status: 400 });
    if (Math.abs(delta) > 100000) return NextResponse.json({ error: "الحد الأقصى للعملية الواحدة 100000" }, { status: 400 });
    // الخصم الذري: لا يصبح الرصيد سالبًا أبدًا
    if (delta < 0) {
      const cur = await getDb().execute({ sql: "SELECT COALESCE(credits,0) AS c FROM users WHERE id = ?", args: [userId] });
      const c = Number(cur.rows[0]?.c ?? 0);
      if (c + delta < 0) return NextResponse.json({ error: `الرصيد الحالي ${c} — لا يمكن الخصم أكثر من ذلك` }, { status: 400 });
    }
    const nb = await creditUser(userId, delta);
    if (nb === null) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    // سجل الحركة في ledger — مرجع فريد لكل تعديل يدوي (يمنع أي تكرار)
    await addLedger(userId, delta, "admin", `admin-${randomUUID()}`).catch(() => undefined);
    return NextResponse.json({ ok: true, balance: nb });
  }

  if (action === "suspend" || action === "activate") {
    const ok = await setUserStatus(userId, action === "suspend" ? "suspended" : "active");
    if (!ok) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    return NextResponse.json({ ok: true, status: action === "suspend" ? "suspended" : "active" });
  }

  if (action === "delete") {
    const d = await deleteUserAccount(userId);
    if (!d.ok) return NextResponse.json({ error: d.error || "فشل الحذف" }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}
