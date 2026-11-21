import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة + إيقاف الفهرسة
export const metadata: Metadata = {
  title: "🛠️ لوحة الإدارة — كوكب الكرتون",
  description: "لوحة الإدارة: المفاتيح، المهام، والطلبات.",
    robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
