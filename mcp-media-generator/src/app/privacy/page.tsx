"use client";

// 🔒 سياسة الخصوصية — إيه اللي بنجمعه وإزاي بنحفظه
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

const SECTIONS: Array<{ t: string; d: string }> = [
  { t: "إيه البيانات اللي بنجمعها؟", d: "الحد الأدنى المطلوب لتشغيل الخدمة: (1) عند إنشاء حساب: البريد الإلكتروني واسم المستخدم وكلمة مرور مشفرة بالكامل. (2) عند طلب الشحن: الاسم، رقم المحفظة التي حوّلت منها، المبلغ، مرجع عملية التحويل، وصورة الإيصال إن أرفقتها — كلها اختيارية عدا الاسم والمبلغ. (3) سجل طلباتك وأرصدتك وطلبات التوليد." },
  { t: "الفئات الصغيرة وحمايتها", d: "الموقع موجه لجميع أفراد الأسرة، وإدارة الحساب للبالغين (الوالدين ومنتجي المحتوى). لا نطلب أي بيانات شخصية من الصغار مباشرة. اسم البطل أو تفاصيله تظهر فقط إن كنت أنت من يكتبها في وصف القصة التي تولدها." },
  { t: "فين بتتخزن؟", d: "في قاعدة بيانات سحابية (Turso). صور الإيصالات وبيانات الدفع تُحفظ في مكان خاص داخل القاعدة لا يظهر إلا للمشرف في لوحة الإدارة المحمية بكلمة مرور — لا يمكن لأي زائر أو مشترك آخر رؤيتها بأي طريقة." },
  { t: "الكوكيز والأدوات الخارجية", d: "نستخدم كوكيز للجلسة فقط (تسجيل الدخول — HttpOnly محمي من الجافاسكربت)، وتخزين محلي (localStorage) لتذكر كود دعوة صديقك واختيار الثيم الفاتح/الداكن. لا يوجد أي تتبع إعلاني أو أدوات قياس تحليلية خارجية، وخط الموقع مستضاف محليًا داخل الموقع نفسه (لا يوجد طلب لخطوط جوجل وقت التصفح)." },
  { t: "مين بيشارك البيانات؟", d: "لا نبيع بياناتك لأي جهة. لكن التشغيل الفعلي يعتمد على خدمات خارجية تصلها بيانات محدودة بالضرورة لأداء المهمة التي طلبتها: (1) مزود التوليد kie.ai و/أو CometAPI — يصلهم نص القصة/الوصف لتوليد الصورة أو الفيديو. (2) مساعد الأسئلة يعمل عبر Gemini (Google) — يصلها نص سؤالك فقط. (3) Vercel لاستضافة الموقع وTurso لقاعدة البيانات. (4) خدمة الدمج الشقيقة تنزّل المقاطع مؤقتًا لدمجها ثم تنظفها. (5) عند تفعيل النشر: Telegram لإرسال الحلقة لقناتنا، وYouTube (OAuth) لرفع الفيديوهات بحساب المشرف. (6) عند طلب الشحن يُفتح للمشرف رابط واتساب جاهز يحتوي ملخص الطلب فقط — لا يوجد أي إرسال آلي أو خدمات إشعارات خارجية. مفاتيح التوليد الخاصة بالمشتركين تُخزَّن مشفرة (AES-256-GCM) ولا تُرسل إلا للمزود الذي اخترته للتنفيذ." },
  { t: "حقوقك", d: "تقدر تطلب في أي وقت: نسخة من بياناتك، تصحيحها، أو حذف حسابك وسجل طلباته نهائيًا — برسالة واتساب من زر «اسألنا» وسننفذ خلال 7 أيام كحد أقصى." },
];

export default function PrivacyPage() {
  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">🔒 سياسة الخصوصية — كوكب الكرتون</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>
        <p className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200">
          بنجمع أقل قدر ممكن من البيانات، ومفيش إعلانات ولا تتبع. الصفحة دي بتوضح بالظبط إيه اللي بنحفظه وإزاي.
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
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · آخر تحديث للسياسة: 2026-11-18</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/terms" className="text-cyan-300 hover:underline">الشروط والأحكام</a>
            <a href="/refund" className="text-cyan-300 hover:underline">سياسة الاسترداد</a>
            <a href="/recharge" className="text-cyan-300 hover:underline">شحن الرصيد</a>
          </div>
        </footer>
        <FloatingWhatsApp />
      </div>
    </div>
  );
}
