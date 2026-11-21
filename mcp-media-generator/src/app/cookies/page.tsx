"use client";

// 🍪 استخدام الكوكيز — إيه اللي بنخزنه على جهازك وبتحكم فيه إزاي
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

const SECTIONS: Array<{ t: string; d: string }> = [
  { t: "الكوكيز إيه أصلًا؟", d: "الكوكيز ملفات صغيرة جدًا يحفظها المتصفح على جهازك عشان الموقع يتذكر معلومات بسيطة عنك بين الصفحات والزيارات. فيها مفيش أي برامج ولا فيروسات — مجرد نص قصير، وتقدر تمسحها في أي وقت من إعدادات المتصفح." },
  { t: "الكوكيز اللي بنستخدمها فعليًا (كوكيز ضرورية واحدة)", d: "كوكيز الجلسة (Session Cookie): بتتشال أول ما تقفل المتصفح، ووظيفتها الوحيدة إبقاء تسجيل دخولك شغال أثناء التنقل بين الصفحات. نوعها HttpOnly — يعني أي كود جافاسكربت (حتى صفحاتنا نفسها) مش قادر يقرأها، وده أعلى حماية متاحة للجلسات." },
  { t: "التخزين المحلي (localStorage) — مش كوكيز بس شبهها", d: "بنحفظ على جهازك حاجتين بسيطتين: اختيارك للثيم الفاتح/الداكن، وكود دعوة صديقك لو دخلت برابط دعوة. الاتنين نص عادي تقدر تمسحهم من إعدادات المتصفح، ومفيش أي معلومات شخصية أو بيانات دفع فيههم." },
  { t: "اللي مفيش منه إطلاقًا ✋", d: "مفيش كوكيز إعلانية، مفيش كوكيز تتبع أو تحليلات جوجل أو فيسبوك بكسل، مفيش بصم (Fingerprinting)، ومفيش أي مزود خطوط خارجي يشتغل وقت التصفح. خط الموقع مستضاف محليًا داخل الموقع نفسه — صفحاتنا بتشحن من سيرفرنا مباشرة." },
  { t: "الإعلانات المستقبلية — احتياط الشفافية", d: "لو فعلنا إعلانات جوجل أدسنس مستقبلًا لدعم تشغيل الموقع، هتضاف كوكيز أدسنس المعتمدة وحدها، وهنحدث الصفحة دي وسياسة الخصوصية قبل تشغيلها فعلًا، وممكن تتحكم في إعلانات جوجل المخصصة من إعدادات إعلانات جوجل الرسمية في أي وقت." },
  { t: "بتحكم فيها إزاي؟", d: "تقدر تمسح أو تمنع الكوكيز من إعدادات المتصفح (Chrome: الإعدادات → الخصوصية → ملفات تعريف الارتباط). لو منعت كوكيز الجلسة هتحتاج تسجل دخول من جديد كل مرة — وكل حاجة تانية في الموقع هتشتغل عادي." },
];

export default function CookiesPage() {
  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">🍪 استخدام الكوكيز — كوكب الكرتون</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>
        <p className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
          قاعدتنا بسيطة: أقل كوكيز ممكنة — واحدة ضرورية للجلسة فقط، وصفر تتبع. الصفحة دي بتشرح كل حاجة بتتخزن على جهازك بصراحة كاملة.
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
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · آخر تحديث: 2026-11-20</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/privacy" className="text-cyan-300 hover:underline">سياسة الخصوصية</a>
            <a href="/terms" className="text-cyan-300 hover:underline">الشروط والأحكام</a>
            <a href="/about" className="text-cyan-300 hover:underline">من نحن</a>
            <a href="/contact" className="text-cyan-300 hover:underline">اتصل بنا</a>
          </div>
        </footer>
      </div>
      <FloatingWhatsApp />
    </div>
  );
}
