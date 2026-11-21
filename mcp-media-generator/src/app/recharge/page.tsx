"use client";

// ============================================================
// 💳 شحن رصيد المصنع — أسعار بالجنيه المصري (أرخص باقة 50ج)
// فودافون كاش + إنستاباي + اسم صاحب الحساب + زر نسخ
// نموذج الطلب: الاسم + المحفظة المحوّل منها + المبلغ + إيصال اختياري
// بعد الإرسال: رقم طلب + وقت متوقع — حماية سبام (فخ بصري + تعطيل الزر + حد معدل بالسيرفر)
// قسم الطلبات والإعدادات للمشرف فقط (يفتح تلقائيًا بعد دخول اللوحة)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import ChatWidget from "@/components/ChatWidget";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import { PACKAGES } from "@/lib/packages";
import ThemeToggle from "@/components/ThemeToggle";

interface PaymentRequest {
  id: string;
  name: string;
  method: string;
  amount: string;
  reference: string | null;
  status: string;
  wallet_from: string | null;
  receipt: string | null;
  created_at: string | null;
}

const METHOD_LABEL: Record<string, string> = { vodafone: "فودافون كاش", instapay: "إنستاباي", visa: "فيزا / تحويل بنكي", paypal: "PayPal" };
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "⏳ قيد المراجعة", cls: "bg-amber-500/20 text-amber-300" },
  confirmed: { text: "✅ تمت", cls: "bg-green-500/20 text-green-300" },
  rejected: { text: "❌ مرفوضة", cls: "bg-red-500/20 text-red-300" },
};

// توحيد التسعير: المشهد = 15 كريدت بالظبط — بدون أي مدى
// الباقات الرسمية من مصدر واحد: src/lib/packages.ts (50ج→1000، 100ج→2000، 200ج→4000)
const SCENE_COST = 15;

export default function RechargePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [wallets, setWallets] = useState<{ vodafone_number: string; instapay_handle: string; wallet_holder_name: string; admin_whatsapp: string }>({ vodafone_number: "", instapay_handle: "", wallet_holder_name: "", admin_whatsapp: "" });
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // نموذج طلب الشحن
  const [pName, setPName] = useState("");
  const [pMethod, setPMethod] = useState("vodafone");
  const [pAmount, setPAmount] = useState("");
  const [pFrom, setPFrom] = useState("");

  const [pRef, setPRef] = useState("");
  const [pReceipt, setPReceipt] = useState("");
  const [pHp, setPHp] = useState(""); // فخ بصري ضد الروبوتات — لازم يفضل فاضي
  // نتيجة الطلب: رقم + وقت متوقع + تبريد زر الإرسال
  const [doneNo, setDoneNo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [copied, setCopied] = useState("");
  // إعدادات المشرف
  const [voda, setVoda] = useState("");
  const [insta, setInsta] = useState("");
  const [holder, setHolder] = useState("");
  const [waAdmin, setWaAdmin] = useState("");
  const [videoModel, setVideoModel] = useState("");   // موديل توليد الفيديو (توفير الكريدت)
  const [adsClient, setAdsClient] = useState("");     // أدسنس: معرف الناشر
  const [adsSlot, setAdsSlot] = useState("");         // أدسنس: معرف الوحدة

  const load = useCallback(async () => {
    try {
      // المحافظ عامة للجميع
      const wRes = await fetch("/api/wallets");
      const w = await wRes.json();
      setWallets({ vodafone_number: w.vodafone_number || "", instapay_handle: w.instapay_handle || "", wallet_holder_name: w.wallet_holder_name || "", admin_whatsapp: w.admin_whatsapp || "" });
      // بيانات المشرف (طلبات + إعدادات واتساب) — تتاح فقط داخل جلسة اللوحة
      const [sRes, rRes] = await Promise.all([fetch("/api/settings"), fetch("/api/payments")]);
      if (sRes.ok && rRes.ok) {
        const s = await sRes.json();
        const r = await rRes.json();
        const set = s.settings || {};
        setIsAdmin(true);
        setVoda(set.vodafone_number || "");
        setInsta(set.instapay_handle || "");

        setHolder(set.wallet_holder_name || "");
        setWaAdmin(set.admin_whatsapp || "");
        setVideoModel(set.video_model || "");
        setAdsClient(set.adsense_client || "");
        setAdsSlot(set.adsense_slot || "");
        setRequests(Array.isArray(r.requests) ? r.requests : []);
      } else {
        setIsAdmin(false);
        setRequests([]);
      }
    } catch {
      setMsg("⚠️ تعذر تحميل البيانات");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // عداد تبريد زر الإرسال بعد نجاح الطلب
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 1800);
    } catch {}
  };

  // اختيار صورة الإيصال — تحقق من النوع والحجم قبل القراءة
  const pickReceipt = (file: File | null) => {
    if (!file) return setPReceipt("");
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return setMsg("⚠️ الإيصال لازم يكون صورة PNG أو JPEG أو WebP");
    if (file.size > 500 * 1024) return setMsg("⚠️ حجم صورة الإيصال لازم يكون أقل من 500KB — صغّر الصورة وجرّب تاني");
    const reader = new FileReader();
    reader.onload = () => { setPReceipt(String(reader.result || "")); setMsg(""); };
    reader.readAsDataURL(file);
  };

  const saveSettings = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vodafone_number: voda.trim(),
          instapay_handle: insta.trim(),

          wallet_holder_name: holder.trim(),
          admin_whatsapp: waAdmin.trim(),
          video_model: videoModel.trim(),
          adsense_client: adsClient.trim(),
          adsense_slot: adsSlot.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "⚠️ فشل الحفظ");
      else {
        setMsg("✅ الإعدادات اتحفظت — المحافظ واسم صاحب الحساب ظاهرين دلوقتي للزبائن");
        await load();
      }
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async () => {
    if (!pName.trim() || !pAmount.trim() || !pFrom.trim()) {
      setMsg("⚠️ املأ الاسم ورقم المحفظة اللي حوّلت منها والمبلغ");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pName.trim(), method: pMethod, amount: pAmount.trim(), reference: pRef.trim(), wallet_from: pFrom.trim(), receipt: pReceipt || undefined, hp: pHp }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.error || "⚠️ فشل إرسال الطلب");
      } else {
        setDoneNo(d.request_no || "?");
        setMsg(`✅ اتسجل طلبك برقم #${d.request_no} — ${d.eta || "بنضيف الرصيد بعد تأكيد التحويل خلال 24 ساعة كحد أقصى"}.\n🔖 احفظ الرقم ده للمتابعة معانا.`);
        setPAmount("");
        setPRef("");
        setPReceipt("");
        setCooldown(45); // تعطيل الزر 45 ثانية بعد الإرسال
        if (isAdmin) await load();
        if (d.wa_link) window.open(d.wa_link, "_blank");
      }
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setBusy(false);
    }
  };

  const markRequest = async (id: string, status: string) => {
    setBusy(true);
    try {
      await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const delRequest = async (id: string) => {
    setBusy(true);
    try {
      await fetch("/api/payments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const walletsReady = Boolean(voda && waAdmin);

  const inputCls = "rounded-lg border border-slate-600 bg-slate-900/70 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none";

  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <style>{`
        @keyframes twinkle{0%,100%{opacity:.9}50%{opacity:.25}}
      `}</style>

      {/* نجوم الكون */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        {[[14, 10], [82, 16], [38, 6], [90, 48], [6, 42], [70, 82], [50, 92], [24, 70]].map(([x, y], i) => (
          <span key={i} className="absolute h-1 w-1 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, animation: `twinkle ${2.5 + (i % 4)}s ease-in-out infinite` }} />
        ))}
      </div>

      <div className="relative mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-amber-200">
              💳 شحن رصيد <span className="bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent">كوكب الكرتون</span>
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              فودافون كاش • إنستاباي • تواصل واتساب فوري
              <span className="mr-2 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-300">أرخص باقة: 50 جنيه 🚀</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAdmin && (
              <a href="/episodes" className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20">🏭 المصنع</a>
            )}
            <a href="/account" className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm text-fuchsia-300 hover:bg-fuchsia-500/20">🔐 حسابي</a>
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>

        {msg && <div className="mb-4 whitespace-pre-line rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">{msg}</div>}

        {/* الباقات — بالجنيه المصري، المشهد = 15 كريدت بالظبط — بستايل بطاقات الأسعار الذهبية */}
        <section className="mb-6 grid gap-3 md:grid-cols-3">
          {PACKAGES.map((p, idx) => (
            <div key={p.egp} className={`rounded-xl border-2 p-4 text-center shadow-lg ${idx === 1 ? "border-amber-400/70 bg-gradient-to-b from-amber-500/12 to-black/40" : idx === 0 ? "border-emerald-400/50 bg-gradient-to-b from-emerald-500/10 to-black/40" : "border-sky-400/50 bg-gradient-to-b from-sky-500/10 to-black/40"}`}>
              <span className="mb-1 block text-2xl">{idx === 1 ? "👑" : idx === 0 ? "💎" : "🚀"}</span>
              <p className="text-2xl font-extrabold text-green-300">{p.egp} ج.م</p>
              <p className="mt-1 text-sm text-slate-200">{p.credits.toLocaleString("en")} كريدت</p>
              <p className="mt-1 text-xs text-slate-300">= {p.scenes} × 8 ثوانٍ (المشهد = {SCENE_COST} كريدت بالظبط)</p>
            </div>
          ))}
        </section>

        {/* طرق الدفع — الأرقام واضحة مع زر نسخ واسم صاحب الحساب */}
        <section className="mb-6 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 shadow-lg">
            <p className="mb-1 font-bold text-red-300">📱 فودافون كاش</p>
            {wallets.vodafone_number ? (
              <div className="flex items-center gap-2">
                <p className="flex-1 select-all rounded bg-slate-950/50 p-2 font-mono text-lg tracking-wider text-red-200">{wallets.vodafone_number}</p>
                <button onClick={() => copy(wallets.vodafone_number, "voda")} className="shrink-0 rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/30">
                  {copied === "voda" ? "✅ اتنسخ" : "📋 نسخ"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-300">⚠️ جاري تجهيز المحفظة — تواصل واتساب وتمشيلك الأرقام فورًا</p>
            )}
          </div>
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 shadow-lg">
            <p className="mb-1 font-bold text-violet-300">🏦 إنستاباي</p>
            {wallets.instapay_handle ? (
              <div className="flex items-center gap-2">
                <p className="flex-1 select-all rounded bg-slate-950/50 p-2 font-mono text-lg tracking-wider text-violet-200">{wallets.instapay_handle}</p>
                <button onClick={() => copy(wallets.instapay_handle, "insta")} className="shrink-0 rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/30">
                  {copied === "insta" ? "✅ اتنسخ" : "📋 نسخ"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-300">⚠️ جاري تجهيز المحفظة — تواصل واتساب وتمشيلك الأرقام فورًا</p>
            )}
          </div>
</section>
        {wallets.wallet_holder_name ? (
          <p className="-mt-4 mb-6 text-center text-sm text-slate-300">
            👤 اسم صاحب الحساب: <b className="text-amber-200">{wallets.wallet_holder_name}</b> — حوّل على نفس الاسم بالظبط، ولو الاسم مختلف الطلب هيتأخر للتأكد.
          </p>
        ) : (
          <p className="-mt-4 mb-6 text-center text-xs text-slate-400">
            ⚠️ اسم صاحب الحساب لسه بيتسجل — قبل ما تحوّل ابعتنا واتساب للتأكيد، وبعد التحويل سجّل الطلب هنا وسيب الباقي علينا.
          </p>
        )}

        {/* نموذج طلب الشحن — للجميع */}
        <section className="mb-4 rounded-xl border border-white/10 bg-white/5 p-5 shadow-lg">
          <h2 className="mb-1 font-bold text-amber-200">حوّلت الرصيد؟ سجّل طلبك هنا</h2>
          <p className="mb-3 text-xs text-slate-300">خطوتين بس: 1️⃣ حوّل المبلغ لأي محفظة من الأعلى 2️⃣ سجّل الطلب هنا — بعد تأكيد التحويل بنضيف الرصيد خلال 24 ساعة كحد أقصى</p>
          <div className="grid gap-2 md:grid-cols-2">
            <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="الاسم" className={inputCls} />
            <select value={pMethod} onChange={(e) => setPMethod(e.target.value)} className={inputCls}>
              <option value="vodafone">فودافون كاش</option>
              <option value="instapay">إنستاباي</option>

            </select>
            <input value={pFrom} onChange={(e) => setPFrom(e.target.value)} placeholder={pMethod === "vodafone" ? "رقم فودافون اللي حوّلت منه (مثال: 010xxxxxxxx)" : "عنوان إنستاباي اللي حوّلت منه"} className={inputCls} />
            <input value={pAmount} onChange={(e) => setPAmount(e.target.value)} placeholder="المبلغ بالجنيه المصري (رقم فقط)" inputMode="decimal" className={inputCls} />
            <input value={pRef} onChange={(e) => setPRef(e.target.value)} placeholder="رقم عملية التحويل (لو متاح)" className={inputCls} />
            <input value={pReceipt ? "✅ صورة الإيصال مختارة — اختيار" : ""} readOnly placeholder="صورة الإيصال (اختياري)" onFocus={() => document.getElementById("receipt-input")?.click()} onClick={() => document.getElementById("receipt-input")?.click()} className={`${inputCls} cursor-pointer`} />
            <input
              id="receipt-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickReceipt(e.target.files?.[0] || null)}
              className="hidden"
            />
            <input value={pHp} onChange={(e) => setPHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={submitPayment} disabled={busy || cooldown > 0} className="rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-2 text-sm font-bold text-amber-200 shadow-lg shadow-green-500/25 hover:brightness-110 disabled:opacity-50">
              {busy ? "⏳ جاري التسجيل…" : cooldown > 0 ? `⏳ استنى ${cooldown}ث` : "💳 سجّل الطلب وابعت واتساب"}
            </button>
            {pReceipt && (
              <button onClick={() => setPReceipt("")} className="text-xs text-red-300 hover:underline">🗑️ شيل صورة الإيصال</button>
            )}
          </div>
          <p className="mt-3 border-t border-white/10 pt-2 text-xs text-slate-400">
            بتسجل الطلب فأنت موافق على <a href="/terms" className="text-cyan-300 hover:underline">الشروط والأحكام</a> و
            <a href="/refund" className="text-cyan-300 hover:underline"> سياسة الاسترداد</a>.
          </p>
        </section>

        {/* المشرف فقط: الطلبات + الإعدادات */}
        {isAdmin ? (
          <>
            <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <h2 className="mb-3 font-bold text-amber-200">طلبات الشحن ({requests.length})</h2>
              {requests.length === 0 ? (
                <p className="text-sm text-slate-300">لا توجد طلبات بعد</p>
              ) : (
                <div className="space-y-2">
                  {requests.map((r) => {
                    const st = STATUS_LABEL[r.status] || STATUS_LABEL.pending;
                    return (
                      <div key={r.id} className="rounded-lg bg-slate-900/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-amber-200">{r.name}</span>
                            <span className="mr-2 text-slate-300">— {METHOD_LABEL[r.method] || r.method} • {r.amount} ج.م</span>
                            {r.wallet_from && <span className="mr-2 text-xs text-cyan-300" dir="ltr">📱 {r.wallet_from}</span>}
                            {r.reference && <span className="text-xs text-slate-400"> • مرجع: {r.reference}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.text}</span>
                            {r.status !== "confirmed" && (
                              <button onClick={() => markRequest(r.id, "confirmed")} disabled={busy} className="text-xs text-green-300 hover:underline">تأكيد</button>
                            )}
                            {r.status !== "rejected" && (
                              <button onClick={() => markRequest(r.id, "rejected")} disabled={busy} className="text-xs text-amber-300 hover:underline">رفض</button>
                            )}
                            <button onClick={() => delRequest(r.id)} disabled={busy} className="text-xs text-red-400 hover:underline">حذف</button>
                          </div>
                        </div>
                        {r.receipt && (
                          <a href={r.receipt} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-cyan-300 hover:underline">🖼️ عرض صورة الإيصال</a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-5 shadow-lg">
              <h2 className="mb-1 font-bold text-amber-200">⚙️ إعدادات المحافظ والواتساب (المشرف)</h2>
              <p className="mb-3 text-xs text-slate-300">
                أرقامك واسم صاحب الحساب تظهر فورًا للزبائن في الأعلى. كل طلب شحن يفتح للمشرف رابط واتساب جاهز بملخص الطلب — تأكيد بضغطة واحدة بدون أي خدمات إشعارات خارجية.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <input value={voda} onChange={(e) => setVoda(e.target.value)} placeholder="رقم فودافون كاش (مثال: 010xxxxxxxx)" inputMode="tel" className={inputCls} />
                <input value={insta} onChange={(e) => setInsta(e.target.value)} placeholder="عنوان إنستاباي (مثال: name@instapay)" className={inputCls} />
                <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="اسم صاحب الحساب (يظهر للزبائن)" className={`${inputCls} md:col-span-2`} />
                <input value={waAdmin} onChange={(e) => setWaAdmin(e.target.value)} placeholder="واتساب المشرف بمفتاح الدولة (مثال: 2010xxxxxxxx)" inputMode="tel" className={inputCls} />
                <input value={videoModel} onChange={(e) => setVideoModel(e.target.value)} placeholder="💰 موديل الفيديو للتوفير (كود من docs.kie.ai — فاضي = grok الافتراضي)" className={`${inputCls} md:col-span-2`} />
                <input value={adsClient} onChange={(e) => setAdsClient(e.target.value)} placeholder="📢 أدسنس: معرف الناشر (ca-pub-...) — يظهر بدل البانر الداخلي" className={`${inputCls} md:col-span-2`} />
                <input value={adsSlot} onChange={(e) => setAdsSlot(e.target.value)} placeholder="📢 أدسنس: معرف وحدة الإعلان (data-ad-slot)" className={`${inputCls} md:col-span-2`} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={saveSettings} disabled={busy} className="rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2 text-sm font-bold text-amber-200 shadow-lg shadow-violet-500/25 hover:brightness-110 disabled:opacity-50">
                  💾 احفظ الإعدادات
                </button>
                <span className={`text-xs ${walletsReady ? "text-green-300" : "text-slate-400"}`}>
                  {walletsReady ? "✅ إعدادات المحافظ والواتساب جاهزة" : "أكمل أرقام المحافظ وواتساب المشرف ليعمل الشحن والتواصل"}
                </span>
              </div>
            </section>
          </>
        ) : (
          <p className="mb-10 text-center text-xs text-slate-400">أرسل طلب الشحن وسنؤكده ونضيف رصيدك بأسرع وقت 🚀</p>
        )}
        <ChatWidget />
        <FloatingWhatsApp />
      </div>
    </div>
  );
}
