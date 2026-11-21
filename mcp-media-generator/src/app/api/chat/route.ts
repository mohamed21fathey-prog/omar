// ============================================================
// /api/chat — عام للزبائن: مساعد ذكي يجيب عن أسئلة الموقع
// حد استخدام بسيط: 10 رسائل/دقيقة لكل IP + حدود طول
// ============================================================
import { NextResponse } from "next/server";
import { chatAnswer, geminiConfigured, type ChatTurn } from "@/lib/gemini";
import { clientIp, rateLimitDb } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// حدود الاستخدام — عداد في القاعدة يعمل عبر كل نسخ Vercel (الذاكرة لا تكفي)
const CHAT_PER_MINUTE = 10;
const CHAT_PER_DAY = 50; // سقف يومي لحماية حصة Gemini من الاستنزاف

// بديل احتياطي لو الذكاء الاصطناعي غير متاح — أسئلة شائعة جاهزة
function faq(q: string): string {
  const s = q.toLowerCase();
  if (/سعر|أسعار|اسعار|بكام|كام|جنيه|باقة/.test(s))
    return "💰 الباقات: 1000 كريدت = 50 ج • 2000 كريدت = 100 ج • 4000 كريدت = 200 ج — وكل مشهد فيديو 8 ثوانٍ = 15 كريدت بالظبط. من صفحة «شحن الرصيد» 👆";
  if (/دفع|فودافون|انستا|إنستا|تحويل|شحن/.test(s))
    return "الدفع بفودافون كاش أو إنستاباي من صفحة «شحن الرصيد»: حول المبلغ، سجّل طلبك، ووصلك إشعار فوري 👍";
  if (/حلقة|حلقات|نشر|مواعيد|اطلب|اعمل/.test(s))
    return "🎬 تعمل حلقتك في خطوتين: اشحن رصيد من «شحن الرصيد»، بعدين افتح «الاستوديو» واكتب فكرة الحلقة وشخصيات عيلتك — وبتشوف نماذج جاهزة في «أحدث الحلقات» قبل ما تدفع 👀";
  if (/تلوين|رسم|طباعه|طباعة|pdf/.test(s))
    return "🎨 قسم «كتب التلوين» فيه كتب PDF جاهزة للتحميل والطباعة بالجودة الكاملة — تنزيل مباشر من صفحة كل كتاب ✨";
  if (/امن|آمن|أطفال|عيله|عائله|مناسب/.test(s))
    return "👨‍👩‍👧‍👦 المحتوى كله آمن ومناسب للأطفال — الموقع مصمم للعائلات 🛡️";
  if (/مدة|وقت|امتى|متي|كم يوم|بياخد/.test(s))
    return "⏱️ كل مشهد بيتولد في دقائق، والحلقة تتبني مشهدًا مشهدًا قدامك في الاستوديو لحظة بلحظة ⚡";
  if (/تواصل|واتساب|اتصال|شكوى/.test(s))
    return "أهلًا بك anytime! زر الواتساب موجود في صفحة شحن الرصيد وهنرد عليك فورًا 💬";
  return "أنا مساعد كوكب الكرتون 👋 اسألني عن الباقات والأسعار، طرق الدفع (فودافون كاش / إنستاباي)، أو مواعيد الحلقات الجديدة!";
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const day = new Date().toISOString().slice(0, 10);
  // 10 رسائل/دقيقة + 50 رسالة/يوم لكل IP — عداد قاعدة البيانات
  if (!(await rateLimitDb(`chat:m:${ip}`, CHAT_PER_MINUTE, 60_000))) {
    return NextResponse.json({ error: "استنى دقيقة وأسئل تاني 🙂" }, { status: 429 });
  }
  if (!(await rateLimitDb(`chat:d:${day}:${ip}`, CHAT_PER_DAY, 24 * 3600_000))) {
    return NextResponse.json({ error: "وصلت حد أسئلة اليوم — تكلمنا بكرة 🌙" }, { status: 429 });
  }
  let body: { question?: string; history?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const question = (body.question || "").trim().slice(0, 500);
  if (!question) return NextResponse.json({ error: "اكتب سؤالك أولًا" }, { status: 400 });
  // 🛡️ حقن المحادثة: العميل قد يرسل role="bot" ينتحل ردود المساعد — نأخذ رسائل
  // المستخدم فقط من الـ history، وردود المساعد السابقة لا تُؤخذ من العميل أبدًا
  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((t) => t && typeof t.text === "string" && t.role === "user")
        .slice(-6)
        .map((t) => ({ role: "user" as const, text: t.text.slice(0, 500) }))
    : [];

  // 🥇 طبقة ChatGPT — الأولوية الأولى لو المفتاح موجود (ربط ChatGPT = ضيف المفتاح في Vercel فقط)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const SYS = `أنت "مساعد كوكب 🤖" — مساعد موقع «كوكب الكرتون» (حلقات كرتون مخصصة للعائلات بالذكاء الاصطناعي، من مصر).
حقائق ثابتة لا تخترع خارجها: الباقات 1000 كريدت = 50 ج، 2000 كريدت = 100 ج، 4000 كريدت = 200 ج، وكل مشهد فيديو 8 ثوانٍ = 15 كريدت. الدفع فودافون كاش أو إنستاباي من صفحة «شحن الرصيد». في قسم «كتب التلوين» كتب PDF جاهزة للتحميل والطباعة. الاستوديو يبني الحلقة مشهدًا مشهدًا (المشهد 8 ثوانٍ). الدعم بزر واتساب أسفل يمين الصفحة. المحتوى آمن للعائلة بالكامل.
أسلوبك: عربي بسيط ودود، إجابة من سطرين لأربعة، إيموجي مناسب، ووجّه المستخدم للصفحة المناسبة.`;
      const msgs = [{ role: "system", content: SYS },
        ...history.map((t) => ({ role: "user" as const, content: t.text })),
        { role: "user", content: question }];
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: msgs, max_tokens: 400, temperature: 0.6 }),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const j = await r.json();
        const reply = j?.choices?.[0]?.message?.content?.trim();
        if (reply) return NextResponse.json({ answer: reply.slice(0, 1200), source: "chatgpt" });
      }
    } catch { /* سقوط لامع للطبقات التالية */ }
  }

  if (!geminiConfigured()) return NextResponse.json({ answer: faq(question), source: "faq" });
  try {
    const answer = await chatAnswer(question, history);
    return NextResponse.json({ answer: answer.trim().slice(0, 1200), source: "ai" });
  } catch {
    return NextResponse.json({ answer: faq(question), source: "faq" });
  }
}
