"use client";

// 📜 الشروط والأحكام — استخدام موقع كوكب الكرتون
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

const SECTIONS: Array<{ t: string; d: string }> = [
  { t: "١. طبيعة الخدمة", d: "كوكب الكرتون موقع يولّد حلقات كرتون قصيرة بالذكاء الاصطناعي. الشغل على طلب العميل: تشحن رصيدًا بالكريدت، وكل مشهد فيديو (8 ثوانٍ) يُخصم عليه 15 كريدت. نماذج جاهزة معروضة في قسم «أحدث الحلقات» للمعاينة قبل الدفع." },
  { t: "٢. الحساب والرصيد", d: "أنت مسؤول عن الحفاظ على سرية بيانات دخولك. الرصيد محفوظ في حسابك ولا ينتقل بين الحسابات، ولا توجد صلاحية لتحويل الكريدت من حساب لآخر. الرصيد صالح للاستخدام بدون انتهاء صلاحية." },
  { t: "٣. الدفع والشحن", d: "الدفع بالجنيه المصري عبر فودافون كاش أو إنستاباي فقط. بعد تحويل المبلغ تسجل الطلب في صفحة الشحن (بيانات الاسم ورقم المحفظة المحوّل منها والمبلغ، وصورة الإيصال اختيارية). بعد تأكيد التحويل من المشرف يُضاف الرصيد خلال 24 ساعة كحد أقصى — وغالبًا أسرع بكثير. أي تحويل بدون تسجيل طلب قد يؤخر التأكيد." },
  { t: "٤. الاستخدام المسموح", d: "الحلقات التي تولدها بحسابك يمكنك استخدامها ونشرها على قنواتك أو حساباتك. ممنوع استخدام الموقع لتوليد محتوى مخالف للقانون أو غير لائق بالمحتوى العائلي الآمن، أو محتوى ينسخ شخصيات أو علامات تجارية محفوظة حقوقها لغيرك. نرفض ونجمد أي حساب مخالف دون رد للكريدت المستخدم." },
  { t: "٥. جودة التوليد", d: "التوليد بالذكاء الاصطناعي ونتائجه تختلف من مشهد لآخر. بنكتب وصف البطل بنفس الكلمات في كل مشهد لثبات الشكل، لكن لا نضمن تطابقًا بنسبة 100%. جودة الإخراج 480p — مناسبة للموبايل والشورتس." },
  { t: "٦. تعديل الأسعار أو الخدمة", d: "قد نعدل الأسعار أو آلية العمل مستقبلًا. أي تعديل لا يمس رصيدك المشترى مسبقًا — الكريدت الموجود في حسابك يظل بنفس قيمته." },
  { t: "٧. حدود المسؤولية", d: "الخدمة مقدمة «كما هي». لسنا مسؤولين عن انقطاع خدمات مزودي التوليد الخارجيين، مع التزامنا بإعادة محاولة المشاهد الفاشلة أو رد كريدتها وفق سياسة الاسترداد." },
  { t: "٨. التواصل", d: "أي سؤال أو مشكلة في الشروط: زر «اسألنا على واتساب» أسفل الصفحة، أو من صفحة الشحن." },
];

export default function TermsPage() {
  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">📜 الشروط والأحكام — كوكب الكرتون</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>
        <p className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
          باستخدامك الموقع أو شحنك أي رصيد، فأنت توافق على الشروط دي. بنكتبها بلغة واضحة من غير تعقيد قانوني.
        </p>
        <div className="space-y-3 pb-8">
          {SECTIONS.map((s) => (
            <div key={s.t} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <h2 className="font-bold text-amber-200">{s.t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.d}</p>
            </div>
          ))}
        </div>
        <footer className="border-t border-slate-600/50 py-5 text-center text-xs text-slate-500">
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · آخر تحديث للشروط: 2026-11-16</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/privacy" className="text-cyan-300 hover:underline">سياسة الخصوصية</a>
            <a href="/refund" className="text-cyan-300 hover:underline">سياسة الاسترداد</a>
            <a href="/recharge" className="text-cyan-300 hover:underline">شحن الرصيد</a>
          </div>
        </footer>
        <FloatingWhatsApp />
      </div>
    </div>
  );
}
