import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import ChatWidget from "@/components/ChatWidget";

// الخط يُستضاف محليًا مع البناء (next/font) — لا يوجد أي طلب لخوادم جوجل وقت التشغيل
const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
  variable: "--font-tajawal",
});

// 🔍 النطاق المرجعي الرسمي (متسجل في إعدادات المشروع) — النطاقات الثانوية يعملها
// Vercel بنفسه X-Robots-Tag: noindex، لذا الفهرسة والcanonical والسايت ماب كلها هنا
const SITE_URL = "https://media-generator-topaz.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "كوكب الكرتون 🚀 — حلقات كرتون مخصصة لعائلتك بالذكاء الاصطناعي",
  description:
    "اطلب حلقة كرتون خاصة بأفراد عائلتك: تشحن كريدت بالجنيه المصري (فودافون كاش أو إنستاباي)، وكل مشهد فيديو 8 ثوانٍ = 15 كريدت بالظبط. وشوف نماذج جاهزة في قسم أحدث الحلقات قبل ما تدفع.",
  // 🔍 الرابط الأساسي المرجعي — يمنع ازدواج الفهرسة في جوجل
  alternates: { canonical: SITE_URL },
  // 🔍 توجيه صريح لمحركات البحث: فهرسة كاملة ومتابعة روابط
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    title: "كوكب الكرتون 🚀 — حلقات كرتون مخصصة لعائلتك بالذكاء الاصطناعي",
    description:
      "اطلب حلقة كرتون خاصة بأفراد عائلتك: شحن بالجنيه المصري، المشهد = 15 كريدت بالظبط، ونماذج جاهزة للمشاهدة قبل الدفع.",
    url: SITE_URL,
    siteName: "كوكب الكرتون",
    locale: "ar_EG",
    type: "website",
    images: [{ url: "/og-poster.png", width: 1344, height: 768, alt: "كوكب الكرتون — شخصية كرتونية مبتسمة مع الكوكب المرح، حلقات كرتون بالذكاء الاصطناعي" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "كوكب الكرتون 🚀 — حلقات كرتون مخصصة لعائلتك بالذكاء الاصطناعي",
    description: "اطلب حلقة كرتون خاصة بأفراد عائلتك بالذكاء الاصطناعي — شحن بالجنيه المصري ونماذج جاهزة قبل الدفع.",
    images: ["/og-poster.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 🔍 بيانات هيكلية منسقة (Schema.org) — بيانات حقيقية فقط: أسعار الباقات الفعلية
  const siteSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "كوكب الكرتون",
        alternateName: "ToonPlanet",
        url: SITE_URL,
        description: "منصة حلقات كرتون مخصصة بالذكاء الاصطناعي — محتوى عائلي آمن بالكامل من مصر",
      },
      {
        "@type": "WebSite",
        name: "كوكب الكرتون",
        url: SITE_URL,
        inLanguage: "ar",
      },
      {
        "@type": "SoftwareApplication",
        name: "كوكب الكرتون — استوديو الحلقات الكرتونية بالذكاء الاصطناعي",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        inLanguage: "ar",
        offers: {
          "@type": "Offer",
          priceCurrency: "EGP",
          offers: [
            { "@type": "Offer", name: "باقة 1000 كريدت", price: "50", priceCurrency: "EGP" },
            { "@type": "Offer", name: "باقة 2000 كريدت", price: "100", priceCurrency: "EGP" },
            { "@type": "Offer", name: "باقة 4000 كريدت", price: "200", priceCurrency: "EGP" },
          ],
        },
      },
    ],
  };
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <head>
        {/* 🔍 Schema.org — تعريف نشاط المنصة وأسعار الباقات لجوجل */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }} />
        {/* الثيم الداكن ثابت — مسح أي تفضيل فاتح قديم قبل الرسم (بدون وميض) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{localStorage.removeItem("mg_theme")}catch(e){}document.documentElement.classList.remove("theme-light")`,
          }}
        />
      </head>
      <body className="min-h-screen">
        {children}
        {/* 🤖 المساعد الذكي — عائم في كل الصفحات أسفل يسار (مقابل واتساب أسفل يمين) */}
        <ChatWidget />
      </body>
    </html>
  );
}
