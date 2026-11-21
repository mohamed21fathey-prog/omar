"use client";

// ============================================================
// 🔐 حسابي — تسجيل ودخول الزبائن + متابعة طلبات الشحن الشخصية
// أي زائر يعمل حساب (إيميل + يوزر نيم + باسورد) ويشوف طلباته وحالتها
// ============================================================
import { useCallback, useEffect, useState } from "react";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

interface Me {
  username: string;
  email: string;
  credits?: number;
  created_at?: string | null;
  referral_code?: string | null;
  invited_count?: number;
}
interface MyRequest {
  id: string;
  method: string;
  amount: string;
  reference: string | null;
  status: string;
  created_at: string | null;
}

const METHOD_LABEL: Record<string, string> = { vodafone: "فودافون كاش", instapay: "إنستاباي", visa: "فيزا / تحويل بنكي", paypal: "PayPal" };
// حالات طلب الشحن الثلاثة — صريحة وواضحة للزبون
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "⏳ قيد المراجعة", cls: "bg-amber-500/20 text-amber-300" },
  confirmed: { text: "✅ تمت", cls: "bg-green-500/20 text-green-300" },
  rejected: { text: "❌ مرفوضة", cls: "bg-red-500/20 text-red-300" },
};

const inputCls = "w-full rounded-lg border border-slate-600 bg-slate-900/70 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none";

export default function AccountPage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = بيحمّل
  const [meError, setMeError] = useState(false); // فشل تحميل بيانات الحساب
  const [meRetry, setMeRetry] = useState(0); // عداد إعادة المحاولة
  const [mode, setMode] = useState<"login" | "register">("login");
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [credits, setCredits] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // حقول الدخول
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  // حقول التسجيل
  const [rEmail, setREmail] = useState("");
  const [rUsername, setRUsername] = useState("");
  const [rPassword, setRPassword] = useState("");
  // 💰 نموذج موحد: محفظة واحدة — لا مفتاح خاص للزبون ولا رصيد مجاني
  // ⭐ تقييم الموقع — نجوم + تعليق (تقييم واحد لكل مستخدم، بيتحدث بدل ما يتكرر)
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [rateMsg, setRateMsg] = useState("");
  const [rateBusy, setRateBusy] = useState(false);
  // 🔵 زر Google — يظهر فقط لو مفاتيح OAuth مضافة في البيئة فعليًا

  // ⭐ تحميل تقييمي الحالي (لو قيّمت قبل كده)
  useEffect(() => {
    if (me) {
      fetch("/api/rate")
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.mine === "number") { setMyRating(d.mine); setMyComment(String(d.my_comment || "")); }
        })
        .catch(() => undefined);
    }
  }, [me]);



  // ⭐ حفظ التقييم
  const submitRating = async () => {
    if (!myRating) { setRateMsg("⚠️ اختار عدد النجوم الأول (من 1 لـ 5)"); return; }
    setRateBusy(true); setRateMsg("");
    try {
      const res = await fetch("/api/rate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: myRating, comment: myComment }) });
      const d = await res.json();
      if (!res.ok) throw new Error(String(d.error || "تعذر الحفظ"));
      setRateMsg("🌟 شكرًا لتقييمك! ظهر للعالم في المتوسط الحقيقي بتاع الموقع");
    } catch (e) { setRateMsg(`⚠️ ${(e as Error).message}`); }
    finally { setRateBusy(false); }
  };

  // 🗑️ حذف طلب شحن من قائمة الزبون (المعّلق فقط — المؤكد يبقى في السجلات)
  const deleteRequest = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/payments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "⚠️ تعذر حذف الطلب");
      else setMsg("🗑️ تم حذف الطلب من قائمتك");
      void loadRequests();
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setBusy(false);
    }
  };

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/account/requests");
      if (res.ok) {
        const d = await res.json();
        setRequests(Array.isArray(d.requests) ? d.requests : []);
        if (typeof d.credits === "number") setCredits(d.credits);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // مهلة 12 ثانية — الصفحة لا تبقى على «بيحمّل…» للأبد مهما كان الخطأ
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    fetch("/api/auth/me", { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user || null);
        if (d.user) {
          setCredits(typeof d.user.credits === "number" ? d.user.credits : 0);
          void loadRequests();
        }
      })
      .catch(() => setMeError(true))
      .finally(() => clearTimeout(timer));
  }, [loadRequests, meRetry]);

  const login = async () => {
    if (!identifier.trim() || !password) return setMsg("⚠️ اكتب الإيميل/اسم المستخدم وكلمة المرور");
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "⚠️ فشل الدخول");
      else {
        setMe(d.user);
        setPassword("");
        void loadRequests();
      }
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (!rEmail.trim() || !rUsername.trim() || !rPassword) return setMsg("⚠️ املأ الإيميل واسم المستخدم وكلمة المرور");
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: rEmail.trim(),
          username: rUsername.trim(),
          password: rPassword,
        }),
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "⚠️ فشل التسجيل");
      else {
        setMe(d.user);
        setRPassword("");
        // 💰 لا رصيد مجاني — رسالة ترحيب توجيهية للشحن
        setMsg("✅ أهلًا بيك في كوكب الكرتون! 💳 اشحن رصيدك من صفحة الشحن وابدأ توليد فورًا (كل 50ج = 1000 كريدت)");
        void loadRequests();
      }
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setMe(null);
      setRequests([]);
      setMsg("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <style>{`@keyframes twinkle{0%,100%{opacity:.9}50%{opacity:.25}}`}</style>
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        {[[18, 12], [80, 20], [40, 8], [88, 55], [8, 48], [66, 85]].map(([x, y], i) => (
          <span key={i} className="absolute h-1 w-1 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, animation: `twinkle ${2.5 + (i % 4)}s ease-in-out infinite` }} />
        ))}
      </div>

      <div className="relative mx-auto max-w-2xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">
            🔐 <span className="bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent">حسابي</span> — كوكب الكرتون
          </h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/recharge" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">💳 شحن</a>
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>

        {msg && <div className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">{msg}</div>}

        {me === undefined && meError ? (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-rose-300">⚠️ تعذّر تحميل الحساب — تأكد من اتصالك بالإنترنت.</p>
            <button onClick={() => { setMeError(false); setMeRetry((n) => n + 1); }} className="mt-4 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-2 text-sm font-bold text-amber-200">🔄 أعد المحاولة</button>
            <p className="mt-3 text-xs text-slate-400">لو المشكلة متكررة: حدّث الصفحة بالكامل (Ctrl+Shift+R) عشان المتصفح يجيب آخر نسخة من الموقع.</p>
          </div>
        ) : me === undefined ? (
          <p className="py-16 text-center text-sm text-slate-300">⏳ بيحمّل…</p>
        ) : me === null ? (
          /* ---------- غير مسجل: دخول / تسجيل ---------- */
          <>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-900/60 p-1">
              <button onClick={() => { setMode("login"); setMsg(""); }} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${mode === "login" ? "bg-gradient-to-r from-cyan-500 to-violet-600 text-amber-200" : "text-slate-300 hover:text-slate-200"}`}>🔑 سجل دخول</button>
              <button onClick={() => { setMode("register"); setMsg(""); }} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${mode === "register" ? "bg-gradient-to-r from-cyan-500 to-violet-600 text-amber-200" : "text-slate-300 hover:text-slate-200"}`}>✨ حساب جديد</button>
            </div>
            {mode === "login" ? (
              <div className="space-y-2">
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="الإيميل أو اسم المستخدم" className={inputCls} />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="كلمة المرور" className={inputCls} />
                <button onClick={login} disabled={busy} className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-amber-200 shadow-lg shadow-violet-500/25 hover:brightness-110 disabled:opacity-50">
                  {busy ? "⏳…" : "🔑 ادخل حسابك"}
                </button>
                <p className="pt-1 text-center text-xs text-slate-400">ما عندكش حساب؟ اضغط «✨ حساب جديد» فوق</p>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={rEmail} onChange={(e) => setREmail(e.target.value)} placeholder="الإيميل" inputMode="email" className={inputCls} />
                <input value={rUsername} onChange={(e) => setRUsername(e.target.value)} placeholder="اسم المستخدم (بدون مسافات)" className={inputCls} />
                <input value={rPassword} onChange={(e) => setRPassword(e.target.value)} type="password" placeholder="كلمة المرور (8 أحرف على الأقل)" className={inputCls} />
                <button onClick={register} disabled={busy} className="w-full rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-2.5 text-sm font-bold text-amber-200 shadow-lg shadow-green-500/25 hover:brightness-110 disabled:opacity-50">
                  {busy ? "⏳…" : "✨ اعمل حسابي"}
                </button>
                <p className="pt-1 text-center text-xs text-slate-400">الحساب مجاني والرصيد بتشحنه من صفحة «💳 شحن» — وبتتابع طلبات الشحن وحالتها في أي وقت</p>
              </div>
            )}
          </section>
          </>
        ) : (
          /* ---------- مسجل: لوحة الحساب ---------- */
          <>
            <section className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-amber-200">أهلًا {me.username} 👋</h2>
                    <p className="mt-0.5 text-xs text-slate-300">{me.email}{me.created_at ? ` • عضو من ${(me.created_at || "").slice(0, 10)}` : ""}</p>
                  </div>
                  <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-5 py-2 text-center shadow-lg shadow-green-500/10">
                    <p className="text-[10px] font-bold text-green-200/70">💳 رصيدك</p>
                    <p className="text-xl font-black text-green-300">{credits} كريدت</p>
                  </div>
                </div>
                <button onClick={logout} disabled={busy} className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50">🚪 خروج</button>
              </div>
            </section>

            {/* ⭐ قيّم الموقع — رأيك بيساعدنا نطور، والمتوسط الحقيقي بيظهر على الرئيسية */}
            <section id="rate" className="mt-4 rounded-2xl border border-amber-400/30 bg-gradient-to-l from-amber-500/10 to-yellow-500/5 p-5 shadow-lg">
              <h2 className="mb-1 font-bold text-amber-200">⭐ قيّم الموقع — رأيك بيساعدنا نطور</h2>
              <p className="mb-3 text-xs text-slate-300">اختر النجوم واكتب رأيك (اختياري) — تقييمك بيتحفظ باسمك مرة واحدة ويتحدث لو عدلته، والمتوسط الحقيقي بيظهر على الصفحة الرئيسية</p>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMyRating(n)}
                    className={`text-3xl transition hover:scale-110 ${n <= myRating ? "opacity-100" : "opacity-35 grayscale"}`}
                    title={`${n} ${n === 1 ? "نجمة" : "نجوم"}`}
                    aria-label={`تقييم ${n}`}
                  >⭐</button>
                ))}
                <span className="ml-2 text-sm font-bold text-amber-300">{myRating ? `${myRating}/5` : "اختار تقييمك"}</span>
              </div>
              <textarea
                value={myComment}
                onChange={(e) => setMyComment(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="اكتب رأيك في الموقع — إيه اللي عجبك وإيه اللي نفسك نضيفه؟ (اختياري)"
                className="mt-3 w-full rounded-lg border border-white/15 bg-black/40 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none"
              />
              <div className="mt-2 flex items-center gap-3">
                <button onClick={submitRating} disabled={rateBusy} className="btn-gold px-5 py-2 text-sm">{rateBusy ? "⏳ بيحفظ…" : myRating && myComment !== "" && rateMsg.includes("شكرًا") ? "🔄 حدّث تقييمي" : "🌟 ابعت تقييمي"}</button>
                {rateMsg && <p className={`text-xs font-bold ${rateMsg.includes("⚠️") ? "text-red-300" : "text-green-300"}`}>{rateMsg}</p>}
              </div>
            </section>

            {/* 💰 نموذج موحد — لا إحالات ولا كريدت مجاني */}

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <h2 className="mb-1 font-bold text-amber-200">💳 طلبات الشحن بتاعتك ({requests.length})</h2>
              <p className="mb-3 text-xs text-slate-300">كل طلب بتسجله من صفحة الشحن يظهر هنا لحظة بلحظة — ولما المشرف يؤكد الطلب، رصيدك بيتشحن أوتوماتيك (كل 50ج = 1000 كريدت)</p>
              {requests.length === 0 ? (
                <div className="rounded-xl bg-slate-900/50 p-4 text-center">
                  <p className="text-sm text-slate-300">مفيش طلبات لسه</p>
                  <a href="/recharge" className="mt-2 inline-block rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-xs font-bold text-amber-200 hover:brightness-110">💳 اشحن رصيدك من 50 جنيه</a>
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/60 p-3 text-sm">
                      <div>
                        <span className="font-bold text-amber-200">{METHOD_LABEL[r.method] || r.method}</span>
                        <span className="mr-2 text-green-300">{r.amount} ج.م</span>
                        {r.reference && <span className="text-xs text-slate-400"> • مرجع: {r.reference}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{(r.created_at || "").slice(0, 10)}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${(STATUS_LABEL[r.status] || STATUS_LABEL.pending).cls}`}>
                          {(STATUS_LABEL[r.status] || STATUS_LABEL.pending).text}
                        </span>
                        {/* 🗑️ زر الحذف بجوار الدفع — للطلبات المعّلقة فقط */}
                        {r.status === "pending" && (
                          <button
                            onClick={() => deleteRequest(r.id)}
                            disabled={busy}
                            title="حذف الطلب من قائمتك (الطلبات المؤكدة تبقى في السجلات)"
                            className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            🗑️ حذف
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 💰 محفظة واحدة — التوليد بمفاتيح المنصة السرية خلف الكواليس،
                والزبون لا يدخل أي مفتاح ولا يحتاج حسابًا لدى أي مزود */}
          </>
        )}
        <FloatingWhatsApp />
      </div>
    </div>
  );
}
