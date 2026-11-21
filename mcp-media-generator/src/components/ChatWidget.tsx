"use client";

// ============================================================
// 💬 الشات الذكي — مساعد موقع كوكب الكرتون للزبائن
// variant="floating" (افتراضي): زر عائم خاص به — للصفحات الداخلية
// variant="embedded": بلا زر عائم، يُفتح بحدث window «mg-open-chat» — للرئيسية
//   (زر عائم واحد فقط في الصفحة = واتساب — منع تشتيت قرار الشراء)
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";

interface Turn {
  role: "user" | "bot";
  text: string;
}

const QUICK = ["الباقات بكام؟", "إزاي أدفع؟", "كتب التلوين؟"];

export default function ChatWidget({ variant = "floating" }: { variant?: "floating" | "embedded" }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([
    { role: "bot", text: "أهلًا بك في كوكب الكرتون 👋 اسألني عن الأسعار، الدفع، أو الحلقات!" },
  ]);
  const boxRef = useRef<HTMLDivElement>(null);
  const embedded = variant === "embedded";

  // المستمع يعمل في كل الأوضاع — زر «اسأل المساعد الذكي» في الرئيسية يفتح الويدجت العام من layout
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("mg-open-chat", handler);
    return () => window.removeEventListener("mg-open-chat", handler);
  }, []);


  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (open) scrollDown();
  }, [open, scrollDown]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: q }]);
    setInput("");
    scrollDown();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: turns.slice(-6).map((t) => ({ role: t.role, text: t.text })),
        }),
      });
      const d = await res.json();
      setTurns((t) => [...t, { role: "bot", text: d.answer || d.error || "مش قادر أرد دلوقتي، جرب تاني 🙂" }]);
    } catch {
      setTurns((t) => [...t, { role: "bot", text: "مشكلة اتصال — جرب تاني 🙂" }]);
    } finally {
      setBusy(false);
      scrollDown();
    }
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-[64px] left-3 z-50 flex max-h-[70vh] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white">
            <p className="text-sm font-bold">💬 مساعد كوكب الكرتون</p>
            <button onClick={() => setOpen(false)} aria-label="إغلاق" className="text-lg leading-none">×</button>
          </div>
          <div ref={boxRef} className="flex-1 space-y-2 overflow-y-auto bg-indigo-50/50 p-3">
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "text-left" : "text-right"}>
                <span
                  className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    t.role === "user" ? "bg-indigo-600 text-white" : "bg-white text-gray-800 shadow-sm"
                  }`}
                >
                  {t.text}
                </span>
              </div>
            ))}
            {busy && <p className="text-center text-xs text-gray-400">… بيفكر</p>}
          </div>
          <div className="flex flex-wrap gap-1 border-t border-gray-100 bg-white px-3 pt-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={busy}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2 bg-white p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(input)}
              placeholder="اكتب سؤالك…"
              maxLength={500}
              className="flex-1 rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button onClick={() => ask(input)} disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              إرسال
            </button>
          </div>
        </div>
      )}
      {!embedded && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="المساعد الذكي — اسألنا"
          title="المساعد الذكي — اسألنا"
          className={`fixed bottom-3 left-3 z-50 flex h-12 items-center justify-center rounded-full bg-indigo-600 text-base text-white shadow-2xl transition hover:scale-105 hover:bg-indigo-700 ${open ? "w-12" : "w-auto gap-1.5 px-4"}`}
        >
          {open ? "×" : <><span className="text-lg">💬</span><span className="font-bold">اسألنا</span></>}
        </button>
      )}
    </>
  );
}
