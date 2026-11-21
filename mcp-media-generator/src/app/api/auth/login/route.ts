// POST /api/auth/login — دخول بالإيميل أو اسم المستخدم + كلمة المرور
import { NextRequest, NextResponse } from "next/server";
import { findUserByIdentifier, getUserById, sessionCookie, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimitDb } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  // حماية من القوة الغاشمة: 8 محاولات لكل IP كل 10 دقائق (عداد في القاعدة — يعمل عبر كل النسخ)
  if (!(await rateLimitDb(`login:${clientIp(req)}`, 8, 10 * 60_000))) {
    return NextResponse.json({ error: "⚠️ محاولات دخول كتير — استنى 10 دقائق وجرّب تاني" }, { status: 429 });
  }
  let body: { identifier?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const identifier = (body.identifier || "").trim();
  const password = String(body.password || "");
  if (!identifier || !password) return NextResponse.json({ error: "⚠️ اكتب الإيميل/اسم المستخدم وكلمة المرور" }, { status: 400 });

  const found = await findUserByIdentifier(identifier);
  if (!found || !verifyPassword(password, found.password_hash)) {
    return NextResponse.json({ error: "⚠️ البيانات غير صحيحة — راجع الإيميل وكلمة المرور" }, { status: 401 });
  }
  // الحساب الموقوف يدويًا من الأدمن — دخوله ممنوع برسالة واضحة
  if ((found.status || "active") === "suspended") {
    return NextResponse.json({ error: "🚫 الحساب موقوف مؤقتًا — تواصل معنا من زر الواتساب في الموقع" }, { status: 403 });
  }
  const user = await getUserById(found.id);
  const c = sessionCookie(found.id, Number((user as unknown as { session_version?: number })?.session_version) || 0);
  const res = NextResponse.json({ ok: true, user: user ? { username: user.username, email: user.email } : null });
  res.cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
