"use client";

// ============================================================
// 💬 زر واتساب ثابت في كل الصفحات — الرقم من إعدادات الموقع
// يختفي بهدوء لو المشرف لم يحط رقم واتساب بعد
// ============================================================
import { useEffect, useState } from "react";

export default function FloatingWhatsApp() {
  const [phone, setPhone] = useState("");

  useEffect(() => {
    fetch("/api/wallets")
      .then((r) => r.json())
      .then((d) => {
        const p = String(d.admin_whatsapp || "").replace(/[^0-9]/g, "");
        setPhone(p);
      })
      .catch(() => undefined);
  }, []);

  if (!phone) return null; // لم يُضبط رقم التواصل بعد
  return (
    <a
      href={`https://wa.me/${phone}?text=${encodeURIComponent("أهلًا، عندي سؤال عن كوكب الكرتون 🪐")}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-3 text-sm font-extrabold text-amber-200 shadow-2xl shadow-green-500/30 transition hover:scale-105"
      title="تواصل معنا واتساب"
    >
      💬 اسألنا على واتساب
    </a>
  );
}
