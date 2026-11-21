import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة + إيقاف الفهرسة
export const metadata: Metadata = {
  title: "🎞️ مصنع الحلقات — كوكب الكرتون",
  description: "قائمة انتظار المشاهد والمجموعات والدمج التلقائي.",
    robots: { index: false, follow: false },
};

export default function EpisodesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
