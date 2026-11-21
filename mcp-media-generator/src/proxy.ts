// ============================================================
// حماية الموقع بالكامل — HTTP Basic Auth + ADMIN_TOKEN (اصطلاح Next.js 16: proxy.ts)
// طبقات الوصول للمسارات المحمية:
//   1) Bearer ADMIN_TOKEN        → سكربتات/مراقبة (مقارنة زمنية-ثابتة)
//   2) كوكي admin_token          → متصفح الإدارة (SameSite=Strict — تُضبط بعد Basic ناجح)
//   3) Basic ADMIN_USERNAME/ADMIN_PASSWORD → النافذة المنبثقة
//   4) Bearer MCP_ACCESS_TOKEN   → /mcp و /api/generate فقط — إلزامي في الإنتاج
//   5) Bearer CRON_SECRET        → /api/cron فقط
// ⚠️ لا توجد أي قيم افتراضية في هذا الملف — لو غابت بيانات الإدارة في الإنتاج
//    يرد كل مسار محمي 503 مغلقًا (fail-closed).
// 🛡️ CSRF: كل طلب كتابة (POST/PATCH/PUT/DELETE) مصادق بكوكي يشترط نفس الأصل
//    (Sec-Fetch-Site + Origin) — طلبات Bearer/Basic من خارج المتصفح معفاة
//    لأنها لا تحمل صلاحية ضمنية (ambient authority).
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimitDb } from "@/lib/ratelimit";
import { timingSafeEqual } from "node:crypto";

const USER = process.env.ADMIN_USERNAME || "";
const PASS = process.env.ADMIN_PASSWORD || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const MCP_TOKEN = process.env.MCP_ACCESS_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a == null ? "" : a), "utf8");
  const bb = Buffer.from(String(b == null ? "" : b), "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba); // استهلاك زمني متقارب حتى مع اختلاف الطول
    return false;
  }
  return timingSafeEqual(ba, bb);
}

function unauthorized(message: string, popup = true) {
  return new NextResponse(message, {
    status: 401,
    headers: {
      // النافذة المنبثقة فقط للتنقل الفعلي بين الصفحات — طلبات fetch الداخلية
      // ترد 401 صامتة بدون ترويسة حتى لا يظهر منبثق تسجيل الدخول للزبائن
      ...(popup ? { "WWW-Authenticate": 'Basic realm="media-generator", charset="UTF-8"' } : {}),
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

// ---------------- فحص CSRF لطلبات الكوكيز ----------------
// يُطبق فقط على طلب كتابة مصادق بكوكي (admin_token أو جلسة زبون):
// يجب أن يكون الطلب من نفس الأصل (Sec-Fetch-Site) وأن يطابق Origin المضيف إن وُجد.
function csrfCheck(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method !== "POST" && method !== "PATCH" && method !== "PUT" && method !== "DELETE") return null;
  const site = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  // طلبات غير متصفحية (curl/MCP clients) لا ترسل Sec-Fetch-Site ولا تحمل كوكي عادةً —
  // نعفيها فقط إن لم يكن معها أي كوكي جلسة (لا صلاحية ضمنية تُسيء استخدامها)
  if (!site && !req.cookies.get("admin_token") && !req.cookies.get("mg_session")) return null;
  if (site && !["same-origin", "same-site", "none"].includes(site)) {
    return NextResponse.json({ error: "🚫 طلب من أصل مختلف — مرفوض (حماية CSRF)" }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const o = new URL(origin);
      if (o.host !== req.headers.get("host")) {
        return NextResponse.json({ error: "🚫 Origin لا يطابق المضيف — مرفوض (حماية CSRF)" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "🚫 Origin غير صالح — مرفوض (حماية CSRF)" }, { status: 403 });
    }
  }
  // طلبات الإدارة التي تحمل جسمًا: JSON حصرًا — DELETE/GET بدون جسم لا تحتاج Content-Type
  // (هذا سبب فشل زر الحذف سابقًا: DELETE بدون جسم كان يُرفض 415)
  const path = req.nextUrl.pathname;
  const hasBody = method === "POST" || method === "PATCH" || method === "PUT";
  if (path.startsWith("/api/") && hasBody) {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("application/json")) {
      return NextResponse.json({ error: "🚫 Content-Type يجب أن يكون application/json" }, { status: 415 });
    }
  }
  return null;
}

export async function proxy(req: NextRequest) {
  // صفحات الزبائن العامة — مفتوحة بدون كلمة مرور (النشر والتسويق)
  const path = req.nextUrl.pathname;
  const method = req.method.toUpperCase();
  const isProduction = process.env.VERCEL_ENV === "production";
  const bearer = (req.headers.get("authorization") || "").trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(bearer);
  const bearerValue = bearerMatch ? bearerMatch[1].trim() : "";

  // بيانات الإدارة إلزامية في الإنتاج — بدونها كل مسار محمي مغلق (لا قيم افتراضية)
  const adminConfigured = Boolean(USER && PASS) || Boolean(ADMIN_TOKEN);
  const hasAdminCookie = Boolean(req.cookies.get("admin_token"));
  const hasUserSession = Boolean(req.cookies.get("mg_session"));

  const isPublic =
    path === "/" ||
    path.startsWith("/recharge") ||
    path === "/account" || // صفحة حساب الزبون — حمايتها جلسة خاصة داخل الـAPI مش Basic Auth
    path === "/studio" || // استوديو الإنتاج الذاتي — حمايته جلسة الزبون داخل الـ APIs زي /account
    path.startsWith("/api/studio/") || // عمليات الاستوديو — محمية بالجلسة داخل المسارات
    path === "/refund" || path === "/terms" || path === "/privacy" || path === "/about" || path === "/contact" || path === "/cookies" || path === "/game" || path === "/library" || // الصفحات القانونية ومعلومات المنصة والألغاز والمكتبة — مفتوحة (المكتبة تحمي بياناتها بالجلسة)
    path.startsWith("/api/library") || // مكتبة الفيديوهات — المصادقة بالجلسة داخل المسار، وتقديم الملفات برابط قدرة (UUID)
    path.startsWith("/api/auth/") || // تسجيل ودخول وخروج — للزوار
    path.startsWith("/api/account/") || // بيانات حساب الزبون — محمية بالجلسة داخل المسار
    path.startsWith("/api/chat") ||
    path.startsWith("/api/wallets") ||
    path.startsWith("/api/public-episodes") ||
    path === "/api/ads" || // ⭐ إعدادات الإعلان فقط (معرف أدسنس) — عامة لكل الزوار، بلا أي بيانات حساسة
    path === "/api/visits" || // 👥 عداد الزوار الحقيقي — قراءة وتسجيل عامة بدون أي بيانات شخصية
    path === "/api/downloads" || // ⬇️ عداد التحميلات الحقيقي — تسجيل عام بدون أي بيانات شخصية
    path === "/api/facebook/callback" || // 🔵 رد Meta OAuth — محمي بحالة موقعة (10 دقائق)
    path === "/api/tiktok/callback" || // 🎵 رد TikTok OAuth — محمي بPKCE وحالة موقعة
    path === "/api/youtube/callback" || // 📺 رد جوجل OAuth — محمي بحالة موقعة
    path === "/planet-coloring-gift.pdf" || // 🎨 كتاب التلوين المجاني (هدية PDF عامة للتنزيل)
    path.startsWith("/coloring/") || // 🎨 أغلفة كتب التلوين (صور عامة لبطاقات المنتجات)
    path === "/ads.txt" || // ⭐ ملف أدسنس الرسمي — يقرأه زاحف جوجل بعد قبول الموقع (عام)
    (path.startsWith("/api/files/") && path.endsWith("/raw") && method === "GET") || // 📁 تقديم ملفات مكتبة الإدارة للزوار (GET للعرض فقط — الرفع والحذف محميان)
    (path === "/api/coloring" && method === "GET") || // 🎨 قائمة كتب التلوين للزوار — القراءة عامة والكتابة محمية بالإدارة
    path === "/robots.txt" || path === "/sitemap.xml" || // 🔍 ملفات محركات البحث — لازم تكون عامة أو جوجل يوقف الأرشفة
    path === "/google4f54a1e638d68de0.html" || // 🔍 ملف تحقق ملكية Google Search Console — لازم يرجع 200 بمحتواه الأصلي
    path === "/api/rate" || // ⭐ تقييم الموقع: القراءة عامة (متوسط حقيقي) — والحفظ نفسه محمي بالجلسة داخل المسار
    (path === "/api/payments" && (method === "POST" || method === "DELETE")); // الزبون يسجل طلب شحن أو يحذف طلبه المعلق — القائمة والتأكيد محمية
  if (isPublic) return NextResponse.next();

  // 🛡️ CSRF على أي طلب كتابة مصادق بكوكي (إدارة أو جلسة زبون)
  if (hasAdminCookie || hasUserSession) {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
  }

  // بوابة الذكاء الاصطناعي: العملاء التقنيون (ChatGPT/Claude) بـ Bearer MCP_ACCESS_TOKEN
  if (path.startsWith("/mcp") || path.startsWith("/api/generate")) {
    if (!MCP_TOKEN) {
      // إلزامي في الإنتاج — يفشل مغلقًا بدل أن يبقى مفتوحًا بقيمة افتراضية
      if (isProduction || process.env.VERCEL) {
        return new NextResponse("🚨 MCP_ACCESS_TOKEN غير مضبوط — المسار مغلق (ضع التوكن في متغيرات البيئة)", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    } else if (bearerValue && safeEqual(bearerValue, MCP_TOKEN)) {
      return NextResponse.next();
    }
  }
  // جدول الحلقات اليومية: Bearer CRON_SECRET
  if (path.startsWith("/api/cron") && CRON_SECRET && bearerValue && safeEqual(bearerValue, CRON_SECRET)) {
    return NextResponse.next();
  }
  // توكن الإدارة: يفتح أي مسار محمي (سكربتات/مراقبة خارجية)
  if (ADMIN_TOKEN && bearerValue && safeEqual(bearerValue, ADMIN_TOKEN)) {
    return NextResponse.next();
  }
  // كوكي الإدارة: يُضبط بعد Basic ناجح على تنقل صفحة — يفتح مسارات /api فقط
  if (ADMIN_TOKEN && hasAdminCookie && path.startsWith("/api/") && safeEqual(req.cookies.get("admin_token")?.value || "", ADMIN_TOKEN)) {
    return NextResponse.next();
  }

  // بيانات الإدارة غائبة → مغلق (503) بدل أي قيمة افتراضية
  if (!adminConfigured) {
    return new NextResponse(
      "🚨 ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_TOKEN غير مضبوطة — المسارات الإدارية مغلقة. اضبطها في متغيرات البيئة (انظر .env.example)",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const header = req.headers.get("authorization") || "";
  const [scheme, b64] = header.split(" ");
  if (scheme?.toLowerCase() === "basic" && b64 && USER && PASS) {
    let user = "";
    let pass = "";
    try {
      const decoded = atob(b64);
      const idx = decoded.indexOf(":");
      user = idx >= 0 ? decoded.slice(0, idx) : "";
      pass = idx >= 0 ? decoded.slice(idx + 1) : "";
    } catch {}
    if (safeEqual(user, USER) && safeEqual(pass, PASS)) {
      const res = NextResponse.next();
      // تنقل صفحة → اضبط كوكي الإدارة (SameSite=Strict) ليعمل fetch الداخلي حتى بدون Basic مخزّن
      const nav = (req.headers.get("sec-fetch-mode") || "navigate") === "navigate";
      if (ADMIN_TOKEN && nav && !path.startsWith("/api/")) {
        res.cookies.set("admin_token", ADMIN_TOKEN, {
          httpOnly: true,
          secure: process.env.VERCEL_ENV === "production",
          sameSite: "strict",
          maxAge: 43200, // 12 ساعة
          path: "/",
        });
      }
      return res;
    }
    // قوة غاشمة: بيانات دخول خاطئة — عداد في القاعدة يعمل عبر كل النسخ (10 محاولات/IP كل 5 دقائق)
    if (!(await rateLimitDb(`authfail:${clientIp(req)}`, 10, 5 * 60_000))) {
      return new NextResponse("⏳ محاولات دخول كتير جدًا — استنى دقيقة وجرّب تاني", {
        status: 429,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }
  // المنبثق عند فتح صفحة محمية مباشرة من المتصفح (تنقل navigate) —
  // أما طلبات الجافاسكربت للزبائن (صفحة الشحن مثلًا) فترد صامتة بدون أي منبثق.
  const secFetchMode = req.headers.get("sec-fetch-mode") || "navigate";
  return unauthorized("🔒 محمي بكلمة مرور — أدخل اسم المستخدم وكلمة المرور في النافذة المنبثقة", secFetchMode === "navigate");
}

export const config = {
  // Next 16: الـ proxy يعمل على Node.js افتراضيًا — timingSafeEqual و rateLimitDb يعملان مباشرة
  // ملفات الموقع العامة (الفيديو الترويجي والبوستر وصور الأقسام) مفتوحة للزبائن بدون كلمة مرور
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon\\.svg|welcome\\.mp4|welcome-poster\\.jpg|og-poster\\.png|sections/).*)"],
};
