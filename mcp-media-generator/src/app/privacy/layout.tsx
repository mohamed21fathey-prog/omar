import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة
export const metadata: Metadata = {
  title: "🔒 سياسة الخصوصية — كوكب الكرتون",
  description: "ما نجمعه من بيانات وأين يُخزَّن ومين يشارك في التشغيل — إفصاح كامل.",
  alternates: { canonical: "https://media-generator-topaz.vercel.app/privacy" },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
