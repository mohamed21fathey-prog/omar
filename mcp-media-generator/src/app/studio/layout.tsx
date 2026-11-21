import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة
export const metadata: Metadata = {
  title: "🎬 استوديو الإنتاج الذاتي — كوكب الكرتون",
  description: "اصنع حلقة كرتون لعائلتك: فكرة، قصة، مشاهد، ودمج — كلها من حسابك.",
  alternates: { canonical: "https://media-generator-topaz.vercel.app/studio" },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
