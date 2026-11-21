"use client";

// 🌙 الثيم الداكن ثابت — هوية الموقع (بوستر نيون بنفسجي/ذهبي) والنصوص مصممة للخلفية الداكنة
// الوضع الفاتح اتشال نهائيًا لسبب واضح: كان بيخلي النصوص الفاتحة باهتة وغير مقروءة على الخلفية الفاتحة.
// المكوّن بيحذف أي تفضيل فاتح محفوظ في المتصفح وبيرجّع الموقع للداكن تلقائيًا — ومش بيظهر أي زر.
import { useEffect } from "react";

export default function ThemeToggle() {
  useEffect(() => {
    try {
      localStorage.removeItem("mg_theme");
    } catch { /* خاص */ }
    document.documentElement.classList.remove("theme-light");
  }, []);
  return null;
}
