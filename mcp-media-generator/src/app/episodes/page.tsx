"use client";

// ============================================================
// 🏭 مصنع الحلقات — قائمة انتظار السيناريوهات + المراجعة والنشر
// تضاف السيناريوهات هنا، والحلقات تتولد أوتوماتيكيًا من قائمة الانتظار
// عند توفر الوقود — بدون مواعيد محددة — وبجانب كل حلقة حزمة النشر الجاهزة
// (عنوان + وصف + هاشتاقات) للنسخ ليوتيوب.
// ============================================================
import { useCallback, useEffect, useState } from "react";

interface PublishKit {
  youtube_title: string;
  youtube_description: string;
  hashtags: string;
}

interface QueueItem {
  id: string;
  title: string;
  script: string;
  status: string; // pending | generating | done | failed
  publish: PublishKit;
  task_id: string | null;
  task_status: string | null;
  task_progress: number | null; // نسبة تقدم توليد المشهد 0-100
  thumbnail_url: string | null; // الصورة المصغرة الذكية للمجموعة
  thumbnail_task_id: string | null;
  result_urls: string[];
  error_message: string | null;
  created_at: string;
  group_id: string | null;
  scene_no: number | null;
  merge_status: string | null;
  merged_url: string | null;
  is_public: boolean; // معلَّم النشر العلني في الرئيسية (المشرف فقط)
}

interface YTStatus {
  configured: boolean;
  linked: boolean;
  channel_title: string | null;
  redirect_uri: string;
}

const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  pending: { text: "⏳ في الانتظار", cls: "bg-amber-100 text-amber-800" },
  generating: { text: "⚙️ بتتولد الآن", cls: "bg-blue-100 text-blue-800" },
  done: { text: "✅ جاهزة للنشر", cls: "bg-green-100 text-green-800" },
  failed: { text: "❌ فشلت", cls: "bg-red-100 text-red-800" },
};

export default function EpisodesPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [uploading, setUploading] = useState("");
  const [fbSt, setFbSt] = useState<{ configured: boolean; connected: boolean; page: string | null; instagram: { linked: boolean; username: string | null } } | null>(null);
  const [ttSt, setTtSt] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [socialBusy, setSocialBusy] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [story, setStory] = useState("");
  const [storyCount, setStoryCount] = useState(5);
  const [storyBusy, setStoryBusy] = useState(false);
  const [ideaText, setIdeaText] = useState("");
  const [ideaCount, setIdeaCount] = useState(4);
  const [ideaAspect, setIdeaAspect] = useState("9:16");
  const [ideaBusy, setIdeaBusy] = useState(false);
  const [lastRun, setLastRun] = useState("");
  const [custKeys, setCustKeys] = useState<{ id: string; label: string; role: string; user_id?: string | null }[]>([]);
  const [custUsers, setCustUsers] = useState<{ id: string; username: string; credits: number }[]>([]);
  const [custKey, setCustKey] = useState(""); // مفتاح الفوترة: فارغ = رصيد الموقع 👑
  const [storyAspect, setStoryAspect] = useState("16:9"); // اتجاه الفيديو: شورتس أو عرضي



  const loadSocials = useCallback(async () => {
    try { setFbSt(await (await fetch("/api/facebook")).json()); } catch { /* تجاهل */ }
    try { setTtSt(await (await fetch("/api/tiktok")).json()); } catch { /* تجاهل */ }
  }, []);

  const load = useCallback(async () => {
    try {
      // تحديث تقدم المهام الجارية من المزود أولًا — حتى يتحرك شريط التحميل
      void fetch("/api/tasks?limit=5").catch(() => undefined);
      const res = await fetch("/api/queue");
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      // مؤشر آخر تشغيل تلقائي للمنبه
      const sRes = await fetch("/api/settings");
      if (sRes.ok) {
        const s = await sRes.json();
        setLastRun(s.settings?.last_cron_run || "");
      }
    } catch {
      setMsg("⚠️ تعذر تحميل القائمة");
    }
  }, []);

  useEffect(() => {
    void load();
    void loadSocials();
    // مفاتيح الفوترة لقائمة اختيار الزبون + حسابات الزبائن وأرصدتهم
    fetch("/api/keys").then((r) => r.json()).then((d) => {
      setCustKeys(((d.keys || []) as { id: string; label: string; role: string; status: string; user_id?: string | null }[]).filter((k) => k.status === "active"));
    }).catch(() => undefined);
    fetch("/api/customers").then((r) => r.json()).then((d) => {
      setCustUsers(Array.isArray(d.users) ? d.users : []);
    }).catch(() => undefined);
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  // رسالة الخصم: لو المشهد اتحاسب على رصيد زبون مرتبط بمفتاحه (15 كريدت/مشهد)
  const deductMsg = (d: { deducted?: number; balance?: number | null }) =>
    d.deducted ? ` — 📉 اتحسم ${d.deducted} كريدت${d.balance != null ? ` (المتبقي في حسابه: ${d.balance})` : ""}` : "";

  // الزبون المرتبط بالمفتاح المختار — لعرض رصيده المتبقي جنب قائمة الاختيار
  const selectedCustUser = (() => {
    const k = custKeys.find((x) => x.id === custKey);
    return k?.user_id ? custUsers.find((x) => x.id === k.user_id) || null : null;
  })();

  const copy = (label: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "⚠️ حدث خطأ");
      else setMsg("");
      return data;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!title.trim() || !script.trim()) {
      setMsg("⚠️ املأ العنوان والسيناريو");
      return;
    }
    await post({ action: "add", title, script });
    setTitle("");
    setScript("");
    await load();
  };

  const addAi = async () => {
    if (!aiTopic.trim()) return setMsg("⚠️ اكتب فكرة الحلقة أولًا");
    setAiBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/episodes/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic.trim() }),
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "❌ فشل توليد السيناريو");
      else {
        setMsg(`✨ السيناريو اتكتب بالذكاء الاصطناعي! «${d.title}» — اتضاف لقائمة الانتظار`);
        setAiTopic("");
        await load();
      }
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setAiBusy(false);
    }
  };

  // إنشاء حلقة كاملة من فكرة واحدة: قصة بداية→نهاية + وصف + كلمات مفتاحية + صورة مصغرة
  const createIdea = async () => {
    if (!ideaText.trim()) return setMsg("⚠️ اكتب فكرة الحلقة أولًا");
    setIdeaBusy(true);
    setMsg("🎬 بيكتب القصة كاملة ويجهز الوصف والكلمات المفتاحية والصورة المصغرة… استنى ثواني");
    try {
      const res = await fetch("/api/episodes/idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: ideaText.trim(), scenes: ideaCount, key_id: custKey || undefined, aspect_ratio: ideaAspect }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.error || "❌ فشل إنشاء الحلقة من الفكرة");
      } else {
        const t = d.thumbnail || {};
        setMsg(
          `✨ قصة «${d.title}» جاهزة — ${d.count} مشاهد في الطابور بتتولد بالترتيب من البداية للنهاية وبتتدمج تلقائيًا + الوصف والكلمات المفتاحية اتجهزوا` +
            (t.ok ? " + 🖼️ الصورة المصغرة جاهزة ✓" : t.taskId ? " + 🖼️ الصورة المصغرة بتتولد — اضغط تحديث الصورة بعد لحظات" : "")
        );
        setIdeaText("");
        await load();
      }
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setIdeaBusy(false);
    }
  };

  // استكمال صورة مصغرة قيد التوليد (تحدّث المهمة من المزود وتخزن الرابط)
  const refreshThumb = async (groupId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/episodes/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      const d = await res.json();
      setMsg(d.ok ? "🖼️ الصورة المصغرة جاهزة ✓" : d.error || "الصورة لسه بتتولد — جرّب تاني بعد لحظات");
      await load();
    } catch {
      setMsg("⚠️ فشل تحديث الصورة المصغرة");
    } finally {
      setBusy(false);
    }
  };

  const trigger = async () => {
    const data = await post({ action: "trigger" });
    setMsg(data.ok ? `🎬 بدأ توليد: ${data.title}${deductMsg(data)}` : data.reason || "");
    await load();
  };

  const triggerOne = async (id: string) => {
    const data = await post({ action: "trigger", id });
    setMsg(data.ok ? `🎬 بدأ توليد: ${data.title}${deductMsg(data)}` : data.reason || "");
    await load();
  };

  const addStory = async () => {
    if (!storyTitle.trim() || !story.trim()) return setMsg("⚠️ املأ عنوان الحلقة والقصة");
    setStoryBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/episodes/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: storyTitle.trim(), story: story.trim(), scenes: storyCount, key_id: custKey || undefined, aspect_ratio: storyAspect }),
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "❌ فشل تقسيم القصة");
      else {
        setMsg(`📖 القصة اتقسمت لـ${d.count} مشاهد بالذكاء الاصطناعي واتضافت للقائمة بالترتيب — عند اكتمالها كلها بتتدمج تلقائيًا في حلقة واحدة`);
        setStory("");
        setStoryTitle("");
        await load();
      }
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setStoryBusy(false);
    }
  };

  const del = async (id: string) => {
    await post({ action: "delete", id });
    await load();
  };

  // حذف بالجملة — غير المكتملة أو المكتملة
  const delScope = async (scope: "incomplete" | "done") => {
    const label = scope === "done" ? "كل المشاهد المكتملة والحلقات المدمجة الجاهزة" : "كل المشاهد غير المكتملة (منتظرة/فاشلة/عالقة)";
    if (!window.confirm(`متأكد من حذف ${label}؟ الخطوة دي مش بتترجع.`)) return;
    await post({ action: "delete_scope", scope });
    setMsg(scope === "done" ? "🗑️ المكتملة اتمسحت" : "🗑️ غير المكتملة اتمسحت — الطابور نظيف");
    await load();
  };

  const togglePublic = async (it: QueueItem) => {
    await post({ action: it.is_public ? "unpublish" : "publish", id: it.id });
    setMsg(it.is_public ? "🙈 أُخفي من الصفحة الرئيسية" : "📢 ظهر في «أحدث الحلقات» بالصفحة الرئيسية");
    await load();
  };

  const retryIt = async (id: string) => {
    await post({ action: "retry", id });
    setMsg("🔄 المشهد رجع للطابور — اضغط «ولّد ده الآن» بعد التأكد من الرصيد");
    await load();
  };

  const publishSocial = async (it: QueueItem, platform: "telegram" | "facebook" | "instagram" | "tiktok") => {
    if (!it.result_urls[0]) return;
    setSocialBusy(`${it.id}:${platform}`);
    setMsg("");
    try {
      const title = it.publish?.youtube_title || it.title;
      const hashtags = it.publish?.hashtags || "";
      const endpoints: Record<string, [string, Record<string, unknown>]> = {
        telegram: ["/api/telegram", { action: "send_video", url: it.result_urls[0], caption: `${title} 🎬 ${hashtags}` }],
        facebook: ["/api/facebook", { action: "publish", url: it.result_urls[0], title, description: `${title}\n${hashtags}` }],
        instagram: ["/api/facebook", { action: "publish_ig", url: it.result_urls[0], title, caption: `${title} ${hashtags}` }],
        tiktok: ["/api/tiktok", { action: "publish", url: it.result_urls[0], title: `${title} ${hashtags}` }],
      };
      const [ep, payload] = endpoints[platform];
      const r = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      const names: Record<string, string> = { telegram: "تليجرام", facebook: "فيسبوك", instagram: "انستجرام", tiktok: "تيك توك" };
      if (d.ok) setMsg(`✅ انشرت على ${names[platform]}${d.url ? ` — ${d.url}` : d.publish_id ? ` — معرف النشر: ${d.publish_id}` : ""}${d.hint ? ` (${d.hint})` : ""}`);
      else setMsg(`⚠️ ${names[platform]}: ${d.error || "فشل النشر"}`);
      void loadSocials();
    } catch {
      setMsg("⚠️ فشل الاتصال");
    } finally {
      setSocialBusy("");
    }
  };

  return (
    <div dir="rtl" className="ep-dark min-h-screen p-4 md:p-8">
      {/* الثيم الغامق الإجباري — تجاوز كل أنماط الثيم الفاتح للصفحة من مكان واحد */}
      <style>{`
        .ep-dark{background:#0b1220;color:#e2e8f0}
        .ep-dark .bg-white{background:#121826!important}
        .ep-dark .bg-gray-50{background:#0b1220!important}
        .ep-dark .bg-gray-200{background:#1e293b!important}
        .ep-dark .bg-green-50{background:rgba(16,185,129,.08)!important}
        .ep-dark .bg-emerald-50{background:rgba(16,185,129,.10)!important}
        .ep-dark .bg-violet-50{background:rgba(139,92,246,.10)!important}
        .ep-dark .bg-blue-50{background:rgba(59,130,246,.10)!important}
        .ep-dark .bg-amber-50{background:rgba(245,158,11,.08)!important}
        .ep-dark .bg-slate-50{background:rgba(148,163,184,.07)!important}
        .ep-dark .text-gray-800{color:#e2e8f0!important}
        .ep-dark .text-gray-700{color:#cbd5e1!important}
        .ep-dark .text-gray-600,.ep-dark .text-slate-600{color:#94a3b8!important}
        .ep-dark .text-gray-500{color:#8494ab!important}
        .ep-dark .text-gray-400{color:#64748b!important}
        .ep-dark .text-blue-800{color:#7dd3fc!important}
        .ep-dark .text-indigo-600,.ep-dark .text-indigo-700{color:#a5b4fc!important}
        .ep-dark .text-green-700,.ep-dark .text-emerald-800{color:#6ee7b7!important}
        .ep-dark .text-amber-800,.ep-dark .text-amber-600{color:#fbbf24!important}
        .ep-dark .text-red-700{color:#fca5a5!important}
        .ep-dark .border-gray-300,.ep-dark .border-gray-200,.ep-dark .border-slate-200{border-color:#2a3550!important}
        .ep-dark .border-amber-300{border-color:rgba(245,158,11,.35)!important}
        .ep-dark .border-emerald-300,.ep-dark .border-green-300,.ep-dark .border-green-200{border-color:rgba(16,185,129,.35)!important}
        .ep-dark .border-violet-300,.ep-dark .border-violet-200{border-color:rgba(139,92,246,.35)!important}
        .ep-dark .border-blue-200{border-color:rgba(59,130,246,.35)!important}
        .ep-dark .border-red-300{border-color:rgba(239,68,68,.35)!important}
        .ep-dark .hover\\:bg-gray-100:hover{background:#1a2337!important}
        .ep-dark .hover\\:bg-green-100:hover{background:rgba(16,185,129,.15)!important}
        .ep-dark .hover\\:bg-amber-100:hover{background:rgba(245,158,11,.15)!important}
        .ep-dark .hover\\:bg-red-100:hover{background:rgba(239,68,68,.15)!important}
      `}</style>
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">🏭 مصنع الحلقات</h1>
            <p className="mt-1 text-sm text-gray-500">
              كوكب الكرتون — حلقات بتتولد أوتوماتيكيًا من قائمة الانتظار وبتظهر هنا بعد المراجعة — بدون مواعيد محددة
            </p>
          </div>
          <a href="/recharge" className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-bold text-green-700 hover:bg-green-100">
            💳 شحن الرصيد
          </a>
          <a href="/" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            ← رجوع للوحة الرئيسية
          </a>
        </header>

        {/* 🚀 شبكة النشر — حالة المنصات وأزرار الربط */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs">
          <span className="font-bold text-indigo-800">🚀 شبكة النشر:</span>
          <span className={`rounded-full px-2 py-0.5 font-bold ${fbSt?.connected ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-500"}`}>📘 فيسبوك {fbSt?.connected ? (fbSt.page || "متصل") : "غير متصل"}</span>
          <span className={`rounded-full px-2 py-0.5 font-bold ${fbSt?.instagram.linked ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-500"}`}>📸 انستجرام {fbSt?.instagram.linked ? `@${fbSt.instagram.username}` : "غير متصل"}</span>
          <span className={`rounded-full px-2 py-0.5 font-bold ${ttSt?.connected ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-500"}`}>🎵 تيك توك {ttSt?.connected ? "متصل" : "غير متصل"}</span>
          <span className={`rounded-full px-2 py-0.5 font-bold bg-gray-200 text-gray-500`}>✈️ تليجرام — إعداداته من لوحة الأدمن</span>
          {fbSt?.configured && !fbSt?.connected && <a href="/api/facebook/auth/start" className="rounded bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700">اربط صفحة فيسبوك</a>}
          {ttSt?.configured && !ttSt?.connected && <a href="/api/tiktok/auth/start" className="rounded bg-black px-3 py-1 font-bold text-white hover:bg-gray-800">اربط تيك توك</a>}
          {!fbSt?.configured && <span className="text-[10px] text-gray-500">فيسبوك/انستجرام يحتاج FACEBOOK_APP_ID/SECRET في البيئة</span>}
          {!ttSt?.configured && <span className="text-[10px] text-gray-500">تيك توك يحتاج TIKTOK_CLIENT_KEY/SECRET في البيئة</span>}
        </div>
        {lastRun && (
          <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            ⏰ آخر تشغيل تلقائي للمنبه: {lastRun}
          </p>
        )}

        {msg && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>
        )}

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-gray-800">إضافة حلقة جديدة لقائمة الانتظار</h2>
            <button
              onClick={trigger}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              🎬 ولّد الحلقة التالية الآن
            </button>
          </div>
          <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <p className="mb-2 text-sm font-bold text-violet-800">✨ اكتب السيناريو بالذكاء الاصطناعي (Gemini — مجاني من اشتراكك)</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="فكرة الحلقة بسطر واحد — مثال: مغامرات عمر والكرة الذهبية"
                className="min-w-[240px] flex-1 rounded-lg border border-violet-300 p-2.5 text-sm focus:border-violet-500 focus:outline-none"
              />
              <button
                onClick={addAi}
                disabled={aiBusy}
                className="rounded-lg bg-gradient-to-l from-violet-600 to-fuchsia-600 px-5 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
              >
                {aiBusy ? "✍️ بيكتب…" : "اكتب وضيفه للقائمة"}
              </button>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
            <p className="mb-2 text-sm font-bold text-emerald-800">💡 فكرة واحدة → حلقة كاملة أوتوماتيكيًا: القصة كاملة من البداية للنهاية + وصف يوتيوب + كلمات مفتاحية + صورة مصغرة — والمشاهد تتولد وتتدمج لوحدها</p>
            <input
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="فكرة الحلقة بسطر واحد — مثال: عمر بيلاقي كوكب من الحلويات وبيقابل تنين لطيف نايم عليه"
              className="mb-2 w-full rounded-lg border border-emerald-300 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600">المشاهد:</span>
              <select value={ideaCount} onChange={(e) => setIdeaCount(Number(e.target.value))} className="rounded-lg border border-emerald-300 bg-white p-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? "مشهد" : "مشاهد"} (~{n * 8} ثانية)</option>
                ))}
              </select>
              <span className="text-xs text-gray-600">الفوترة:</span>
              <select
                value={custKey}
                onChange={(e) => setCustKey(e.target.value)}
                className="rounded-lg border border-emerald-300 bg-white p-1.5 text-sm"
                title="مفتاح الزبون = كل مشهد يتولد يخصم 15 كريدت من حسابه المرتبط على الموقع"
              >
                <option value="">👑 رصيد الموقع (حلقات القناة)</option>
                {custKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.role === "owner" ? "👑 " : "👤 زبون: "}{k.label || k.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {selectedCustUser && (
                <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                  💳 رصيد {selectedCustUser.username}: {selectedCustUser.credits} كريدت
                </span>
              )}
              <span className="text-xs text-gray-600">الاتجاه:</span>
              <div className="flex overflow-hidden rounded-lg border border-emerald-300">
                <button
                  onClick={() => setIdeaAspect("16:9")}
                  className={`px-3 py-1.5 text-xs font-bold transition ${ideaAspect === "16:9" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-emerald-50"}`}
                  title="عرضي 16:9 — مناسب ليوتيوب والتلفزيون"
                >
                  🖥️ عرضي
                </button>
                <button
                  onClick={() => setIdeaAspect("9:16")}
                  className={`px-3 py-1.5 text-xs font-bold transition ${ideaAspect === "9:16" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-emerald-50"}`}
                  title="شورتس عمودي 9:16 — مناسب للموبايل والشورتس"
                >
                  📱 شورتس
                </button>
              </div>
              <button
                onClick={() => void createIdea()}
                disabled={ideaBusy}
                className="rounded-lg bg-gradient-to-l from-emerald-600 to-teal-600 px-5 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
              >
                {ideaBusy ? "🎬 بيكتب القصة ويعمل الحلقة…" : "✨ اعمل القصة كاملة وولّدها"}
              </button>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-sm font-bold text-amber-800">📖 حلقة كاملة من قصة واحدة — الصق القصة والذكاء الاصطناعي يقسمها لمشاهد، وعند اكتمالها بتتدمج تلقائيًا في حلقة واحدة</p>
            <input
              value={storyTitle}
              onChange={(e) => setStoryTitle(e.target.value)}
              placeholder="عنوان الحلقة — مثال: عمر والكرة الذهبية"
              className="mb-2 w-full rounded-lg border border-amber-300 p-2.5 text-sm focus:border-amber-500 focus:outline-none"
            />
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              rows={4}
              placeholder="اكتب القصة كاملة هنا بأي شكل — والمصنع يقسمها لمشاهد 8 ثوانٍ متسلسلة بشخصية ثابتة الشكل..."
              className="mb-2 w-full rounded-lg border border-amber-300 p-2.5 text-sm focus:border-amber-500 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600">الفوترة:</span>
              <select
                value={custKey}
                onChange={(e) => setCustKey(e.target.value)}
                className="rounded-lg border border-amber-300 bg-white p-1.5 text-sm"
                title="مفتاح الزبون = توليد حلقاته من رصيده هو — رصيدك يفضل سليم"
              >
                <option value="">👑 رصيد الموقع (حلقات القناة)</option>
                {custKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.role === "owner" ? "👑 " : "👤 زبون: "}{k.label || k.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {selectedCustUser && (
                <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700" title="الرصيد المتبقي في حساب هذا الزبون على الموقع — بيخصم 15 كريدت لكل مشهد">
                  💳 رصيد {selectedCustUser.username}: {selectedCustUser.credits} كريدت
                </span>
              )}
              <span className="text-xs text-gray-600">الاتجاه:</span>
              <div className="flex overflow-hidden rounded-lg border border-amber-300">
                <button
                  onClick={() => setStoryAspect("16:9")}
                  className={`px-3 py-1.5 text-xs font-bold transition ${storyAspect === "16:9" ? "bg-amber-500 text-white" : "bg-white text-gray-600 hover:bg-amber-50"}`}
                  title="عرضي 16:9 — مناسب ليوتيوب والتلفزيون"
                >
                  🖥️ عرضي
                </button>
                <button
                  onClick={() => setStoryAspect("9:16")}
                  className={`px-3 py-1.5 text-xs font-bold transition ${storyAspect === "9:16" ? "bg-amber-500 text-white" : "bg-white text-gray-600 hover:bg-amber-50"}`}
                  title="شورتس عمودي 9:16 — مناسب للموبايل والريلز والشورتس"
                >
                  📱 شورتس
                </button>
              </div>
              <span className="text-xs text-gray-600">عدد المشاهد:</span>
              <select
                value={storyCount}
                onChange={(e) => setStoryCount(Number(e.target.value))}
                className="rounded-lg border border-amber-300 bg-white p-1.5 text-sm"
              >
                {[3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n}>{n} مشاهد ({n * 8} ثانية)</option>
                ))}
              </select>
              <button
                onClick={() => setStoryCount(3)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${storyCount === 3 ? "border-green-500 bg-green-50 text-green-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
                title="وضع التوفير — أقل استهلاك للكريدت مع بقاء الحلقة كاملة المعنى"
              >
                🛟 وضع التوفير (3 مشاهد)
              </button>
              <span className="text-[11px] text-gray-400">💡 كل مشهد = كريدت — 3 مشاهد بتوفر تقريبًا نص رصيد الحلقة</span>
              <button
                onClick={addStory}
                disabled={storyBusy}
                className="mr-auto rounded-lg bg-gradient-to-l from-amber-500 to-orange-500 px-5 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
              >
                {storyBusy ? "📖 بيتقسم…" : "قسّم القصة وضيفها للقائمة"}
              </button>
            </div>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان الحلقة — مثال: عمر والكرة السحرية — الجزء الثالث"
            className="mb-3 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={5}
            placeholder="السيناريو — وصف مفصل لمشاهد الحلقة (نفس أسلوب الوصف الذي تكتبه في التوليد)..."
            className="mb-3 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={add}
            disabled={busy}
            className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
          >
            ➕ أضف لقائمة الانتظار
          </button>
        </section>

        {/* أدوات التنظيف السريع */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <span className="text-xs font-bold text-gray-500">تنظيف سريع:</span>
          <button onClick={() => void delScope("incomplete")} disabled={busy} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
            🗑️ احذف غير المكتملة
          </button>
          <button onClick={() => void delScope("done")} disabled={busy} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
            🗑️ احذف المكتملة
          </button>
          <span className="text-[11px] text-gray-400">الحذف نهائي من القاعدة — المشاهد المكتملة بتتشال مع روابط الحلقات المدمجة</span>
        </div>

        <section className="space-y-4">
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
              القائمة فاضية — أضف أول سيناريو وفوق 👆 والمصنع هيمشي لوحده من هنا
            </div>
          )}
          {items.map((it) => {
            const badge = STATUS_BADGE[it.status] || STATUS_BADGE.pending;
            return (
              <div key={it.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800">{it.title}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {it.task_id && (
                      <a href="/" className="text-xs text-indigo-600 hover:underline">
                        تتبع المهمة في اللوحة
                      </a>
                    )}
                    <button onClick={() => togglePublic(it)} className="text-xs text-emerald-700 hover:underline" title="النشر العلني في الرئيسية لا يتم إلا بعلمك — خصوصية مشاهد الزبائن">
                      {it.is_public ? "🙈 إخفاء من الرئيسية" : "📢 انشر في الرئيسية"}
                    </button>
                    <button onClick={() => del(it.id)} className="text-xs text-red-600 hover:underline">
                      حذف
                    </button>
                    {it.status === "pending" && (
                      <button onClick={() => void triggerOne(it.id)} disabled={busy} className="text-xs text-indigo-600 hover:underline">
                        ▶️ ولّد ده الآن
                      </button>
                    )}
                    {(it.status === "generating" || it.status === "failed") && (
                      <button onClick={() => void retryIt(it.id)} disabled={busy} className="text-xs text-amber-600 hover:underline">
                        🔄 أعد المحاولة
                      </button>
                    )}
                  </div>
                </div>
                <p className="mb-3 line-clamp-3 text-sm text-gray-600">{it.script}</p>

                {/* شريط تقدم توليد المشهد — نسبة حية من المزود */}
                {(it.status === "generating" || it.status === "done") && (
                  <div className="mb-3">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${it.status === "done" ? "bg-green-500" : "bg-gradient-to-l from-amber-400 to-orange-500"}`}
                        style={{ width: `${it.status === "done" ? 100 : it.task_progress ?? 2}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {it.status === "done" ? "✅ المشهد اكتمل — جاهز للمشاهدة والدمج" : `⏳ جاري توليد المشهد… ${it.task_progress ?? 2}% — شريط التقدم بيتحدث لوحده كل 15 ثانية`}
                    </p>
                  </div>
                )}

                {it.status === "done" && it.result_urls.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    {it.result_urls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="text-sm text-green-700 hover:underline">
                        📥 الفيديو الجاهز
                      </a>
                    ))}
                    <button onClick={() => void publishSocial(it, "telegram")} disabled={socialBusy === `${it.id}:telegram`} className="rounded bg-sky-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-50">✈️ تليجرام</button>
                    <button onClick={() => void publishSocial(it, "facebook")} disabled={socialBusy === `${it.id}:facebook`} className="rounded bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">📘 فيسبوك</button>
                    <button onClick={() => void publishSocial(it, "instagram")} disabled={socialBusy === `${it.id}:instagram`} className="rounded bg-gradient-to-r from-fuchsia-600 to-orange-500 px-2.5 py-1.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50">📸 انستجرام</button>
                    <button onClick={() => void publishSocial(it, "tiktok")} disabled={socialBusy === `${it.id}:tiktok`} className="rounded bg-black px-2.5 py-1.5 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50">🎵 تيك توك</button>
                  </div>
                )}

                {it.status === "failed" && it.error_message && (
                  <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{it.error_message}</p>
                )}

                {/* الصورة المصغرة الذكية — تظهر على أول مشهد في المجموعة */}
                {it.scene_no === 1 && (it.thumbnail_url || it.thumbnail_task_id) && (
                  <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    {it.thumbnail_url ? (
                      <>
                        <img src={it.thumbnail_url} alt="الصورة المصغرة" className="h-24 rounded-lg border border-amber-300" />
                        <div className="text-xs">
                          <p className="mb-1 font-bold text-amber-800">🖼️ الصورة المصغرة جاهزة — استخدمها غلاف للحلقة</p>
                          <a href={it.thumbnail_url} target="_blank" rel="noreferrer" className="font-bold text-indigo-600 hover:underline">📥 نزّل الصورة المصغرة ↗</a>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs">
                        <p className="mb-1 font-bold text-amber-800">🖼️ الصورة المصغرة بتتولد بالذكاء الاصطناعي…</p>
                        <button onClick={() => void refreshThumb(it.group_id!)} disabled={busy || !it.group_id} className="font-bold text-indigo-600 hover:underline disabled:opacity-50">
                          🔄 حدّث الصورة المصغرة
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {it.scene_no === 1 && it.merge_status === "merging" && (
                  <p className="mb-3 rounded bg-blue-50 p-2 text-xs text-blue-700">🔗 كل المشاهد خلصت — بيتم دمج الحلقة الكاملة الآن… حدّث الصفحة بعد شوية</p>
                )}
                {it.scene_no === 1 && it.merge_status === "done" && it.merged_url && (
                  <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="mb-2 text-sm font-bold text-green-800">🎬 الحلقة الكاملة المدمجة جاهزة!</p>
                    <video src={it.merged_url} controls className="mb-2 w-full rounded-lg" />
                    <a href={it.merged_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-green-700 hover:underline">📥 تحميل الحلقة المركبة للنشر</a>
                  </div>
                )}

                {it.status === "done" && it.publish && (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="mb-1 text-xs font-bold text-gray-500">حزمة النشر ليوتيوب (جاهزة للنسخ):</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-14 text-xs text-gray-500">العنوان</span>
                        <span className="flex-1 text-gray-800">{it.publish.youtube_title}</span>
                        <button onClick={() => copy("t" + it.id, it.publish.youtube_title)} className="text-xs text-indigo-600 hover:underline">
                          {copied === "t" + it.id ? "✓ تم" : "نسخ"}
                        </button>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-14 text-xs text-gray-500">الوصف</span>
                        <span className="flex-1 whitespace-pre-line text-gray-800">{it.publish.youtube_description}</span>
                        <button onClick={() => copy("d" + it.id, it.publish.youtube_description)} className="text-xs text-indigo-600 hover:underline">
                          {copied === "d" + it.id ? "✓ تم" : "نسخ"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-14 text-xs text-gray-500">هاشتاقات</span>
                        <span className="flex-1 text-gray-800">{it.publish.hashtags}</span>
                        <button onClick={() => copy("h" + it.id, it.publish.hashtags)} className="text-xs text-indigo-600 hover:underline">
                          {copied === "h" + it.id ? "✓ تم" : "نسخ"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
