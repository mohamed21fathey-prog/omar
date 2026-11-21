"use client";

// 📞 اتصل بنا — واتساب مباشر + إجابات أسرع للأسئلة الشائعة
import { useEffect, useState } from "react";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

const FAQ: Array<{ t: string; d: string }> = [
  { t: "⏱️ بيتم إضافة الرصيد في قد إيه؟", d: "بعد تأكيد التحويل بنضيف الرصيد خلال 24 ساعة كحد أقصى — وغالبًا أسرع بكتير. ابعت مرجع التحويل مع الطلب وسيبقى التتبع سهل من رقم الطلب اللي بيظهر لك بعد الإرسال." },
  { t: "🎨 طلب كتاب تلوين — بيوصل إمتى؟", d: "فورًا: اطلب من قسم كتب التلوين على واتساب ونبعتلك نسخة الـPDF الكاملة عالية الجودة في نفس المحادثة — تطبعها على ورق A4 وتلوّنها مع العيلة." },
  { t: "🎬 حلقتي اتعلقت أو فشلت — أعمل إيه؟", d: "افتح الاستوديو واضغط إعادة توليد للمشهد الفاشل — الرصيد المحجوز بيرجع محفظتك تلقائيًا عند أي فشل. لو المشكلة استمرت ابعتلنا رقم المشهد على واتساب وهنحلها فورًا." },
  { t: "💳 عايز أسترد رصيدي؟", d: "من غير ما تولّد أي مشهد: الاسترداد كامل بدون شروط — راجع صفحة سياسة الاسترداد وابعت طلبك واتساب." },
];

export default function ContactPage() {
  const [wa, setWa] = useState("");
  useEffect(() => {
    fetch("/api/wallets")
      .then((r) => r.json())
      .then((d) => setWa(String(d.admin_whatsapp || "").replace(/[^0-9]/g, "")))
      .catch(() => undefined);
  }, []);

  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">📞 اتصل بنا</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>
        <p className="mb-6 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm leading-relaxed text-cyan-200">
          أسرع تواصل هو واتساب مباشرة مع المشرف — بيرد على طلبات الشحن والكتب والمشاكل التقنية. ومفيش بريد مُهمل ولا تذاكر مكسلة: كل رسالة بتوصل فورًا.
        </p>

        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg text-center">
          <p className="text-3xl">💬</p>
          <h2 className="mt-1 font-bold text-amber-200">واتساب المشرف — الرد خلال ساعات النهار</h2>
          {wa ? (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent("السلام عليكم 🌟 عندي استفسار عن كوكب الكرتون:")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold mt-4 inline-block px-8 py-3 text-base"
            >
              افتح المحادثة على واتساب
            </a>
          ) : (
            <a href="/recharge" className="btn-gold mt-4 inline-block px-8 py-3 text-base">ادخل صفحة الشحن وابعت من زر «اسألنا»</a>
          )}
          <p className="mt-3 text-xs text-slate-500">لو الرابط مش شغال جرب من زر «اسألنا على واتساب» العائم أسفل أي صفحة</p>
        </div>

        <div className="space-y-3 pb-8">
          <h2 className="text-lg font-bold text-amber-200">الأسئلة اللي بتوصلنا أكثر — والإجابة الجاهزة:</h2>
          {FAQ.map((s) => (
            <div key={s.t} className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <h3 className="font-bold text-amber-200">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.d}</p>
            </div>
          ))}
        </div>

        <footer className="border-t border-slate-600/50 py-5 text-center text-xs text-slate-500">
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · أُنشئت الصفحة: 2026-11-20</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/about" className="text-cyan-300 hover:underline">من نحن</a>
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
