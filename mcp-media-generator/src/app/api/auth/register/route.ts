// POST /api/auth/register — حساب زبون جديد: إيميل + اسم مستخدم + كلمة مرور
import { NextRequest, NextResponse } from "next/server";
import { createUser, sessionCookie, getSessionVersion } from "@/lib/auth";
import { clientIp, rateLimitDb } from "@/lib/ratelimit";

// دومينات إيميل مؤقتة/مرمي — تُرفض (تحقق إيميل فعلي يتطلب مزود بريد — انظر التقرير)
const DISPOSABLE = ["mailinator.com","yopmail.com","guerrillamail.com","10minutemail.com","tempmail.com",
  "temp-mail.org","throwawaymail.com","sharklasers.com","trashmail.com","getnada.com","dispostable.com",
  "fakeinbox.com","mailnesia.com","maildrop.cc","mohmal.com","tempr.email","tmpmail.org"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  let body: { email?: string; username?: string; password?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const email = (body.email || "").trim();
  const username = (body.username || "").trim();
  const password = String(body.password || "");
  // 💰 لا مكافآت إحالة — كود الدعوة يُتجاهل تمامًا (المحفظة تبدأ صفرًا دائمًا)
  // حماية من السبام: 5 حسابات كحد أقصى لكل IP كل 10 دقائق (عداد في القاعدة)
  if (!(await rateLimitDb(`reg:${clientIp(req)}`, 5, 10 * 60_000))) {
    return NextResponse.json({ error: "⚠️ عدد تسجيلات كبير من جهازك — استنى 10 دقائق وجرّب تاني" }, { status: 429 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "⚠️ اكتب إيميل صحيح" }, { status: 400 });
  const emailDomain = email.toLowerCase().split("@")[1] || "";
  if (DISPOSABLE.some((d) => emailDomain === d || emailDomain.endsWith("." + d))) {
    return NextResponse.json({ error: "⚠️ الإيميلات المؤقتة غير مسموحة — استخدم إيميلك الحقيقي" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_\u0621-\u064A]{3,30}$/.test(username)) return NextResponse.json({ error: "⚠️ اسم المستخدم: من 3 إلى 30 حرفًا (عربي/إنجليزي/أرقام وبدون مسافات)" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "⚠️ كلمة المرور: 8 أحرف على الأقل" }, { status: 400 });

  try {
    const user = await createUser(email, username, password);
    const c = sessionCookie(user.id, await getSessionVersion(user.id).catch(() => 0));
    const res = NextResponse.json({
      ok: true,
      user: { username: user.username, email: user.email },
      // 💰 لا رصيد مجاني — الشحن بعد شراء باقة وتأكيدها فقط
    });
    res.cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("UNIQUE")
      ? "⚠️ الإيميل أو اسم المستخدم مسجل قبل كده — سجّل دخول بدل التسجيل"
      : "فشل التسجيل — جرّب تاني";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
