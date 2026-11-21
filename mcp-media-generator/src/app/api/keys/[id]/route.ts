// PATCH /api/keys/{id} — تعطيل/تنشيط يدوي + الدور (owner/customer) + ربط الحساب (user_id)
// DELETE /api/keys/{id} — حذف
import { NextResponse } from "next/server";
import { deleteKey, getDb, getKey, updateKey } from "@/lib/turso";
import { ensureKeyRoleColumn, ensureKeyUserColumn } from "@/lib/keys";
import { getUserById } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const key = await getKey(id);
  if (!key) return NextResponse.json({ error: "المفتاح غير موجود" }, { status: 404 });

  let body: { status?: string; role?: string; label?: string; user_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }

  const patch: { status?: string; role?: string; label?: string } = {};
  if (body.status) {
    const status = String(body.status);
    if (!["active", "disabled"].includes(status)) {
      return NextResponse.json({ error: 'status يجب أن يكون "active" أو "disabled"' }, { status: 400 });
    }
    patch.status = status;
  }
  if (body.role) {
    const role = String(body.role);
    if (!["owner", "customer"].includes(role)) {
      return NextResponse.json({ error: 'role يجب أن يكون "owner" أو "customer"' }, { status: 400 });
    }
    patch.role = role;
  }
  // label نص اختياري — غير نصي → 400 بدل 500
  if (body.label !== undefined) {
    if (typeof body.label !== "string" || body.label.trim().length > 100) {
      return NextResponse.json({ error: "label يجب أن يكون نصًا حتى 100 حرف" }, { status: 400 });
    }
    patch.label = body.label.trim();
  }
  if (!patch.status && !patch.role && !patch.label && body.user_id === undefined) {
    return NextResponse.json({ error: "حدد status أو role أو label أو user_id" }, { status: 400 });
  }
  await ensureKeyRoleColumn();
  if (Object.keys(patch).length) await updateKey(id, patch);

  // ربط/فك ربط حساب الزبون بالمفتاح — من هنا يتحدد الخصم التلقائي من رصيد الموقع
  let linkedUser: string | null = null;
  if (body.user_id !== undefined) {
    await ensureKeyUserColumn();
    const uid = body.user_id ? String(body.user_id) : null;
    if (uid) {
      const user = await getUserById(uid);
      if (!user) return NextResponse.json({ error: "⚠️ حساب الزبون غير موجود" }, { status: 404 });
    }
    await getDb().execute({ sql: `UPDATE api_keys SET user_id = ? WHERE id = ?`, args: [uid, id] });
    linkedUser = uid;
  }
  return NextResponse.json({ id, ...patch, user_id: linkedUser });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteKey(id);
  if (!ok) return NextResponse.json({ error: "المفتاح غير موجود" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: id });
}
