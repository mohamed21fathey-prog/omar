"use client";

// 🪐 من نحن — قصة كوكب الكرتون ورؤيته
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

const SECTIONS: Array<{ t: string; d: string }> = [
  { t: "إحنا مين؟", d: "كوكب الكرتون منصة عربية لتصنيع المحتوى الكرتوني العائلي بالذكاء الاصطناعي — بنحوّل أي فكرة قصة قصيرة إلى حلقة فيديو كرتونية كاملة: مشاهد متحركة بصوت عربي، دمج وتحويل آلي، وصورة مصغرة ووصف وهاشتاقات جاهزة للنشر على يوتيوب وتليجرام. كل ده بيحصل داخل الموقع نفسه أوتوماتيكيًا من أول السيناريو لحد الفيديو النهائي." },
  { t: "الفكرة بدأت إزاي؟", d: "بدأنا من سؤال بسيط: ليه المحتوى الكرتوني العربي الجيد قليل ومكلف؟ الاستوديوهات التقليدية بتتطلب فريق كامل وأشهر عمل للحلقة الواحدة. فبنينا مصنع رقمي صغير يشتغل بالذكاء الاصطناعي: يكتب القصة، يقسمها مشاهد، يولّد كل مشهد فيديو 8 ثوانٍ، يدمجهم حلقة واحدة ويجهز حزمة النشر — في دقائق بدل أشهر، وبتكلفة تسمح لأي أسرة أو منتج صغير يبدأ." },
  { t: "بنقدم إيه بالظبط؟", d: "(1) حلقات جاهزة تُنشر يوميًا على قناتنا وتتفرج عليها مجانًا. (2) استوديو شخصي: تعمل فيلمك بنفسك — تكتب فكرتك أو تختار فكرة جاهزة، وتولّد مشاهد بالكريدت، وتنزّل الفيديو النهائي. (3) كتب تلوين للأطفال بصيغة PDF جاهزة للطباعة تُطلب على واتساب وتوصل فورًا. (4) هدية مجانية أسبوعية لكتاب التلوين والأنشطة لكل زائر." },
  { t: "قيمتنا: عائلي أولًا", d: "كل قطعة محتوى على كوكب الكرتون عائلي آمن 100%: بدون عنف، بدون مشاهد مخيفة، وبدون أي كلام غير لائق — والتعليق الصوتي دائمًا بالعربية الفصحى المبسطة المناسبة للصغار. نراجع أسلوب كل قسم قبل النشر، ومش بنجمع أي بيانات من الصغار — إدارة الحسابات للوالدين فقط." },
  { t: "ليه تثق فينا؟", d: "الدفع عبر محافظ مصرية معروفة (فودافون كاش وإنستاباي) بدون أي بطاقات أو بوابات أجنبية، الطلب بيتأكد برسالة واتساب مباشرة مع المشرف، سياسة استرداد واضحة مكتوبة، وكل بياناتك محفوظة مشفرة ولا تُشارك مع أي طرف خارج التوليد نفسه. تجرب قبل ما تدفع: في حلقات مجانية وكتاب هدية تقيّم بيه الجودة." },
];

export default function AboutPage() {
  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">🪐 من نحن — كوكب الكرتون</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>
        <p className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
          مصنع محتوى كرتوني عائلي بالذكاء الاصطناعي — من الفكرة للحلقة الجاهزة للنشر في دقائق، وبصوت عربي دائمًا.
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
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · أُنشئت الصفحة: 2026-11-20</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/contact" className="text-cyan-300 hover:underline">اتصل بنا</a>
            <a href="/cookies" className="text-cyan-300 hover:underline">استخدام الكوكيز</a>
            <a href="/privacy" className="text-cyan-300 hover:underline">سياسة الخصوصية</a>
            <a href="/terms" className="text-cyan-300 hover:underline">الشروط والأحكام</a>
          </div>
        </footer>
      </div>
      <FloatingWhatsApp />
    </div>
  );
}
