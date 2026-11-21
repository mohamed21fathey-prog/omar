"use client";

// ============================================================
// 🚀 كوكب الكرتون — الصفحة الرئيسية للزبائن (خلفية كونية داكنة «جامد»)
// العرض الواضح: حلقات كرتون مخصصة بطلب العميل بالكريدت + نماذج جاهزة للمشاهدة
// أحدث الحلقات من القاعدة (تختفي لو مفيش محتوى) + الباقات + طريقة الطلب + FAQ
// ============================================================
import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import dynamic from "next/dynamic";
import Script from "next/script";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import UsageStats from "@/components/UsageStats";
import ThemeToggle from "@/components/ThemeToggle";
import { PACKAGES } from "@/lib/packages";

// 📢 فتحة الإعلان الظاهرة — أدسنس لو مفعّل من الإعدادات، وإلا بانر داخلي يروّج للباقات فورًا
function AdSlot() {
  const [ad, setAd] = useState<{ client: string; slot: string } | null>(null);
  useEffect(() => {
    fetch("/api/ads").then((r) => r.json())
      .then((d) => {
        if (d?.adsense_client && d?.adsense_slot) setAd({ client: d.adsense_client, slot: d.adsense_slot });
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!ad) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch { /* أدسنس غير جاهز بعد */ }
  }, [ad]);
  if (ad) {
    return (
      <div className="mx-auto mb-10 max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-black/30 px-2 py-3">
        <Script id="adsense-loader" strategy="afterInteractive" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ad.client}`} crossOrigin="anonymous" />
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client={ad.client}
          data-ad-slot={ad.slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }
  // البانر الداخلي (باقة 1000 كريدت المدوّرة) أُزيل بطلب المالك — الأولوية للإعلان فقط، والباقات في قسمها تحت
  return null;
}

// 💬 المساعد الذكي يُحمَّل مؤجلًا (chunk منفصل بعد استقرار الصفحة) — يوفّر حجمًا من JS الحِمل الأولي

interface Episode {
  title: string;
  url: string;
  thumb_url: string;
  updated_at: string | null;
  scenes?: number;
}

// رابط تنزيل فيديو عبر البروكسي المسموح — يفرض التحميل بدل الفتح
function dl(url: string, name: string): string {
  return `/api/download?u=${encodeURIComponent(url)}&f=${encodeURIComponent(name)}`;
}

// توحيد التسعير: المشهد الواحد (8 ثوانٍ، 480p) = 15 كريدت بالظبط — بدون أي مدى
// الباقات الرسمية من مصدر واحد: src/lib/packages.ts (50ج→1000، 100ج→2000، 200ج→4000)
const SCENE_COST = 15;

// طريقة الطلب — بصدق كامل: التأكيد يدوي والرصيد يضاف خلال 24 ساعة كحد أقصى
const STEPS = [
  { t: "💳 اختار باقتك وادفع", d: "فودافون كاش أو إنستاباي من صفحة الشحن — بالجنيه المصري ومن غير تعقيد" },
  { t: "📝 سجّل طلبك", d: "اكتب اسمك ورقم المحفظة اللي حوّلت منها والمبلغ (وصورة الإيصال اختيارية) — بعد تأكيد التحويل بنضيف الرصيد خلال 24 ساعة كحد أقصى، وغالبًا أسرع بكتير" },
  { t: "🎬 استلم وشاهد", d: "حلقتك بتتولد مشهدًا بمشهد وبتتدمج، وتظهر في قسم «أحدث الحلقات» — والرصيد المتبقي يظهر في حسابك لحظة بلحظة" },
];

const FEATURES = [
  { icon: "🎨", t: "شخصية ثابتة", d: "بطل القصة «عمر» بنفس شكله وملابسه في كل مشهد — بوصف ثابت مدروس" },
  { icon: "💰", t: "أسعار محلية", d: "ادفع بالجنيه المصري بمحفظتك — باقة 50 جنيه تكفي 66 مشهدًا كاملًا" },
  { icon: "🔍", t: "شوف قبل ما تدفع", d: "نماذج الحلقات الجاهزة معروضة في الأعلى بمشغل مباشر — تعرف جودة الشغل قبل ما تنفق جنيه" },
  { icon: "💬", t: "دعم فوري", d: "مساعد ذكي يجاوبك هنا في الموقع + زر واتساب ثابت في كل الصفحات" },
];

// 🎛️ الأقسام الأحد عشر — كل قسم معروض كحلقة تشجيعية تفتح باب الإنتاج مباشرة
const SECTIONS = [
  { key: "kids_edu", emoji: "🎓", title: "تعليمية للصغار", pitch: "حلقات تشرح المفاهيم بلغة مبهجة وألوان زاهية — تكرار ممتع ونهاية مشجعة", grad: "from-blue-600 via-indigo-600 to-purple-700" },
  { key: "nursery", emoji: "🔤", title: "محتوى الحضانة", pitch: "الحروف والأرقام والألوان والأشكال — عنصر واحد واضح في كل مشهد لعمر 2-5 سنوات", grad: "from-purple-600 via-fuchsia-600 to-pink-600" },
  { key: "curriculum", emoji: "📚", title: "شرح المناهج والدروس", pitch: "درس بدرس بخطوة خطوة — مثال عملي في كل مشهد وخلاصة مراجعة في النهاية", grad: "from-indigo-600 via-blue-700 to-cyan-600" },
  { key: "adults_edu", emoji: "🧠", title: "تعليمية للكبار", pitch: "معلومات عملية مركزة بعرض احترافي أنيق — بدون مبالغة كرتونية", grad: "from-slate-700 via-blue-800 to-indigo-700" },
  { key: "cartoon_film", emoji: "🎬", title: "أفلام كرتون للعائلة", pitch: "فيلم كامل بشخصيات ثابتة وبناء درامي: بداية ومشكلة وحل — خلفيات سينمائية", grad: "from-amber-500 via-orange-600 to-rose-600" },
  { key: "adventure", emoji: "🕵️", title: "مغامرات وغموض وتشويق", pitch: "تشنّج متصاعد وألغاز بصرية ونهاية مفاجئة مرضية — مناسبة للعيلة كلها", grad: "from-emerald-600 via-teal-700 to-cyan-700" },
  { key: "ads", emoji: "📢", title: "إعلانات وتسويق", pitch: "إعلان يبيع فعلًا — خطاف جذاب في أول ثانيتين ودعوة إجراء واضحة", grad: "from-pink-600 via-rose-600 to-fuchsia-700" },
  { key: "social", emoji: "📱", title: "عامة وسوشيال ميديا", pitch: "شورتس جاهزة للنشر — إيقاع سريع ونص كبير مناسب للموبايل", grad: "from-cyan-500 via-sky-600 to-blue-700" },
  { key: "puzzles", emoji: "🧩", title: "ألغاز وتحديات", pitch: "لغز في كل مشهد وتلميحات متدرجة — والمشاهد يجرب يحل قبل كشف الإجابة في النهاية", grad: "from-lime-600 via-green-700 to-emerald-700" },
  { key: "bedtime", emoji: "🌙", title: "قصص قبل النوم", pitch: "حكاية هادئة بصوت دافئ وإضاءة خافتة — تنهيها بجملة نوم مطمئنة لأصغر أفراد العائلة", grad: "from-indigo-800 via-violet-800 to-slate-800" },
  { key: "songs", emoji: "🎵", title: "أغاني أطفال", pitch: "أغنية قصيرة بإيقاع حماسي وحرف متكرر يردد عليه الطفل — تعلم ومرح في نفس اللحظة", grad: "from-rose-500 via-red-600 to-orange-700" },
];

const FAQ = [
  { q: "هل محتاج أي إعدادات تقنية عشان أشتغل؟", a: `لأ خالص — رصيد الموقع هو وسيلة الحساب: المشهد = ${SCENE_COST} كريدت بيُخصم من رصيدك مباشرة، ومش محتاج تعمل أي إعداد أو تضيف أي شيء. ولو التوليد واقف مؤقتًا للصيانة، رصيدك محفوظ بالكامل ولو حصل أي خصم بلا نتيجة بيرجع تلقائيًا.` },
  { q: "لو فشل التوليد الرصيد بيترد؟", a: "أيوه — لو فشل بدء التوليد أو فشلت المهمة لدى المزود بعد قبولها، رصيدك بيرجع تلقائيًا بالكامل وسجل الحركة بيبان في قاعدة البيانات. مفيش خصم بلا نتيجة." },
  { q: "الكريدت بيُحسب إزاي؟", a: `رصيد الموقع هو المحرك لكل شيء: المشهد الواحد (فيديو 8 ثوانٍ بجودة 480p مناسبة للموبايل والشورتس) = ${SCENE_COST} كريدت بالظبط وبيخصم من رصيدك مباشرة. يعني باقة 50ج (1000 كريدت) = 66 مشهدًا، و100ج (2000 كريدت) = 133 مشهدًا، و200ج (4000 كريدت) = 266 مشهدًا — ولو مشهد فشل رصيده بيرجع تلقائيًا. الرصيد المتبقي يظهر لحظة بلحظة في صفحة حسابك.` },
  { q: "إزاي أدفع؟", a: "فودافون كاش أو إنستاباي — من صفحة «شحن الرصيد» هتلاقي الأرقام واسم صاحب الحساب وزر النسخ، وبعد التحويل سجّل طلبك في نفس الصفحة (الاسم + رقم المحفظة المحوّل منها + المبلغ، وصورة الإيصال اختيارية)." },
  { q: "الحلقات بتتنشر إمتى؟", a: "قسم «أحدث الحلقات» بنحدّثه أول ما تكتمل أي حلقة جديدة — تابع القسم، والحلقات الجديدة بتظهر فيه أول بأول، بدون مواعيد محددة." },
  { q: "الرصيد بيتضاف إمتى؟", a: "بعد تأكيد التحويل بنضيف الرصيد خلال 24 ساعة كحد أقصى — وغالبًا أسرع بكتير. بنأكد كل طلب يدويًا للتأكد من وصول التحويل، وده بيحميك أنت كمان." },
  { q: "إيه أنواع المحتوى اللي أقدر أصنعه؟", a: "11 قسمًا جاهزًا في الاستوديو: تعليمية للصغار، محتوى الحضانة (حروف وأرقام وألوان وأشكال)، شرح المناهج والدروس، تعليمية للكبار، أفلام كرتون للعائلة، مغامرات وغموض وتشويق، إعلانات وتسويق، فيديوهات عامة للسوشيال ميديا، ألغاز وتحديات، قصص قبل النوم، وأغاني أطفال — اختار النوع والأسلوب يُضبط أوتوماتيكيًا، أو اكتب قصتك الحرّة." },
  { q: "شكل الشخصية بيتغير بين المشاهد؟", a: "لأ — وصف البطل بيتكتب حرفيًا بنفس الكلمات في كل مشهد عشان شكله يفضل ثابت من أول مشهد لآخر حلقة." },
  { q: "الحلقات مناسبة لأي عمر؟", a: "نعم — كل المحتوى عائلي آمن ومصمم يناسب جميع أفراد العائلة: صغار وكبار، بدون عنف أو مشاهد مخيفة. وبتتولد شورتس عمودي للموبايل أو عرضي للتلفزيون — أنت تختار." },
];

export default function Home() {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [me, setMe] = useState<{ username: string; credits: number } | null>(null);
  // المدة الحقيقية لكل حلقة — تُقرأ من اللاعب نفسه عند تحميل البيانات (بدون أي تخزين)
  const [durs, setDurs] = useState<Record<string, number>>({});
  // ⭐ تقييم الموقع — متوسط حقيقي من مستخدمين مسجلين فقط (مخفي لو مفيش تقييمات)
  const [ratingData, setRatingData] = useState<{ avg: number; count: number } | null>(null);
  // 💬 رقم واتساب المشرف — لزر الطلب المباشر بالباقات ونموذج الفكرة (يخفيهما لو لم يُضبط)
  const [waPhone, setWaPhone] = useState("");
  // المساعد الذكي يُحمَّل بعد استقرار الصفحة (تأجيل JS غير الحرِج)
  // 🚀 نموذج الفكرة المبسط — بداية الطلب بضغطة واحدة
  const [ideaName, setIdeaName] = useState("");
  const [ideaPhone, setIdeaPhone] = useState("");
  const [ideaText, setIdeaText] = useState("");

  const waLink = (text: string) => `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
  const sendIdea = () => {
    if (!ideaText.trim()) return;
    const text = `أهلاً 👋 أنا ${ideaName.trim() || "زبون جديد"}\nفكرة حلقتي: ${ideaText.trim()}\nواتسابي للتواصل: ${ideaPhone.trim() || "(نفس الرقم ده)"}`;
    window.open(waLink(text), "_blank", "noopener");
  };

  // مدة مقروءة: أقل من دقيقة = ثوانٍ، وأكثر = دقيقة وثانية
  const fmtDur = (s: number) => (s < 60 ? `≈${Math.round(s)} ثوانٍ` : `${Math.floor(s / 60)} د ${Math.round(s % 60)} ث`);
  // تاريخ النشر بصيغة عربية مقروءة: «17 نوفمبر 2026»
  const fmtDate = (iso: string | null) => {
    try {
      return iso ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)) : "";
    } catch { return (iso || "").slice(0, 10); }
  };
  const grabDur = (url: string) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0) setDurs((p) => (p[url] ? p : { ...p, [url]: d }));
  };

  useEffect(() => {
    // 🎁 نظام الإحالة — تخزين كود الدعوة من الرابط (?ref=) حتى التسجيل في /account
    try {
      const m = new URLSearchParams(window.location.search).get("ref");
      if (m) localStorage.setItem("mg_ref", m);
    } catch {}
    fetch("/api/public-episodes")
      .then((r) => r.json())
      .then((d) => setEpisodes(Array.isArray(d.episodes) ? d.episodes : []))
      .catch(() => setEpisodes([]));
    // رصيد الزبون المسجل — يظهر في الشريط العلوي علشان يعرف فاضل له كام
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) setMe({ username: d.user.username, credits: d.user.credits ?? 0 }); })
      .catch(() => undefined);
    // ⭐ التقييم الحقيقي — يظهر على الرئيسية فقط لو فيه تقييمات فعلية
    fetch("/api/rate")
      .then((r) => r.json())
      .then((d) => { if (d.count > 0) setRatingData({ avg: d.avg, count: d.count }); })
      .catch(() => undefined);
    // 💬 رقم واتساب المشرف من الإعدادات — لأزرار الطلب المباشر
    fetch("/api/wallets")
      .then((r) => r.json())
      .then((d) => setWaPhone(String(d.admin_whatsapp || "").replace(/[^0-9]/g, "")))
      .catch(() => undefined);
  }, []);

  const [visits, setVisits] = useState<number | null>(null);
  useEffect(() => {
    // 👥 عداد الزوار الحقيقي — زيارة واحدة لكل متصفح يوميًا (localStorage) والإجمالي من قاعدة البيانات
    const vkey = `mg_visit_${new Date().toISOString().slice(0, 10)}`;
    let seen: string | null = null;
    try { seen = window.localStorage.getItem(vkey); } catch { /* خصوصية المتصفح */ }
    const vreq = seen
      ? fetch("/api/visits").then((r) => r.json())
      : fetch("/api/visits", { method: "POST" })
          .then((r) => r.json())
          .then((d) => { try { window.localStorage.setItem(vkey, "1"); } catch { /* تجاهل */ } return d; });
    vreq.then((d) => setVisits(Number(d.total) || 0)).catch(() => undefined);
  }, []);

  const hasEpisodes = !!episodes && episodes.length > 0;

  return (
    <div dir="rtl" className="lux min-h-screen text-slate-200">
      <style>{`
        @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes twinkle{0%,100%{opacity:.9}50%{opacity:.25}}
      `}</style>

      {/* نجوم الكون المتلألئة */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        {[
          [12, 18], [78, 12], [30, 8], [88, 40], [8, 55], [65, 70], [45, 88], [92, 78], [22, 75], [55, 30],
        ].map(([x, y], i) => (
          <span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-amber-200"
            style={{ left: `${x}%`, top: `${y}%`, animation: `twinkle ${2.5 + (i % 4)}s ease-in-out infinite` }}
          />
        ))}
      </div>

      {/* الشريط العلوي — مُقلَّص الارتفاع */}
      <nav className="sticky top-0 z-40 border-b border-amber-500/25 bg-black/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <a href="/" className="flex items-center gap-1.5 text-base font-black">
            <span className="text-xl">🪐</span>
            <span className="neon-title">كوكب الكرتون</span>
            <span className="hidden text-[10px] font-bold tracking-[0.2em] text-amber-500/80 sm:inline">TOONPLANET</span>
          </a>
          <div className="hidden items-center gap-5 text-sm font-bold text-slate-300 md:flex">
            {hasEpisodes && <a href="#episodes" className="inline-block py-2 hover:text-amber-300">أحدث الحلقات</a>}
            <a href="#sections" className="inline-block py-2 hover:text-amber-300">الأقسام</a>
            <a href="#coloring" className="inline-block py-2 hover:text-amber-300">كتب التلوين</a>
            <a href="#factory" className="inline-block py-2 hover:text-amber-300">🏭 المصنع</a>
            <a href="/game" className="inline-block py-2 hover:text-amber-300">🎮 ألغاز</a>
            <a href="/library" className="inline-block py-2 hover:text-amber-300">📚 مكتبة الفيديو</a>
            <a href="#packages" className="inline-block py-2 hover:text-amber-300">الباقات</a>
            <a href="#how" className="inline-block py-2 hover:text-amber-300">إزاي تطلب</a>
            <a href="#faq" className="inline-block py-2 hover:text-amber-300">أسئلة شائعة</a>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {me && (
              <a href="/account" title={`رصيدك على الموقع — كل مشهد (8 ثوانٍ) بيخصم ${SCENE_COST} كريدت`} className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-extrabold text-amber-300 transition hover:scale-105">
                💳 {me.username}: {me.credits}
              </a>
            )}
            <a href="/studio" className="btn-gold px-3.5 py-1.5 text-xs">
              🎬 الاستوديو — اعمل فيلمك بنفسك
            </a>
            <a href="/recharge" className="rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-amber-200 shadow-lg shadow-green-500/30 transition hover:scale-105">
              💳 اشحن
            </a>
          </div>
        </div>
      </nav>

      {/* الهيرو بستايل البوستر الإعلاني — بدون أي عناصر blur متحركة: التوهج من خلفية .lux (أسرع على الهاتف) */}
      <header className="relative overflow-hidden">
        <span className="pointer-events-none absolute right-[8%] top-16 text-4xl opacity-80" style={{ animation: "floaty 5s ease-in-out infinite" }}>⭐</span>
        <span className="pointer-events-none absolute left-[10%] top-24 text-4xl opacity-70" style={{ animation: "floaty 6s ease-in-out infinite" }}>🪐</span>
        <span className="pointer-events-none absolute right-[16%] bottom-6 text-3xl opacity-70" style={{ animation: "floaty 7s ease-in-out infinite" }}>🎈</span>
        <span className="pointer-events-none absolute left-[20%] bottom-10 text-4xl opacity-70" style={{ animation: "floaty 5.5s ease-in-out infinite" }}>🚀</span>
        <div className="relative mx-auto max-w-4xl px-4 pt-14 pb-12 text-center md:pt-16 md:pb-12">
          {/* 🎯 العنوان الرئيسي أول ما تقع عليه العين — بلا أي شيء قبله */}
          <h1 className="text-5xl font-black leading-tight md:text-7xl">
            <span className="neon-title">كوكب الكرتون</span>
          </h1>
          {/* عنوان البوستر — كلمات نيون ملونة زي «موقعك لازم يخطف العين» */}
          <p className="mt-4 text-2xl font-black md:text-4xl">
            <span className="nw-yellow">حلقة كرتون</span> <span className="nw-white">بطلها</span> <span className="nw-cyan">من خيالك</span> <span className="nw-pink">— بالذكاء الاصطناعي!</span>
          </p>
          {/* الشارة الذهبية أُزيلت بطلب المالك — الباقات في قسمها أسفل الصفحة */}
          {/* 👥 عداد الزوار الحقيقي — رقم حقيقي من قاعدة البيانات */}
          {visits != null && (
            <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-1.5 text-xs font-bold text-cyan-300">
              👥 زوار كوكب الكرتون: {visits.toLocaleString("ar-EG")} زائر حقيقي
            </p>
          )}
          {/* جملة وضوح العرض — رصيد الموقع هو المحرك */}
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg">
            <b className="text-amber-200">رصيد الموقع هو المحرك لكل شيء</b>: تشحن كريدت بالجنيه المصري — ورصيدك بيخصم لكل مشهد بتولده، بدون أي مفاتيح أو إعدادات تقنية.
            تبعت فكرتك أو قصتك، وبتستلم حلقة بطلها من خيالك — وقسم «أحدث الحلقات» هنا فيه <b className="text-amber-200">نماذج جاهزة تشوفها قبل ما تدفع</b>.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {hasEpisodes && (
              <a href="#episodes" className="btn-gold px-7 py-3 text-base">
                🎬 شوف النماذج الجاهزة
              </a>
            )}
            <a href="/studio" className="btn-gold px-7 py-3 text-base">
              🎥 اعمل فيلمك بنفسك — الاستوديو
            </a>
            <a href="/recharge" className="rounded-full border-2 border-amber-500/50 bg-black/50 px-7 py-3 text-base font-extrabold text-amber-300 transition hover:scale-105 hover:border-amber-300">
              💳 ابدأ من 50 جنيه
            </a>
            <a href="/account" className="rounded-full border-2 border-amber-500/50 bg-black/50 px-7 py-3 text-base font-extrabold text-slate-200 transition hover:scale-105 hover:border-amber-300">
              🔐 تسجيل / دخول
            </a>
          </div>

          {/* 👨‍👩‍👧‍👦 عنصر الثقة: الموقع لجميع أفراد الأسرة — بعد دعوة الإجراء مباشرة */}
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/12 px-4 py-3 shadow-lg shadow-emerald-500/20">
            <p className="text-sm font-black text-emerald-300 md:text-base">👨‍👩‍👧‍👦 موقع لجميع أفراد الأسرة — محتوى آمن 100%</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300 md:text-xs">كل القصص والمشاهد بتتولد بقواعد صارمة: بدون عنف أو مشاهد مخيفة أو أي كلام غير لائق — يشتغل قدام العائلة كلها بأمان تام، وكل الملفات اللي بتولدها ملكك وحدك</p>
          </div>
          {/* كبسولات نيون — زي الشريط السفلي في البوستر */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="neon-pill px-3.5 py-1.5 text-xs font-bold text-slate-200">🤖 بتقنية الذكاء الاصطناعي</span>
            <span className="neon-pill px-3.5 py-1.5 text-xs font-bold text-slate-200">📱 فودافون كاش وإنستاباي</span>
            <span className="neon-pill px-3.5 py-1.5 text-xs font-bold text-slate-200">👨‍👩‍👧‍👦 آمن لكل العيلة</span>
            <span className="neon-pill px-3.5 py-1.5 text-xs font-bold text-slate-200">⚡ توليد بالتوازي</span>
          </div>

          {/* مربعات المزايا البنفسجية — زي صورة «ايه اللي هتاخده معانا؟» في البوسترات */}
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { e: "🎬", t: "فيديو 8 ثوانٍ 480p", d: "مناسب للموبايل والشورتس" },
              { e: "📱", t: "متوافق مع الموبايل", d: "والكمبيوتر والتابلت" },
              { e: "💸", t: "رصيدك محفوظ", d: "أي مشهد فشل رصيده بيرجع تلقائيًا" },
              { e: "📦", t: "حزمة نشر مجانية", d: "عناوين + هاشتاجات + وقت النشر" },
            ].map((f) => (
              <div key={f.t} className="feature-tile p-3 text-center">
                <p className="text-2xl">{f.e}</p>
                <p className="mt-1 text-xs font-black text-fuchsia-200">{f.t}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{f.d}</p>
              </div>
            ))}
          </div>

          {/* ⭐ تقييم الموقع — أرقام حقيقية من مستخدمين مسجلين فقط (بدون أي أرقام مخترعة) */}
          {ratingData && ratingData.count > 0 && (
            <a href="/account#rate" className="mx-auto mt-7 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-3 transition hover:scale-[1.02]">
              <span className="text-2xl">⭐</span>
              <span className="text-center text-sm font-bold text-amber-200">
                تقييم الزبائن الحقيقي: {ratingData.avg.toFixed(1)}/5 من {ratingData.count} {ratingData.count === 1 ? "مستخدم مسجل" : "مستخدمين مسجلين"} — وتقدر تقيّمنا من صفحة حسابك
              </span>
            </a>
          )}

          {/* 🎬 الفيديو التعريفي الرسمي — فيديو المالك «كوكب الكرتون مرحبًا بكم» */}
          <div className="mx-auto mt-7 w-full max-w-[300px]">
            <div className="overflow-hidden rounded-3xl border-2 border-amber-500/40 bg-black/60 shadow-2xl">
              <video src="/sections/intro.mp4" poster="/sections/intro_poster.jpg" controls preload="metadata" playsInline className="h-auto w-full" />
            </div>
            <p className="mt-2 text-center text-xs font-bold text-amber-200">🎬 فيديو التعريف الرسمي — كوكب الكرتون مرحبًا بكم</p>
          </div>
        </div>
      </header>

      {/* 🏛️ معلم main الهيكلي — الوصولية وقارئات الشاشة والتنقل */}
      <main className="relative">

      {/* 🏭 مصنع الحلقات — على الرئيسية: خط الإنتاج الآلي بالكامل */}
      <section id="factory" className="relative mx-auto max-w-6xl px-4 pb-12 pt-8">
        <div className="glass card-3d overflow-hidden p-6 md:p-10">
          <div className="mb-6 text-center">
            <span className="rounded-full border border-indigo-400/40 bg-indigo-500/15 px-4 py-1 text-xs font-bold text-indigo-300">🏭 خط إنتاج آلي — بدون مواعيد محددة</span>
            <h2 className="mt-3 text-3xl font-black"><span className="neon-title">مصنع حلقات كوكب الكرتون</span></h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
              مصنع كامل داخل الموقع: تبعت السيناريو (أو تختار فكرة جاهزة بالذكاء الاصطناعي)، والخط بتولد مشاهد الفيديو وتتدمج وتتجهز
              للنشر على يوتيوب وتليجرام — والعميل يقدر يولّد <b className="text-amber-200">في أي وقت</b> من الاستوديو أو المصنع.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { icon: "📝", t: "السيناريو", d: "اكتب قصتك أو ولّد فكرة وسميناريو بالذكاء الاصطناعي مع وصف شخصيات ثابت" },
              { icon: "🎬", t: "توليد المشاهد", d: "كل مشهد فيديو 8 ثوانٍ — يُولّد من مفاتيح المنصة ويُخصم من رصيدك تلقائيًا" },
              { icon: "🔗", t: "الدمج والغلاف", d: "المشاهد بتتدمج لحلقة واحدة + صورة مصغرة ووصف وهاشتاقات تلقائية" },
              { icon: "📣", t: "النشر والتنزيل", d: "تنزيل فوري للفيديو النهائي + نشر آلي اختياري على يوتيوب وتليجرام" },
            ].map((s, i) => (
              <div key={i} className="card-3d rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                <p className="text-3xl">{s.icon}</p>
                <h3 className="mt-1 font-bold text-amber-200">{s.t}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{s.d}</p>
              </div>
            ))}
          </div>
          {/* النماذج التوضيحية المتحركة أُزيلت بطلب المالك — جودة المخرجات تظهر في «أحدث الحلقات» والأقسام */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="/studio" className="btn-gold px-7 py-3 text-base">
              🎥 اعمل فيلمك بنفسك — افتح الاستوديو
            </a>
            {hasEpisodes && (
              <a href="#episodes" className="rounded-full border-2 border-amber-500/50 bg-black/50 px-7 py-3 text-base font-extrabold text-amber-300 transition hover:scale-105 hover:border-amber-300">
                🎬 شوف النماذج الجاهزة
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 🎛️ الأقسام الأحد عشر — كل قسم كحلقة تشجيعية تفتح باب الإنتاج مباشرة */}
      <section id="sections" className="relative mx-auto max-w-6xl px-4 pb-12 pt-8">
        <div className="mb-8 text-center">
          <span className="rounded-full border border-blue-400/40 bg-blue-500/15 px-4 py-1 text-xs font-bold text-blue-300">🎛️ 11 عالمًا جاهزًا — اختار عالمك واعمل حلقتك في دقيقة</span>
          <h2 className="mt-3 text-3xl font-black"><span className="neon-title">أقسام كوكب الكرتون</span></h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
            كل قسم بيضبط أسلوب القصة والمشاهد أوتوماتيكيًا ليناسب جمهورك — اضغط «اعمل حلقتك هنا» وافتح الاستوديو بنوع المحتوى جاهز.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((s) => (
            <div key={s.key} className="card-3d overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-xl">
              {/* غلاف القسم — صورة ثابتة (الفيديوهات التجريبية اتشالت بطلب المالك في 2026-11-20) */}
              <div className="relative">
                <img src={`/sections/${s.key}.jpg`} alt={`قسم ${s.title} — كوكب الكرتون`} loading="lazy" className="aspect-video w-full bg-slate-900 object-cover" />
                <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-amber-200">🎬 عالم جاهز</span>
              </div>
              <div className="p-4 pt-3">
                <h3 className="font-black text-amber-200">
                  <span className="me-1">{s.emoji}</span>{s.title}
                </h3>
                <p className="mt-1 min-h-[52px] text-xs leading-relaxed text-slate-300">{s.pitch}</p>
                <a href={`/studio?cat=${s.key}`} className="btn-gold mt-2 block px-4 py-2 text-center text-xs">
                  🎥 اعمل حلقتك في القسم ده
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 📢 فتحة الإعلان الظاهرة — بعد الأقسام */}
      <AdSlot />

      {/* أحدث الحلقات — يظهر فقط لو فيه حلقات جاهزة فعلًا */}
      {hasEpisodes && (
        <section id="episodes" className="relative mx-auto max-w-6xl px-4 pb-12 pt-8">
          <h2 className="mb-2 text-center text-3xl font-black text-amber-200">🎬 أحدث الحلقات — نماذج جاهزة</h2>
          <p className="mb-8 text-center text-sm text-slate-300">شوف جودة الشغل بنفسك — دي حلقات حقيقية اتبنت على الموقع <span className="text-amber-300">وبأرقام حقيقية 100% (مشاهد ومدة وتاريخ)</span></p>
          <div className="grid gap-4 md:grid-cols-3">
            {episodes!.map((ep) => (
              <div key={ep.url} className="card-3d overflow-hidden rounded-3xl border border-amber-500/25 bg-black/70 shadow-xl">
                <video src={ep.url} poster={ep.thumb_url || undefined} controls preload="metadata" playsInline onLoadedMetadata={grabDur(ep.url)} className="h-auto w-full bg-slate-900" />
                <div className="flex items-center justify-between gap-2 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-amber-200">{ep.title}</h3>
                      {durs[ep.url] != null && (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                          {durs[ep.url] < 60 ? "🎬 مشهد قصير" : "🎬 حلقة كاملة"}
                        </span>
                      )}
                    </div>
                    {/* أرقام حقيقية بستايل شارات الفيرال — من قاعدة البيانات ومشغل الفيديو نفسه */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 text-fuchsia-300">🎬 {ep.scenes ?? 1} مشاهد</span>
                      {durs[ep.url] != null && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">⏱ {fmtDur(durs[ep.url])}</span>}
                      {ep.updated_at && <span className="rounded-full border border-slate-400/30 bg-slate-500/10 px-2 py-0.5 text-slate-300">📅 {fmtDate(ep.updated_at)}</span>}
                    </div>
                  </div>
                  <a href={dl(ep.url, ep.title || "حلقة")} className="shrink-0 rounded-full bg-emerald-600/90 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg transition hover:scale-105" title="تنزيل الحلقة على جهازك">
                    ⬇️ تنزيل
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* الباقات — بستايل بطاقات الأسعار الذهبية (مرجع: صور الباقات بتاج و diamond وصاروخ) */}
      <section id="packages" className="relative border-y border-amber-500/15 bg-black/40 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-2 text-center text-3xl font-black text-amber-200">💳 الباقات والأسعار</h2>
          <p className="mb-10 text-center text-sm text-slate-300">المشهد الواحد (فيديو 8 ثوانٍ بجودة 480p مناسبة للموبايل والشورتس) = {SCENE_COST} كريدت بالظبط</p>
          <div className="grid gap-6 md:grid-cols-3">
            {PACKAGES.map((p, idx) => (
              <div key={p.egp} className={`card-3d relative rounded-3xl border-2 p-6 text-center shadow-xl transition ${idx === 1 ? "border-amber-400/70 bg-gradient-to-b from-amber-500/12 to-black/60" : idx === 0 ? "border-emerald-400/50 bg-gradient-to-b from-emerald-500/10 to-black/60" : "border-sky-400/50 bg-gradient-to-b from-sky-500/10 to-black/60"}`}>
                <span className="mb-1 block text-3xl">{idx === 1 ? "👑" : idx === 0 ? "💎" : "🚀"}</span>
                {idx === 1 && (
                  <span className="absolute -top-3 right-1/2 translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-xs font-black text-amber-200 shadow-lg">الأكثر رواجًا ⭐</span>
                )}
                <p className="text-sm font-bold text-slate-300">باقة</p>
                <p className={`mt-1 text-4xl font-black ${idx === 1 ? "neon-title" : "text-slate-100"}`}>{p.egp} ج.م</p>
                <p className="mt-2 text-lg font-extrabold text-amber-200">{p.credits.toLocaleString("en")} كريدت</p>
                <p className="mt-1 text-sm text-slate-300">= {p.scenes} × 8 ثوانٍ</p>
                {/* 🎯 زر إجراء مباشر ملتصق بشارة الباقة — بدء الطلب فور رؤية السعر */}
                <a href="/recharge" className="btn-gold mt-5 block px-5 py-2.5 text-sm">
                  💳 اشحن باقة {p.credits.toLocaleString("en")} دلوقتي
                </a>
                {waPhone && (
                  <a
                    href={waLink(`أهلاً 👋 عايز أطلب باقة ${p.credits.toLocaleString("en")} كريدت بـ ${p.egp} ج — كوكب الكرتون 🪐`)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block rounded-full border border-emerald-400/50 bg-emerald-500/10 px-5 py-2 text-xs font-extrabold text-emerald-300 transition hover:scale-105"
                  >
                    💬 اطلب الباقة على واتساب فورًا
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
          {/* 🎁 عروض خاصة — بونص العيلة والاشتراك الشهري (تأكيد وتنفيذ يدوي مؤكد عبر واتساب) */}
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
            {waPhone && (
              <div className="card-3d rounded-3xl border-2 border-fuchsia-400/50 bg-gradient-to-b from-fuchsia-500/10 to-black/60 p-6 text-center shadow-xl">
                <span className="text-3xl">🎁</span>
                <h3 className="mt-1 text-lg font-black text-fuchsia-300">عرض العيلة — بونص 400 كريدت</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">اشحن <b className="text-amber-200">باقة 200ج</b> وخد <b className="text-amber-200">400 كريدت إضافية هدية</b> (≈27 مشهدًا زيادة) — اطلب العرض من واتساب قبل التحويل وبنضيف البونص مع الشحن.</p>
                <a href={waLink("عايز أطلب عرض العيلة: باقة 200 جنيه + بونص 400 كريدت 🎁")} className="btn-gold mt-4 block px-5 py-2.5 text-sm">💬 اطلب عرض العيلة على واتساب</a>
              </div>
            )}
            {waPhone && (
              <div className="card-3d rounded-3xl border-2 border-cyan-400/50 bg-gradient-to-b from-cyan-500/10 to-black/60 p-6 text-center shadow-xl">
                <span className="text-3xl">🔄</span>
                <h3 className="mt-1 text-lg font-black text-cyan-300">الاشتراك الشهري — كريدت بيتجدد</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300"><b className="text-amber-200">100ج كل شهر → 2000 كريدت</b> + أولوية معالجة لطلباتك. التجديد بتحويل فودافون كاش شهري وتأكيد من واتساب — بدون أي روابط دفع خارجية.</p>
                <a href={waLink("عايز أشترك في الاشتراك الشهري: 100 جنيه/شهر — 2000 كريدت 🔄")} className="btn-gold mt-4 block px-5 py-2.5 text-sm">💬 فعّل اشتراكي الشهري</a>
              </div>
            )}
          </div>
      </section>

      {/* 🎨 كتاب التلوين المجاني — هدية PDF جاهزة للطباعة (نقطة جذب عملاء جدد) */}
      <section id="gift" className="relative mx-auto max-w-4xl px-4 py-14">
        <div className="card-3d rounded-3xl border-2 border-amber-400/40 bg-gradient-to-r from-amber-500/12 via-orange-500/10 to-black/60 p-8 text-center shadow-xl md:p-10">
          <p className="text-3xl">🎨</p>
          <h2 className="mt-2 text-2xl font-black text-amber-200 md:text-3xl">هدية مجانية — كتاب التلوين والأنشطة (PDF)</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">كتاب من 8 صفحات جاهز للطباعة على A4: 5 لوحات تلوين كرتونية كبيرة + لعبة عدّ ممتعة مع مفتاح الحل للأهالي — حمّله مجانًا واطبعه ولوّنه مع العيلة.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a href="/planet-coloring-gift.pdf" download className="btn-gold px-8 py-3 text-base">⬇️ حمّل الكتاب مجانًا (PDF)</a>
            {waPhone && (
              <a href={waLink("عايز كتاب تلوين باسم أطفالي 🎨")} className="rounded-full border-2 border-amber-500/50 bg-black/50 px-7 py-3 text-base font-extrabold text-amber-300 transition hover:scale-105 hover:border-amber-300">🎨 اطلب كتابًا باسم أطفالك</a>
            )}
          </div>
        </div>
      </section>

      {/* 🛒 كتب تلوين للأطفال — منتجات PDF بأسعار وخصم من لوحة الإدارة */}
      <ColoringBooks />
      {/* 📈 نبض الموقع — رسم بياني حي للزوار + عدد التحميلات (أرقام حقيقية) */}
      <UsageStats />

      {/* إزاي تطلب حلقتك */}
      <section id="how" className="relative mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-10 text-center text-3xl font-black text-amber-200">✨ إزاي تطلب حلقتك؟ 3 خطوات بس</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={i} className="rounded-3xl border border-slate-600/50 bg-slate-800/70 p-6 text-center shadow-lg">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-fuchsia-600 text-2xl font-black text-amber-200 shadow-lg">{i + 1}</div>
              <h3 className="font-bold text-amber-200">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 🚀 نموذج الفكرة المبسط — بداية الطلب بضغطة واحدة بدون أي تعقيد */}
      {waPhone && (
        <section id="idea" className="relative mx-auto max-w-3xl px-4 pb-14">
          <div className="rounded-3xl border-2 border-emerald-400/40 bg-emerald-500/8 p-6 shadow-xl md:p-8">
            <h2 className="text-center text-2xl font-black text-emerald-300 md:text-3xl">🚀 عندك فكرة حلقة؟ ابعتها دلوقتي</h2>
            <p className="mt-2 text-center text-sm text-slate-300">اكتب فكرتك في سطر واحد وسيبنا الباقي — بنرد عليك على واتساب ونبدأ التنفيذ فورًا</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input
                value={ideaName}
                onChange={(e) => setIdeaName(e.target.value)}
                placeholder="اسمك"
                maxLength={60}
                className="rounded-xl border border-slate-600/60 bg-slate-900/70 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
              />
              <input
                value={ideaPhone}
                onChange={(e) => setIdeaPhone(e.target.value)}
                placeholder="رقم واتسابك للتواصل"
                dir="ltr"
                maxLength={20}
                className="rounded-xl border border-slate-600/60 bg-slate-900/70 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="فكرة الحلقة — مثال: حلقة عن عمر وسفر للمريخ بشخصية كرتونية مرحة…"
              rows={3}
              maxLength={500}
              className="mt-3 w-full rounded-xl border border-slate-600/60 bg-slate-900/70 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            />
            <button
              onClick={sendIdea}
              disabled={!ideaText.trim()}
              className="mt-4 w-full rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-3 text-base font-extrabold text-white shadow-lg shadow-green-500/30 transition hover:scale-[1.02] disabled:opacity-40"
            >
              💬 ابعت الفكرة على واتساب الآن
            </button>
          </div>
        </section>
      )}

      {/* ليه كوكب الكرتون */}
      <section className="relative bg-slate-800/40 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-10 text-center text-3xl font-black text-amber-200">🌟 ليه كوكب الكرتون؟</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.t} className="rounded-3xl border border-slate-600/50 bg-slate-800/70 p-5 text-center shadow-lg">
                <p className="text-4xl">{f.icon}</p>
                <h3 className="mt-2 font-bold text-amber-200">{f.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* أسئلة شائعة */}
      <section id="faq" className="relative mx-auto max-w-3xl px-4 py-14">
        <h2 className="mb-8 text-center text-3xl font-black text-amber-200">❓ أسئلة شائعة</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-2xl border border-slate-600/50 bg-slate-800/70 p-4 shadow-lg">
              <summary className="cursor-pointer list-none font-bold text-amber-200">
                <span className="text-cyan-300">🔸 </span>{f.q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* دعوة أخيرة */}
      {/* 📢 فتحة الإعلان الظاهرة — قبل الدعوة الأخيرة */}
      <AdSlot />

      <section className="relative mx-auto max-w-4xl px-4 pb-16">
        <div className="rounded-3xl bg-gradient-to-r from-cyan-600 via-violet-600 to-fuchsia-600 p-8 text-center text-amber-200 shadow-2xl md:p-10">
          <p className="text-3xl">🎁</p>
          <h2 className="mt-2 text-2xl font-black md:text-3xl">جاهز تصنع فرحة العائلة النهاردة؟</h2>
          <p className="mt-2 text-sm opacity-90 md:text-base">ابدأ بأرخص باقة — 50 جنيه، وسجّل طلبك في أقل من دقيقة 💛</p>
          <a href="/recharge" className="mt-5 inline-block rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-8 py-3 text-base font-extrabold text-slate-900 shadow-xl transition hover:scale-105">
            💳 اشحن رصيدك الآن
          </a>
        </div>
      </section>
      </main>

      {/* الفوتر — هوية المشغّل + خريطة روابط داخلية كاملة (تساعد جوجل على اكتشاف كل الصفحات) */}
      <footer className="relative border-t border-slate-600/50 py-8 text-center text-sm text-slate-300">
        <p className="font-bold text-slate-200">🪐 كوكب الكرتون — مشروع محتوى كرتوني عائلي بُني بالذكاء الاصطناعي، من مصر لكل العائلة في كل مكان 💛</p>
        <nav className="mx-auto mt-5 grid max-w-3xl gap-4 text-xs sm:grid-cols-3" aria-label="خريطة الموقع">
          <div>
            <p className="mb-2 font-black text-amber-200">🧭 صفحات الموقع</p>
            <ul className="space-y-1">
              <li><a href="/" className="inline-block py-1 text-cyan-300 hover:underline">الرئيسية — حلقات كرتون مخصصة</a></li>
              <li><a href="/studio" className="inline-block py-1 text-cyan-300 hover:underline">الاستوديو — اعمل حلقتك بنفسك</a></li>
              <li><a href="/recharge" className="inline-block py-1 text-cyan-300 hover:underline">شحن الرصيد — الباقات والأسعار</a></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-black text-amber-200">🎬 محتوى الصفحة</p>
            <ul className="space-y-1">
              <li><a href="#sections" className="inline-block py-1 text-cyan-300 hover:underline">الأقسام الأحد عشر مع نماذج الفيديو</a></li>
              <li><a href="#episodes" className="inline-block py-1 text-cyan-300 hover:underline">أحدث الحلقات الجاهزة</a></li>
              <li><a href="#packages" className="inline-block py-1 text-cyan-300 hover:underline">الباقات: 50 / 100 / 200 جنيه</a></li>
              <li><a href="#gift" className="inline-block py-1 text-cyan-300 hover:underline">🎁 كتاب التلوين المجاني (PDF)</a></li>
              <li><a href="#faq" className="inline-block py-1 text-cyan-300 hover:underline">الأسئلة الشائعة</a></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-black text-amber-200">📋 الصفحات القانونية</p>
            <ul className="space-y-1">
              <li><a href="/about" className="inline-block py-1 text-cyan-300 hover:underline">من نحن</a></li>
              <li><a href="/contact" className="inline-block py-1 text-cyan-300 hover:underline">اتصل بنا</a></li>
              <li><a href="/cookies" className="inline-block py-1 text-cyan-300 hover:underline">استخدام الكوكيز</a></li>
              <li><a href="/terms" className="inline-block py-1 text-cyan-300 hover:underline">الشروط والأحكام</a></li>
              <li><a href="/privacy" className="inline-block py-1 text-cyan-300 hover:underline">سياسة الخصوصية</a></li>
              <li><a href="/refund" className="inline-block py-1 text-cyan-300 hover:underline">سياسة الاسترداد</a></li>
            </ul>
          </div>
        </nav>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
          <button onClick={() => window.dispatchEvent(new Event("mg-open-chat"))} className="inline-block py-1 text-cyan-300 hover:underline">🤖 اسأل المساعد الذكي</button>
          <span className="text-slate-400">للتواصل: زر «اسألنا على واتساب» أسفل الشاشة</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">© 2026 كوكب الكرتون {visits != null && <>· 👥 إجمالي الزوار: {visits.toLocaleString("ar-EG")}</>}</p>
      </footer>
      <FloatingWhatsApp />
    </div>
  );
}

// ============================================================
// 🛒 كتب تلوين للأطفال — منتجات PDF بأسعار من لوحة الإدارة
// الغلاف صورة الصفحة الأولى للكتاب (/coloring/cover_{id}.jpg) وبديل جرافيكي لو مش موجودة
// الخصم من إعدادات الموقع يظهر: سعر قديم مشطوب + السعر النهائي + شارة التوفير
// الطلب على واتساب المشرف برسالة جاهزة فيها اسم الكتاب والسعر النهائي
// ============================================================
interface ColoringBookCard {
  id: string;
  title: string;
  price: number;
  final: number;
  pages: number;
  url: string;
}

function ColoringBooks() {
  const [data, setData] = useState<{ discount: number; whatsapp: string; books: ColoringBookCard[] } | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/coloring")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.books) && d.books.length) setData(d);
      })
      .catch(() => undefined);
  }, []);

  if (!data) return null;

  return (
    <section id="coloring" className="relative mx-auto max-w-6xl px-4 py-14">
      <h2 className="mb-2 text-center text-3xl font-black text-amber-200">🎨 كتب تلوين للأطفال — PDF جاهز للطباعة</h2>
      <p className="mb-8 text-center text-sm text-slate-400">
        اطلب الكتاب على واتساب ونبعتلك النسخة الكاملة PDF عالية الجودة تطبعها على ورق A4 وتلوّنها مع العيلة
        {data.discount > 0 && <span className="font-bold text-emerald-300"> — خصم {data.discount}٪ ساري حاليًا 🏷️</span>}
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.books.map((b) => (
          <div key={b.id} className="card-3d flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-xl">
            <a href={b.url} target="_blank" rel="noopener noreferrer" title={`معاينة ${b.title}`}>
              {broken[b.id] ? (
                <div className="flex aspect-[3/4] w-full items-center justify-center bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-slate-900 text-6xl">🎨</div>
              ) : (
                <img
                  src={`/coloring/cover_${b.id}.jpg`}
                  alt={`غلاف كتاب ${b.title}`}
                  width={480}
                  height={640}
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover"
                  onError={() => setBroken((p) => ({ ...p, [b.id]: true }))}
                />
              )}
            </a>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <h3 className="text-base font-black leading-snug text-slate-100">{b.title}</h3>
              {b.pages > 0 && (
                <span className="w-fit rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-[11px] font-bold text-cyan-300">📄 {b.pages} صفحة للطباعة</span>
              )}
              <div className="mt-auto flex flex-wrap items-baseline gap-2">
                {data.discount > 0 && b.final < b.price && (
                  <span className="text-sm font-bold text-slate-500 line-through">{Math.round(b.price)}ج</span>
                )}
                <span className="text-xl font-black text-emerald-300">{b.final}ج</span>
                {data.discount > 0 && b.final < b.price && (
                  <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-black">وفّرت {Math.round(b.price - b.final)}ج</span>
                )}
              </div>
              {data.whatsapp ? (
                <a
                  href={`https://wa.me/${data.whatsapp}?text=${encodeURIComponent(`عايز أشتري كتاب تلوين «${b.title}» بسعر ${b.final}ج 🎨`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gold block w-full px-4 py-2.5 text-center text-sm"
                >
                  🛒 اطلب على واتساب
                </a>
              ) : (
                <a href="/recharge" className="btn-gold block w-full px-4 py-2.5 text-center text-sm">🛒 اطلب الآن</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
