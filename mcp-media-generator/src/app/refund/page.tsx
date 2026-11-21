"use client";

// 🔄 سياسة الاسترداد — شروط واضحة مكتوبة
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

const RULES: Array<{ t: string; d: string }> = [
  { t: "✅ استرداد كامل قبل الاستخدام", d: "لو لم تُستخدم أي كريدت من رصيدك، ولن تمر أكثر من 48 ساعة على تأكيد الشحن، لك الحق في استرداد كامل للمبلغ بنفس وسيلة الدفع التي حوّلت منها (فودافون كاش أو إنستاباي) خلال 3 أيام عمل." },
  { t: "⚠️ بعد بدء الاستخدام", d: "الكريدت الذي بدأ يُستخدم في توليد مشاهد لا يُسترد، لأن التكلفة الفعلية للجيل أُنفقت لحظة التوليد. المتبقي غير المستخدم في رصيدك يظل صالحًا للاستخدام في أي وقت بدون انتهاء صلاحية." },
  { t: "🛠️ الأعطال التقنية", d: "لو تعطل توليد مشهد بسبب خطأ تقني من عندنا، نعيد المحاولة تلقائيًا أولًا. لو فشلت إعادة المحاولة نهائيًا، يُرد كريدت المشهد الفاشل إلى رصيدك." },
  { t: "🔁 طريقة تقديم الطلب", d: "أرسل رسالة واتساب من زر «اسألنا» أسفل الصفحة، أو من صفحة الشحن، فيها: رقم الطلب أو اسم الحساب + المبلغ + سبب الاسترداد. نرد على كل الطلبات خلال 24 ساعة." },
  { t: "❌ حالات لا يشملها الاسترداد", d: "مشاهد مكتملة وفق الوصف المتفق عليه، أو طلبات بعد 48 ساعة من التأكيد في حال استخدام أي كريدت، أو إساءة الاستخدام (طلب تجريبي متكرر بحسابات وهمية)." },
];

export default function RefundPage() {
  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">🔄 سياسة الاسترداد — كوكب الكرتون</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>
        <p className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
          نحن مشروع صغير بنشتغل بالثقة. الكريدت مخصص للاستخدام على الموقع، ودي الشروط الواضحة اللي بنلتزم بيها في أي استرداد — مكتوبة هنا قبل ما تدفع جنيه واحد.
        </p>
        <div className="space-y-3 pb-8">
          {RULES.map((r) => (
            <div key={r.t} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <h2 className="font-bold text-amber-200">{r.t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{r.d}</p>
            </div>
          ))}
        </div>
        <footer className="border-t border-slate-600/50 py-5 text-center text-xs text-slate-500">
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · آخر تحديث للسياسة: 2026-11-16</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/terms" className="text-cyan-300 hover:underline">الشروط والأحكام</a>
            <a href="/privacy" className="text-cyan-300 hover:underline">سياسة الخصوصية</a>
            <a href="/recharge" className="text-cyan-300 hover:underline">شحن الرصيد</a>
          </div>
        </footer>
        <FloatingWhatsApp />
      </div>
    </div>
  );
}
