import type { Metadata } from "next";

// metadata خاصة بهذه الصفحة
export const metadata: Metadata = {
  title: "💳 شحن الرصيد — كوكب الكرتون",
  description: "اشحن كريدت بالجنيه المصري عبر فودافون كاش أو إنستاباي — المشهد 15 كريدت.",
  alternates: { canonical: "https://media-generator-topaz.vercel.app/recharge" },
};

export default function RechargeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
