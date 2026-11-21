import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة
export const metadata: Metadata = {
  title: "📜 الشروط والأحكام — كوكب الكرتون",
  description: "شروط استخدام موقع كوكب الكرتون: الكريدت، التوليد، الاسترداد والمسؤولية.",
  alternates: { canonical: "https://media-generator-topaz.vercel.app/terms" },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
