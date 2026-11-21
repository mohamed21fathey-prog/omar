// GET /api/youtube/callback — جوجل يرجع هنا بعد موافقتك ويخزن التوكن للأبد
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { exchangeCode } from "@/lib/youtube";
import { sessionHmac } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// كل نص يدخل HTML يُهرَّب — منع XSS المنعكس من معاملات جوجل/الأخطاء
function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function page(title: string, body: string, ok: boolean): Response {
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${title}</title>
<style>body{font-family:system-ui,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#1e293b;border-radius:16px;padding:40px;max-width:520px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
h1{font-size:26px;margin:0 0 12px}a{color:#67e8f9}</style></head>
<body><div class="card"><div style="font-size:52px;margin-bottom:16px">${ok ? "✅" : "❌"}</div>
<h1>${title}</h1><p style="line-height:1.8">${body}</p>
<p style="margin-top:24px"><a href="/episodes">← رجوع لمصنع الحلقات</a></p></div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) {
    return page("لم تتم الموافقة", `ألغيت جوجل التفويض: ${esc(err)}. جرّب مرة أخرى.`, false);
  }
  if (!code) {
    return page("لا يوجد رمز", "لم يصل رمز التأذين من جوجل — ابدأ من صفحة مصنع الحلقات.", false);
  }
  // تحقق state: كوكي موقّع مطابق لمعامل state — يمنع ربط قناة مهاجم (OAuth CSRF)
  const state = url.searchParams.get("state") || "";
  const rawCookie = (req.headers.get("cookie") || "").match(/(?:^|;\s*)yt_state=([^;]+)/)?.[1] || "";
  const [cState, cExp, cSig] = decodeURIComponent(rawCookie).split(".");
  const stateOk = (() => {
    if (!state || !cState || !cExp || !cSig) return false;
    if (state !== cState) return false;
    if (!/^\d{13}$/.test(cExp) || Date.now() > Number(cExp)) return false;
    const expected = sessionHmac(`yt:${cState}.${cExp}`);
    const a = Buffer.from(cSig), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  })();
  const clearState = { name: "yt_state", value: "", path: "/", maxAge: 0 };
  if (!stateOk) {
    const res = page("انتهت صلاحية الطلب", "لم يكتمل تحقق الحماية (state) — ابدأ من جديد من صفحة مصنع الحلقات.", false);
    res.headers.append("set-cookie", "yt_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
    return res;
  }
  try {
    const res = await exchangeCode(url.origin, code);
    const ok = page(
      "تم ربط قناتك بنجاح!",
      `القناة: <b>${esc(res.channel_title || "قناتك على يوتيوب")}</b><br>من الآن الموقع يقدر يرفع الفيديوهات تلقائيًا بدون تدخل منك مرة أخرى.<br>الرفع يبدأ بوضع <b>خاص (Private)</b> دائمًا — تنشر بضغطة من يوتيوب بعد مراجعتك.`,
      true
    );
    ok.headers.append("set-cookie", "yt_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
    return ok;
  } catch (e) {
    const fail = page("فشل الربط", e instanceof Error ? esc(e.message) : "خطأ غير متوقع", false);
    fail.headers.append("set-cookie", "yt_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
    return fail;
  }
}
