import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة
export const metadata: Metadata = {
  title: "🔄 سياسة الاسترداد — كوكب الكرتون",
  description: "شروط استرداد الكريدت غير المستخدم ومتى لا يُسترد الرصيد.",
  alternates: { canonical: "https://media-generator-topaz.vercel.app/refund" },
};

export default function RefundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
