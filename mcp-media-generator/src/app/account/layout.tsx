import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة + إيقاف الفهرسة
export const metadata: Metadata = {
  title: "👤 حسابي — كوكب الكرتون",
  description: "رصيدك، مفتاحك الخاص، طلبات الشحن، وكود الدعوة.",
    robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
