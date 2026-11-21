import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* كل المسارات ديناميكية عبر runtime="nodejs" */
  async headers() {
    return [
      {
        // الأصول الثابتة الكبيرة — تخزين مؤقت سنة كاملة (الاسم يتغير عند التعديل يدويًا)
        // ده اللي بيحل تحذير «استخدام فترات التخزين المؤقت الفعّالة» في PageSpeed
        source: "/sections/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/og-poster.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // هدية الـPDF — يوم واحد (بتتحدث أحيانًا فلا نستخدم immutable)
        source: "/planet-coloring-gift.pdf",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
