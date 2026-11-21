// ============================================================
// /api/payments — طلبات شحن الرصيد
// GET: القائمة | POST: طلب جديد (+واتساب) | PATCH: تأكيد | DELETE: حذف
// ============================================================
import { NextResponse } from "next/server";
import { createPaymentRequest, listPaymentRequests, setPaymentStatus, deletePaymentRequest, getPaymentRequest, getPaymentReceipt, confirmPaymentAtomically } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { waLink } from "@/lib/notify";
import { creditUser, creditsForAmount, getSessionUser } from "@/lib/auth";
import { clientIp, rateLimitDb } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const METHOD_NAMES: Record<string, string> = { vodafone: "فودافون كاش", instapay: "إنستاباي", visa: "فيزا / تحويل بنكي", paypal: "PayPal" };
// سقف مبلغ الطلب الواحد — حماية من أخطاء الإدخال وإساءة الاستخدام
const MAX_PAYMENT_EGP = parseFloat(process.env.MAX_PAYMENT_EGP || "699");

export async function GET(req: Request): Promise<Response> {
  try {
    // جلب إيصال واحد عند الطلب فقط — القوائم لا تحمل صور base64 (حجم Turso)
    const id = new URL(req.url).searchParams.get("receipt_id");
    if (id) {
      const receipt = await getPaymentReceipt(String(id));
      return NextResponse.json({ id, receipt });
    }
    return NextResponse.json({ requests: await listPaymentRequests() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  // حماية من السبام: 3 طلبات كحد أقصى لكل IP كل 10 دقائق (عداد في القاعدة — يعمل عبر كل النسخ)
  if (!(await rateLimitDb(`pay:${clientIp(req)}`, 3, 10 * 60_000))) {
    return NextResponse.json({ error: "⚠️ ممكن ترسل 3 طلبات كل 10 دقائق بس — استنى شوية وجرّب تاني" }, { status: 429 });
  }
  let body: { name?: string; method?: string; amount?: string; reference?: string; wallet_from?: string; receipt?: string; hp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  // حقل الفخ البصري: روبوتات السبام تعبيه — البشر لا يرونه
  if ((body.hp || "").trim()) return NextResponse.json({ ok: true }); // تجاهل صامت
  const name = (body.name || "").trim();
  const method = (body.method || "").trim();
  const amount = (body.amount || "").trim();
  const reference = (body.reference || "").trim();
  const walletFrom = (body.wallet_from || "").trim().replace(/\s+/g, "");
  const receipt = (body.receipt || "").trim();
  if (!name) return NextResponse.json({ error: "⚠️ اكتب اسمك" }, { status: 400 });
  if (!METHOD_NAMES[method]) return NextResponse.json({ error: "⚠️ اختر طريقة الدفع" }, { status: 400 });
  if (!amount || !/^[0-9]+(\.[0-9]+)?$/.test(amount)) return NextResponse.json({ error: "⚠️ اكتب مبلغًا صحيحًا" }, { status: 400 });
  if (amount.length > 12 || parseFloat(amount) > MAX_PAYMENT_EGP) {
    return NextResponse.json({ error: `⚠️ أقصى مبلغ للطلب الواحد هو ${MAX_PAYMENT_EGP} جنيه — قسّم التحويل لو أكبر` }, { status: 400 });
  }
  if (walletFrom && !/^[0-9@A-Za-z.\-_\u0600-\u06FF ]{4,40}$/.test(walletFrom)) return NextResponse.json({ error: "⚠️ رقم المحفظة المحوّل منها غير صالح (رقم فودافون أو عنوان إنستاباي)" }, { status: 400 });
  // الإيصال اختياري: صورة فقط (data URL) وبحد أقصى ≈ 500KB بعد الترميز
  if (receipt && (!/^data:image\/(png|jpe?g|webp);base64,/.test(receipt) || receipt.length > 700_000)) {
    return NextResponse.json({ error: "⚠️ صورة الإيصال لازم تكون PNG/JPEG/WebP وأقل من 500KB" }, { status: 400 });
  }

  try {
    // لو الزبون مسجل حساب — الطلب يتربط بحسابه ويظهر في صفحة «حسابي»
    const user = await getSessionUser(req);
    let item;
    try {
      item = await createPaymentRequest(name, method, amount, reference.slice(0, 80), user?.id ?? null, walletFrom.slice(0, 30) || null, receipt || null);
    } catch (e) {
      // فهرس فريد على مرجع التحويل — نفس العملية لا تُسجَّل مرتين
      if (/UNIQUE constraint failed/i.test(String((e as Error)?.message || e))) {
        return NextResponse.json({ error: "⚠️ مرجع التحويل ده مسجل من قبل — لو دي عملية جديدة اكتب المرجع الصحيح من فودافون/إنستاباي" }, { status: 409 });
      }
      throw e;
    }
    const label = METHOD_NAMES[method];
    const text = `💳 طلب شحن جديد — كوكب الكرتون\n👤 ${name}${user ? ` (${user.username})` : ""}\n💳 ${label}\n💰 ${amount}\n📱 المحفظة المحوّل منها: ${walletFrom || "بدون"}\n🔖 مرجع: ${reference || "بدون"}${receipt ? "\n🖼️ فيه صورة إيصال مرفقة في اللوحة" : ""}\n⏳ الحالة: في الانتظار`;
    const s = await getSettings();
    const link = waLink(s.admin_whatsapp || "", text);
    // رقم طلب قصير للتواصل + وقت متوقع واضح لإضافة الرصيد
    return NextResponse.json({ ok: true, item, wa_link: link, request_no: item.id.slice(0, 8).toUpperCase(), eta: "بعد تأكيد التحويل بنضيف الرصيد خلال 24 ساعة كحد أقصى — وغالبًا أسرع بكتير" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "فشل حفظ الطلب" }, { status: 500 });
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { id?: string; status?: string };
    const id = String(body.id || "");
    const to = body.status === "confirmed" ? "confirmed" : body.status === "rejected" ? "rejected" : "pending";

    if (to === "confirmed") {
      // تأكيد ذري داخل transaction: من ينتقل status!='confirmed' → confirmed يفوز بالشحن
      // (طلبان متزامنان أو تبديل confirmed→pending→confirmed لا يكرر الشحن أبدًا)
      const current = id ? await getPaymentRequest(id) : null;
      const credits = current ? creditsForAmount(current.amount) : 0;
      const { claimed, request } = await confirmPaymentAtomically(id, credits);
      if (!claimed) {
        return NextResponse.json({ ok: true, already: true, credited: 0, warning: "الطلب مؤكد من قبل — لم يتكرر الشحن" });
      }
      let credited = 0;
      let warning: string | null = null;
      if (request?.user_id && credits > 0) {
        credited = credits;
        // 💰 لا مكافآت إحالة — الشحن يعادل الباقة بالضبط (منع أي رصيد مجاني تلقائي)
      } else if (!request?.user_id) {
        // طلب زائر بدون حساب — واضح ونعلن بدل ok صامتة
        warning = "طلب زائر بدون حساب — لم يُشحن رصيد آليًا. أنشئ الحساب ثم أعد الطلب أو اشحن يدويًا من لوحة الأدمن";
      }
      return NextResponse.json({ ok: true, credited, ...(warning ? { warning } : {}) });
    }
    // rejected / pending — تحديث حالة عادي
    const ok = await setPaymentStatus(id, to);
    return NextResponse.json({ ok });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "JSON غير صالح" }, { status: 400 });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { id?: string };
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "معرف الطلب مطلوب" }, { status: 400 });
    // زبون بجلسة: يحذف طلبه الخاص فقط — والمعّلق فقط (المؤكد سجل مالي محفوظ)
    const user = await getSessionUser(req);
    if (user) {
      const item = await getPaymentRequest(id);
      if (!item) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      if (item.user_id !== user.id) return NextResponse.json({ error: "⚠️ هذا الطلب ليس من حسابك" }, { status: 403 });
      if (item.status === "confirmed") return NextResponse.json({ error: "⚠️ الطلب مؤكد وتم شحنه — لا يمكن حذفه من السجلات" }, { status: 400 });
      const ok = await deletePaymentRequest(id);
      return NextResponse.json({ ok });
    }
    // بدون جلسة → الإدارة فقط (Basic Auth عبر proxy) — تحذف أي طلب
    const ok = await deletePaymentRequest(id);
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
}
