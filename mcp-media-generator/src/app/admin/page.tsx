"use client";

// لوحة الإدارة العربية RTL — مدير المفاتيح + تجربة التوليد + لوحة المهام + ربط السيرفر
import { useCallback, useEffect, useState } from "react";
import ChatWidget from "@/components/ChatWidget";

interface KeyItem {
  id: string;
  provider: string;
  label: string;
  role: string;
  user_id: string | null; // حساب الزبون المرتبط — منه يتم الخصم التلقائي من رصيد الموقع
  masked: string;
  status: string;
  usage_count: number;
  success_count: number;
  fail_count: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface TaskItem {
  id: string;
  provider: string | null;
  model: string;
  type: string;
  prompt: string;
  status: string;
  progress: number;
  result_urls: string[];
  error_message: string | null;
  attempts: number;
  created_at: string;
}

interface Health {
  ok: boolean;
  database: string;
  mcpEndpoint: string;
  merger: { base: string; healthy: boolean };
  authRequired: boolean;
}

const TOOLS: Array<[string, string]> = [
  ["generate_image", "توليد صورة من وصف نصي — تُعاد جاهزة أو task_id للتابع"],
  ["generate_video", "توليد فيديو بصوت متزامن — تابعه بـ get_task"],
  ["merge_videos", "دمج عدة مقاطع في واحد بالترتيب — urls أو task_ids"],
  ["get_task", "تتبع أي مهمة بمعرّفها حتى الروابط النهائية"],
  ["list_media", "استرجاع الوسائط المخزنة سابقًا بروابطها"],
];

const statusBadge = (s: string) => {
  if (s === "completed" || s === "active") return "bg-emerald-500/15 text-emerald-400";
  if (s === "failed") return "bg-red-500/15 text-red-400";
  if (s === "exhausted" || s === "processing") return "bg-amber-500/15 text-amber-400";
  if (s === "disabled") return "bg-gray-500/15 text-gray-400";
  return "bg-cyan-500/15 text-cyan-400";
};

const statusAr = (s: string) =>
  ({ completed: "مكتملة", failed: "فاشلة", processing: "جارية", pending: "بالانتظار", active: "نشط", exhausted: "مستنزف", disabled: "معطّل" }[s] || s);

const typeAr = (t: string) => ({ image: "🖼️ صورة", video: "🎬 فيديو", merge: "🔗 دمج" }[t] || t);

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [walletMissing, setWalletMissing] = useState<string[]>([]); // إعدادات المحفظة الناقصة (تنبيه تشغيلي)
  const [bal, setBal] = useState<{ total: number | null; keys: Array<{ label: string; credits: number | null; status: string; error: string | null }> } | null>(null);

  const loadBal = useCallback(async () => {
    try {
      const r = await fetch("/api/balance");
      if (r.ok) setBal(await r.json());
    } catch { /* تجاهل — إعادة المحاولة في الدورة التالية */ }
    try {
      const sr = await fetch("/api/settings");
      if (sr.ok) {
        const st = (await sr.json())?.settings || {};
        const need = [
          ["vodafone_number", "رقم فودافون كاش"],
          ["instapay_handle", "عنوان إنستاباي"],
          ["wallet_holder_name", "اسم صاحب المحفظة"],
          ["admin_whatsapp", "واتساب المشرف"],
        ].filter(([k]) => !(st[k] || "").trim()).map(([, label]) => label);
        setWalletMissing(need);
      }
    } catch { /* تجاهل */ }
  }, []);

  useEffect(() => {
    void loadBal();
    const t = setInterval(() => void loadBal(), 60000);
    return () => clearInterval(t);
  }, [loadBal]);
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, processing: 0 });
  const [tab, setTab] = useState<"chatgpt" | "claude" | "cursor">("chatgpt");
  const [copied, setCopied] = useState("");
  const [form, setForm] = useState({ provider: "kie", label: "", api_key: "" });
  const [formMsg, setFormMsg] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  // 📣 قناة تليجرام الآلية — نشر كل حلقة جديدة تلقائيًا (التوكن يُقرأ مقنّعًا فقط)
  const [tg, setTg] = useState<{ configured: boolean; bot_masked: string; chat_id: string } | null>(null);
  const [tgForm, setTgForm] = useState({ bot_token: "", chat_id: "" });
  const [tgMsg, setTgMsg] = useState("");
  const [tgBusy, setTgBusy] = useState(false);

  const loadTg = useCallback(async () => {
    try {
      const r = await fetch("/api/telegram");
      if (r.ok) setTg(await r.json());
    } catch {}
  }, []);
  useEffect(() => { void loadTg(); }, [loadTg]);

  const tgAction = async (action: "save" | "test" | "clear") => {
    setTgBusy(true);
    setTgMsg("");
    try {
      const r = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { action, ...tgForm } : { action }),
      });
      const j = await r.json();
      if (j.error) setTgMsg("❌ " + j.error);
      else {
        setTgMsg("✅ " + (j.hint || "تم"));
        if (typeof j.configured === "boolean") setTg({ configured: j.configured, bot_masked: j.bot_masked || "", chat_id: j.chat_id || "" });
        if (action === "save") setTgForm({ bot_token: "", chat_id: "" });
      }
    } catch {
      setTgMsg("❌ فشل الاتصال");
    } finally {
      setTgBusy(false);
    }
  };

  const loadKeys = useCallback(async () => {
    try {
      const r = await fetch("/api/keys");
      const j = await r.json();
      setKeys(j.keys || []);
    } catch {}
  }, []);

  // ---------- 👥 إدارة الزبائن: أرصدة + إضافة/خصم + إيقاف + حذف ----------
  interface AdminUser { id: string; username: string; email: string; credits: number; status: string; created_at: string | null }
  interface LedgerRow { user: string; delta: number; reason: string; ref: string; at: string }
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [adminBusy, setAdminBusy] = useState("");
  const [adminMsg, setAdminMsg] = useState("");
  const [adjustVal, setAdjustVal] = useState<Record<string, string>>({});

  const loadAdminUsers = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/users");
      if (!r.ok) return;
      const j = await r.json();
      setAdminUsers(Array.isArray(j.users) ? j.users : []);
      setLedger(Array.isArray(j.ledger) ? j.ledger : []);
    } catch {}
  }, []);

  const adminAct = async (payload: Record<string, unknown>, busyKey: string, okMsg: string) => {
    setAdminBusy(busyKey); setAdminMsg("");
    try {
      const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) setAdminMsg("❌ " + (j.error || "فشل الإجراء"));
      else { setAdminMsg("✅ " + okMsg); await loadAdminUsers(); }
    } catch { setAdminMsg("❌ فشل الاتصال"); }
    finally { setAdminBusy(""); }
  };

  const adjustCredit = async (u: AdminUser) => {
    const raw = (adjustVal[u.id] || "").trim();
    const delta = Math.trunc(Number(raw));
    if (!raw || !Number.isFinite(delta) || delta === 0) return setAdminMsg("⚠️ اكتب رقمًا: 100 للإضافة أو -50 للخصم");
    await adminAct({ action: "adjust", user_id: u.id, delta }, `adj-${u.id}`, `اتعدل رصيد ${u.username} بمقدار ${delta > 0 ? "+" : ""}${delta} كريدت`);
  };

  const suspendUser = async (u: AdminUser) => {
    if (!confirm(`إيقاف حساب «${u.username}»؟ مش هيعرف يسجل دخول أو يولّد لحد ما تنشّطه.`)) return;
    await adminAct({ action: u.status === "suspended" ? "activate" : "suspend", user_id: u.id }, `susp-${u.id}`, u.status === "suspended" ? `اتنشط حساب ${u.username}` : `اتوقف حساب ${u.username}`);
  };

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`⚠️ حذف حساب «${u.username}» (${u.email}) نهائيًا؟\n\n- مشاريعه وكل مشاهده هتتشال\n- مفاتيحه هتفك ارتباطها (مش هتتشال)\n- السجلات المالية (الشحن والخصم والاسترداد) هتفضل محفوظة في القاعدة\n\nمش هتقدر ترجّع الحساب بعد الحذف.`)) return;
    if (!confirm("تأكيد أخير: اضغط موافق للحذف النهائي.")) return;
    await adminAct({ action: "delete", user_id: u.id }, `del-${u.id}`, `اتحذف حساب ${u.username} (السجلات المالية محفوظة)`);
  };

  const reasonAr: Record<string, string> = {
    signup: "🎁 هدية التسجيل", recharge: "💳 شحن", reserve: "⏳ حجز مشهد", charge: "🎬 خصم مشهد",
    refund: "↩️ استرداد", referral: "🎁 إحالة", admin: "🛠️ تعديل إداري",
  };

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks?limit=15");
      const j = await r.json();
      setTasks(j.tasks || []);
      setStats(j.stats || { total: 0, completed: 0, failed: 0, processing: 0 });
    } catch {}
  }, []);

  // حذف المهام حسب الفئة — زر 🗑 بجوار كل عداد في لوحة المهام
  const delTasks = async (filter: "all" | "completed" | "failed" | "processing", label: string) => {
    if (!window.confirm(`تأكيد حذف «${label}» نهائيًا؟ لا يمكن الاسترجاع.`)) return;
    try {
      const r = await fetch(`/api/tasks?filter=${filter}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { window.alert("❌ " + (j.error || "فشل الحذف")); return; }
      await loadTasks();
    } catch { window.alert("❌ فشل الاتصال بالخادم"); }
  };

  useEffect(() => {
    const hb = () => fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {});
    const loadAll = () => { hb(); loadKeys(); loadTasks(); void loadAdminUsers(); };
    loadAll();
    // التوقف عن الاستعلام كلما كانت الصفحة مخفية (تبويب مغلق/خلفي) — وتحديث فوري عند العودة
    const visible = () => typeof document === "undefined" || !document.hidden;
    const t1 = setInterval(() => { if (visible()) loadAll(); }, 10000); // الهيدر + المفاتيح كل 10 ث
    const t2 = setInterval(() => { if (visible()) loadTasks(); }, 5000); // المهام تتحدث تلقائيًا كل 5 ثوانٍ
    const onVis = () => { if (visible()) loadAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t1); clearInterval(t2);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadKeys, loadTasks, loadAdminUsers]);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 1600);
    } catch {}
  };

  const addKey = async () => {
    setFormMsg("");
    if (!form.api_key.trim()) return setFormMsg("⚠️ أدخل المفتاح أولًا");
    const r = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: form.provider, api_key: form.api_key.trim(), label: form.label.trim() }),
    });
    const j = await r.json();
    if (!r.ok) return setFormMsg("❌ " + (j.error || "فشل الإضافة"));
    setFormMsg("✅ أُضيف المفتاح — الترتيب التسلسلي: أول مفتاح أُضيف يُجرَّب أولًا");
    setForm({ provider: form.provider, label: "", api_key: "" });
    loadKeys();
  };

  const patchKey = async (id: string, status: string) => {
    await fetch(`/api/keys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadKeys();
  };

  // 💰 النموذج الموحد: كل المفاتيح مفاتيح منصة سرية — لا أدوار ولا ربط زبائن
  const delKey = async (id: string) => {
    try {
      const r = await fetch(`/api/keys/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { window.alert("❌ " + (j.error || "فشل الحذف — حاول تاني")); return; }
      loadKeys();
    } catch { window.alert("❌ فشل الاتصال بالخادم"); }
  };

  // ---- 🧪 فحص مفتاح kie.ai قبل الإضافة — يجلب الرصيد الحقيقي من kie.ai ----
  const [kieCheckKey, setKieCheckKey] = useState("");
  const [kieMsg, setKieMsg] = useState("");
  const [kieBusy, setKieBusy] = useState(false);
  const [kieValid, setKieValid] = useState(false);

  const checkKieKey = async () => {
    setKieMsg("");
    setKieValid(false);
    if (!kieCheckKey.trim()) return setKieMsg("⚠️ الصق مفتاح kie.ai أولًا");
    setKieBusy(true);
    try {
      const r = await fetch("/api/keys/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "kie", api_key: kieCheckKey.trim() }),
      });
      const j = await r.json();
      setKieValid(Boolean(j.valid));
      setKieMsg(j.message || j.error || "فشل الفحص");
    } catch {
      setKieMsg("⚠️ تعذر الاتصال — جرّب تاني");
    } finally {
      setKieBusy(false);
    }
  };

  const addKieChecked = async () => {
    if (!kieValid) return;
    const r = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "kie", api_key: kieCheckKey.trim(), label: "kie.ai — مفحوص الرصيد" }),
    });
    const j = await r.json();
    if (!r.ok) return setKieMsg("❌ " + (j.error || "فشل الإضافة"));
    setKieMsg("✅ أُضيف مفتاح kie.ai للموقع — يعمل فورًا في أول السلسلة");
    setKieCheckKey("");
    setKieValid(false);
    loadKeys();
  };

  // ---- 🗑️ حذف جميع الحسابات نهائيًا (تأكيد نصي مزدوج) ----
  const [delAllBusy, setDelAllBusy] = useState(false);
  const deleteAllAccounts = async () => {
    const c1 = window.prompt("⚠️ خطوة 1 من 2: حذف جميع الحسابات نهائيًا مع أرصدتها وطلبات الشحن والمشاريع والمشاهد.\nاكتب بالحرف: حذف نهائي");
    if (c1 !== "حذف نهائي") return;
    const c2 = window.confirm("⚠️ خطوة 2 من 2: آخر تأكيد — العملية لا يمكن التراجع عنها.\nمفاتيح المنصة والمهام والحلقات العامة تبقى سليمة.\nهل تريد المتابعة؟");
    if (!c2) return;
    setDelAllBusy(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_all", confirm: c1 }),
      });
      const j = await r.json();
      if (!r.ok) {
        setAdminMsg("❌ " + (j.error || "فشل الحذف"));
        return;
      }
      const d = j.deleted || {};
      setAdminMsg(`🗑️ تم حذف جميع الحسابات نهائيًا — حسابات: ${d.users ?? 0} | حركات رصيد: ${d.ledger ?? 0} | طلبات شحن: ${d.payment_requests ?? 0} | مشاريع: ${d.studio_projects ?? 0} | مشاهد: ${d.studio_scenes ?? 0}`);
      await loadAdminUsers();
    } catch {
      setAdminMsg("❌ فشل الاتصال أثناء الحذف");
    } finally {
      setDelAllBusy(false);
    }
  };

  // ---- تجربة التوليد (نفس محرك أدوات MCP عبر /api/generate) ----
  const [genType, setGenType] = useState<"video" | "image">("video");
  const [genPrompt, setGenPrompt] = useState("");
  const [genAspect, setGenAspect] = useState("auto");
  const [genRes, setGenRes] = useState("480p");
  const [genDuration, setGenDuration] = useState(8);
  const [genAudio, setGenAudio] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [genTaskId, setGenTaskId] = useState("");
  const [genDone, setGenDone] = useState(false);
  const [genTask, setGenTask] = useState<TaskItem | null>(null);

  // 💰 وضع توفير الكريدت — أقل مدة (6 ث) + أقل دقة (480p) + بدون صوت، والتفضيل محفوظ
  const [saveMode, setSaveMode] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("mg_save_mode") === "1") {
      setSaveMode(true);
      setGenDuration(6);
      setGenRes("480p");
      setGenAudio(false);
    }
  }, []);
  const toggleSave = () => {
    const on = !saveMode;
    setSaveMode(on);
    localStorage.setItem("mg_save_mode", on ? "1" : "0");
    if (on) {
      setGenDuration(6);
      setGenRes("480p");
      setGenAudio(false);
    }
  };

  const generate = async () => {
    setGenMsg("");
    setGenTask(null);
    setGenTaskId("");
    setGenDone(false);
    if (!genPrompt.trim()) return setGenMsg("⚠️ اكتب وصف المشهد أولًا");
    setGenBusy(true);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: genType,
          prompt: genPrompt.trim(),
          aspect_ratio: genAspect,
          resolution: genRes,
          enable_audio: genAudio,
          duration: Number(genDuration) || 8,
        }),
      });
      const j = await r.json();
      if (!r.ok) setGenMsg(j.error || "❌ فشل إنشاء المهمة");
      else if (j.status === "failed") setGenMsg("❌ " + (j.error_message || "فشلت المهمة"));
      else if (j.status === "completed") {
        setGenTaskId(j.id);
        setGenTask({
          id: j.id, provider: null, model: genType === "video" ? "grok-imagine-video-1-5-preview" : "gpt-image-2-6/flare-text-to-image",
          type: genType, prompt: genPrompt, status: "completed", progress: 100,
          result_urls: j.result_urls || [], error_message: null, attempts: 0, created_at: new Date().toISOString(),
        });
        setGenDone(true);
        setGenMsg("✅ اكتمل التوليد!");
      } else {
        setGenTaskId(j.id);
        setGenMsg("⏳ المهمة قيد المعالجة — تُحدَّث النتيجة تلقائيًا هنا وفي لوحة المهام");
      }
    } catch {
      setGenMsg("❌ تعذر الاتصال بالسيرفر");
    }
    setGenBusy(false);
  };

  // متابعة مهمة التجربة حتى اكتمالها (باستعلام قائمة المهام كل 5 ثوانٍ — عند العرض فقط)
  useEffect(() => {
    if (!genTaskId || genDone) return;
    const t = setInterval(async () => {
      if (document.hidden) return; // الصفحة مخفية → تخطَّ هذه الدورة
      try {
        const r = await fetch(`/api/tasks?limit=50&type=${genType}`);
        const j = await r.json();
        const found: TaskItem | undefined = (j.tasks || []).find((x: TaskItem) => x.id === genTaskId);
        if (found) {
          setGenTask(found);
          if (found.status === "completed") { setGenDone(true); setGenMsg("✅ اكتمل التوليد!"); }
          if (found.status === "failed") { setGenDone(true); setGenMsg("❌ " + (found.error_message || "فشلت المهمة")); }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [genTaskId, genDone, genType]);

  const mcpUrl = `${origin}/mcp`;
  const authHeaders = health?.authRequired ? ',\n        "headers": { "Authorization": "Bearer <MCP_ACCESS_TOKEN>" }' : "";
  const tabJson: Record<typeof tab, string> = {
    chatgpt: `{\n  "mcpServers": {\n    "media-generator": {\n      "url": "${mcpUrl}"${authHeaders}\n    }\n  }\n}`,
    claude: `{\n  "mcpServers": {\n    "media-generator": {\n      "type": "http",\n      "url": "${mcpUrl}"${authHeaders}\n    }\n  }\n}`,
    cursor: `{\n  "mcpServers": {\n    "media-generator": {\n      "url": "${mcpUrl}"${authHeaders}\n    }\n  }\n}`,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* 🛠️ رأس لوحة الإدارة */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-600 text-xl shadow-lg shadow-cyan-500/30">🎛️</div>
          <div>
            <h1 className="text-xl font-extrabold">لوحة إدارة كوكب الكرتون 🚀</h1>
            <p className="text-xs text-slate-400">المصنع · المفاتيح · المهام · الدمج — للمالك فقط</p>
          </div>
        </div>
        <a href="/" className="rounded-full bg-slate-500/15 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-500/25">🌍 شغل الموقع العام ←</a>
      </header>
      {walletMissing.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          ⚠️ <b>إعدادات تشغيلية ناقصة</b> — صفحة الشحن تعرض «جاري تجهيز المحفظة» حتى تكتمل:
          <b className="mx-1">{walletMissing.join(" · ")}</b>
          — <a href="/recharge" className="underline">املأها من قسم الإعدادات في صفحة الشحن</a>.
        </div>
      )}

      {keys.length === 0 && (
        <div className="mb-5 rounded-xl border border-red-400/50 bg-red-500/10 p-4 text-sm text-red-200">
          🚨 <b>لا توجد مفاتيح منصة — التوليد متوقف حاليًا.</b> الكريدت هو وسيلة الحساب، ومفاتيح المزود هي وقود التوليد:
          أضف مفتاحًا واحدًا على الأقل من «🔑 مدير المفاتيح» (kie.ai أو CometAPI أو Apiframe — بلا حد لعدد المفاتيح).
          لحد ما تضيف مفتاح: التوليد بيستنى المفتاح برسالة واضحة وبدون أي خصم من رصيد الزبائن.
        </div>
      )}

      {/* ⚙️ حالة النظام */}
      <div className="mb-5 border-t border-slate-700/60 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-400">⚙️ لوحة الإدارة — للمالك فقط</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className={`rounded-full px-3 py-1.5 ${health?.ok ? "bg-emerald-500/15 text-emerald-400" : health ? "bg-red-500/15 text-red-400" : "bg-slate-500/15 text-slate-400"}`}>
              {health?.ok ? "🟢 Turso متصل" : health ? "🔴 غير متصل" : "… جارٍ الفحص"}
            </span>
            <span className={`rounded-full px-3 py-1.5 ${health?.merger?.healthy ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
              {health?.merger?.healthy ? "🟢 خدمة الدمج جاهزة" : "🟡 خدمة الدمج غير مستجيبة"}
            </span>
            <span
              title={bal?.keys.map((k) => `${k.label}: ${k.credits !== null ? `${k.credits} كريدت` : k.error || "؟"}`).join("\n") || ""}
              className={`rounded-full px-3 py-1.5 ${!bal || bal.total == null ? "bg-slate-500/15 text-slate-400" : bal.total >= 10 ? "bg-emerald-500/15 text-emerald-400" : bal.total > 0 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}
            >
              {bal ? (bal.total !== null ? (bal.total >= 10 ? `💳 رصيد الحساب: ${bal.total} كريدت` : bal.total > 0 ? `⚠️ رصيد منخفض: ${bal.total} كريدت — التنبيه عند 10` : "🚨 رصيد الحساب نفد") : "💳 الرصيد: غير معروف") : "… جارٍ جلب الرصيد"}
            </span>
            {health?.authRequired && <span className="rounded-full bg-violet-500/15 px-3 py-1.5 text-violet-400">🔐 حماية Bearer على /mcp</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <a href="/episodes" className="rounded-full bg-indigo-500/15 px-3 py-1.5 text-indigo-300 hover:bg-indigo-500/25">🏭 مصنع الحلقات</a>
          <a href="/recharge" className="rounded-full bg-green-500/15 px-3 py-1.5 text-green-300 hover:bg-green-500/25">💳 شحن الرصيد</a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* أ) مدير المفاتيح */}
        <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
          <h2 className="mb-1 text-base font-extrabold">🔑 مدير المفاتيح</h2>
          <p className="mb-3 text-xs leading-5 text-amber-300/90">
            أضف عدة مفاتيح لكل مزود — التجربة تسلسلية (أول مفتاح ثم التالي ثم التالي) مع تبديل فوري تلقائي عند أي خطأ أو نفاد رصيد دون توقف.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 text-sm"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            >
              <option value="kie">kie.ai</option>
              <option value="cometapi">CometAPI</option>
              <option value="apiframe">Apiframe</option>
            </select>
            <input
              className="min-w-[120px] flex-1 rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 text-sm"
              placeholder="تسمية اختيارية (مثل: مفتاح رئيسي)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <input
              className="min-w-[220px] flex-[2] rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 text-sm"
              placeholder="المفتاح (sk-...)"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addKey()}
              type="password"
              dir="ltr"
            />
            <button onClick={addKey} className="rounded-lg bg-gradient-to-l from-cyan-500 to-violet-600 px-5 py-2 text-sm font-bold text-amber-200 hover:brightness-110">
              ＋ إضافة
            </button>
          </div>
          {formMsg && <p className="mb-3 text-xs">{formMsg}</p>}

          {/* 🧪 مكان مفتاح kie.ai — فحص الرصيد الحقيقي قبل الإضافة */}
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-2 text-xs font-bold text-amber-200">🧪 مكان مفتاح kie.ai — الصق المفتاح وافحص صلاحيته ورصيده الحقيقي قبل الإضافة</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={kieCheckKey}
                onChange={(e) => setKieCheckKey(e.target.value)}
                placeholder="مفتاح kie.ai — انسخه كاملًا من صفحة API Key"
                dir="ltr"
                type="password"
                className="min-w-[220px] flex-[2] rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 text-sm"
              />
              <button onClick={checkKieKey} disabled={kieBusy} className="rounded-lg border border-cyan-600 px-4 py-2 text-sm font-bold hover:text-cyan-300 disabled:opacity-40">
                {kieBusy ? "… يفحص" : "فحص الرصيد"}
              </button>
              <button onClick={addKieChecked} disabled={!kieValid} className="rounded-lg bg-gradient-to-l from-cyan-500 to-violet-600 px-4 py-2 text-sm font-bold text-amber-200 hover:brightness-110 disabled:opacity-40">
                ＋ أضفه للموقع
              </button>
            </div>
            {kieMsg && <p className="mt-2 text-xs">{kieMsg}</p>}
          </div>

          {keys.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">
              لا توجد مفاتيح بعد — أضف مفتاحًا واحدًا على الأقل لتعمل أدوات التوليد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-2 text-xs text-slate-400">
                🔢 عدد المفاتيح: <b className="text-cyan-300">{keys.length}</b> — <b>بلا حد</b>، أضف ما تشاء من كل مزود
                (kie.ai / CometAPI / Apiframe) والتجربة تسلسلية بترتيب الإضافة. المفتاح «المستنزف» يستأنف تلقائيًا بعد شحن حسابه، أو اضغط «تنشيط» يدويًا.
              </p>
              <table className="w-full text-right text-xs">
                <thead className="text-cyan-400">
                  <tr className="border-b border-slate-800">
                    <th className="p-2">المزود</th><th className="p-2">التسمية</th><th className="p-2">المفتاح</th>
                    <th className="p-2">الحالة</th><th className="p-2">استخدام</th><th className="p-2">نجاح</th><th className="p-2">فشل</th>
                    <th className="p-2">آخر خطأ</th><th className="p-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b border-slate-800/60 align-top">
                      <td className="p-2 font-bold">{k.provider === "kie" ? "kie.ai" : k.provider === "apiframe" ? "Apiframe" : "CometAPI"}</td>
                      <td className="p-2 text-slate-300">{k.label || "—"}</td>
                      <td className="p-2 font-mono" dir="ltr">{k.masked}</td>
                      <td className="p-2"><span className={`rounded-full px-2 py-0.5 font-bold ${statusBadge(k.status)}`}>{statusAr(k.status)}</span></td>
                      <td className="p-2">{k.usage_count}</td>
                      <td className="p-2 text-emerald-400">{k.success_count}</td>
                      <td className="p-2 text-red-400">{k.fail_count}</td>
                      <td className="max-w-[180px] truncate p-2 text-slate-400" title={k.last_error || ""}>{k.last_error ? k.last_error.slice(0, 40) + "…" : "—"}</td>
                      <td className="flex gap-1 p-2">
                        {k.status === "disabled" || k.status === "exhausted" ? (
                          <button onClick={() => patchKey(k.id, "active")} className="rounded border border-slate-600 px-2 py-1 hover:text-emerald-400">تنشيط</button>
                        ) : (
                          <button onClick={() => patchKey(k.id, "disabled")} className="rounded border border-slate-600 px-2 py-1 hover:text-amber-400">تعطيل</button>
                        )}
                        <button onClick={() => delKey(k.id)} className="rounded border border-slate-600 px-2 py-1 hover:text-red-400">حذف</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* و) 👥 الزبائن والأرصدة — إدارة الحسابات والأرصدة والإيقاف والحذف */}
        <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
          <h2 className="mb-1 text-base font-extrabold">👥 الزبائن والأرصدة</h2>
          <p className="mb-3 text-xs leading-5 text-slate-400">
            عدّل الرصيد يدويًا (اكتب رقم: <b className="text-emerald-400">+100</b> للإضافة أو <b className="text-red-400">-50</b> للخصم أو استرجاع)،
            أو أوقف حسابًا مؤقتًا، أو احذفه نهائيًا — الحذف بيحافظ على السجلات المالية في القاعدة.
            كل تعديل بيتسجل في سجل الحركات تحت.
          </p>
          {adminMsg && <p className="mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2.5 text-xs text-cyan-200">{adminMsg}</p>}
          {/* 🗑️ حذف جميع الحسابات — تأكيد مزدوج */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <button onClick={deleteAllAccounts} disabled={delAllBusy} className="rounded-lg border border-red-600 px-4 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-40">
              {delAllBusy ? "… يُنفذ الحذف" : "🗑️ حذف جميع الحسابات نهائيًا"}
            </button>
            <p className="text-[11px] leading-4 text-slate-400">
              يحذف كل الحسابات والأرصدة وطلبات الشحن والمشاريع والمشاهد دفعة واحدة (يتطلب كتابة «حذف نهائي»).
              مفاتيح المنصة والمهام والحلقات العامة تبقى سليمة.
            </p>
          </div>
          {adminUsers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">لا يوجد حسابات زبائن بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-right text-xs">
                <thead className="text-cyan-400">
                  <tr className="border-b border-slate-800">
                    <th className="p-2">المستخدم</th><th className="p-2">الإيميل</th><th className="p-2">الرصيد</th>
                    <th className="p-2">الحالة</th><th className="p-2">تعديل الرصيد</th><th className="p-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((u) => (
                    <tr key={u.id} className="border-b border-slate-800/60 align-middle">
                      <td className="p-2 font-bold text-amber-200">{u.username}</td>
                      <td className="max-w-[180px] truncate p-2 text-slate-300" dir="ltr">{u.email}</td>
                      <td className="p-2">
                        <span className={`rounded-full px-2 py-1 font-black ${u.credits > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-600/30 text-slate-400"}`}>
                          {u.credits.toLocaleString("en")}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${u.status === "suspended" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                          {u.status === "suspended" ? "🚫 موقوف" : "✅ نشط"}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <input
                            value={adjustVal[u.id] || ""}
                            onChange={(e) => setAdjustVal({ ...adjustVal, [u.id]: e.target.value })}
                            placeholder="+100 / -50"
                            dir="ltr"
                            className="w-24 rounded border border-slate-600 bg-slate-900 p-1.5 text-center text-xs text-slate-200"
                          />
                          <button onClick={() => void adjustCredit(u)} disabled={adminBusy === `adj-${u.id}`} className="rounded border border-cyan-600 px-2 py-1 hover:text-cyan-300 disabled:opacity-40">
                            {adminBusy === `adj-${u.id}` ? "…" : "تطبيق"}
                          </button>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => void suspendUser(u)} disabled={adminBusy === `susp-${u.id}`} className="rounded border border-amber-600 px-2 py-1 hover:text-amber-300 disabled:opacity-40">
                            {u.status === "suspended" ? "تنشيط" : "إيقاف"}
                          </button>
                          {u.username !== "omar" && (
                            <button onClick={() => void deleteUser(u)} disabled={adminBusy === `del-${u.id}`} className="rounded border border-red-600 px-2 py-1 hover:text-red-400 disabled:opacity-40">
                              🗑️ حذف
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* سجل حركات الرصيد — آخر 40 حركة من ledger */}
          <h3 className="mb-2 mt-5 text-sm font-extrabold text-slate-300">📒 سجل حركات الرصيد (آخر 40)</h3>
          {ledger.length === 0 ? (
            <p className="text-xs text-slate-500">لا توجد حركات مسجلة بعد</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-[#0e1420] p-2">
              <table className="w-full text-right text-[11px]">
                <tbody>
                  {ledger.map((l, i) => (
                    <tr key={i} className="border-b border-slate-800/50 last:border-0">
                      <td className="p-1.5 text-slate-300">{l.user}</td>
                      <td className={`p-1.5 font-black ${l.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {l.delta >= 0 ? "+" : ""}{l.delta}
                      </td>
                      <td className="p-1.5 text-slate-400">{reasonAr[l.reason] || l.reason}</td>
                      <td className="p-1.5 text-slate-500" dir="ltr">{l.at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ب) تجربة التوليد */}
        <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
          <h2 className="mb-1 text-base font-extrabold">🎬 تجربة التوليد</h2>
          <p className="mb-3 text-xs leading-5 text-slate-400">
            اكتب وصف المشهد واضغط توليد — نفس محرك أدوات MCP بالضبط. الفيديو يحتاج دقائق وتُتابَع المهمة تلقائيًا هنا وفي لوحة المهام حتى ظهور المشغّل والرابط.
          </p>
          <div className="mb-2 flex gap-2 text-sm">
            {([["video", "🎬 فيديو"], ["image", "🖼️ صورة"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setGenType(id); setGenRes(id === "video" ? "480p" : "1K"); }}
                className={`rounded-lg px-3 py-1.5 font-bold ${genType === id ? "bg-gradient-to-l from-cyan-500 to-violet-600 text-amber-200" : "border border-slate-700 text-slate-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            className="mb-2 w-full rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 text-sm"
            rows={2}
            placeholder="وصف المشهد… مثال: قطة صغيرة تقف على سطح خشبي وتنظر إلى الكاميرا وتقول مرحبًا"
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
          />
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <select className="rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2" value={genAspect} onChange={(e) => setGenAspect(e.target.value)} title="نسبة الأبعاد">
              {(genType === "video" ? ["auto", "1:1", "16:9", "9:16", "3:2", "2:3"] : ["auto", "1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "3:4"]).map((a) => (
                <option key={a} value={a}>الأبعاد: {a}</option>
              ))}
            </select>
            <select className="rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 disabled:opacity-50" value={genRes} onChange={(e) => setGenRes(e.target.value)} title="الدقة" disabled={saveMode && genType === "video"}>
              {(genType === "video" ? ["480p", "720p", "1080p"] : ["1K", "2K", "4K"]).map((r) => (
                <option key={r} value={r}>الدقة: {r}</option>
              ))}
            </select>
            {genType === "video" && (
              <>
                <label className="flex items-center gap-1 rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2" title="النموذج يقبل 6-30 ثانية">
                  المدة (ثانية):
                  <input type="number" min={6} max={30} value={genDuration} disabled={saveMode} onChange={(e) => setGenDuration(Number(e.target.value) || 8)} className="w-12 bg-transparent text-center" />
                </label>
                <label className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2">
                  <input type="checkbox" checked={genAudio} disabled={saveMode} onChange={(e) => setGenAudio(e.target.checked)} /> صوت متزامن
                </label>
                <button
                  onClick={toggleSave}
                  title="أقل استهلاك: 6 ثوانٍ + 480p + بدون صوت"
                  className={`rounded-lg px-3 py-2 font-bold ${saveMode ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50" : "bg-slate-700/40 text-slate-300 hover:bg-slate-700/70"}`}
                >
                  {saveMode ? "💰 التوفير مفعّل" : "💰 وضع التوفير"}
                </button>
              </>
            )}
            <button onClick={generate} disabled={genBusy} className="rounded-lg bg-gradient-to-l from-cyan-500 to-violet-600 px-6 py-2 text-sm font-bold text-amber-200 hover:brightness-110 disabled:opacity-50">
              {genBusy ? "⏳ جارٍ الإنشاء…" : "🚀 توليد"}
            </button>
          </div>
          {genMsg && <p className="mb-2 text-xs">{genMsg}</p>}
          {genTask && genTask.status === "processing" && genTask.progress > 0 && (
            <div className="mt-2 mb-2">
              <div className="h-1.5 w-full rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-violet-500 transition-all" style={{ width: `${genTask.progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">التقدم: {genTask.progress}%</p>
            </div>
          )}
          {genTask && genTask.status === "completed" && genTask.result_urls.length > 0 && (
            <div className="mt-2 rounded-xl border border-slate-800 bg-[#0e1420] p-3">
              {genTask.type === "video" ? (
                <video controls src={genTask.result_urls[0]} className="max-h-80 w-full rounded-lg" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={genTask.result_urls[0]} alt="النتيجة" className="max-h-80 w-auto rounded-lg" />
              )}
              <a href={genTask.result_urls[0]} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/25" dir="ltr">
                🔗 فتح الرابط المباشر
              </a>
            </div>
          )}
        </section>

        {/* ج) لوحة المهام */}
        <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">📋 لوحة المهام</h2>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1">
                الإجمالي: {stats.total}
                <button onClick={() => delTasks("all", "جميع المهام")} title="حذف جميع المهام نهائيًا" className="text-red-400 transition hover:text-red-300">🗑</button>
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-400">
                مكتملة: {stats.completed}
                <button onClick={() => delTasks("completed", "المهام المكتملة")} title="حذف المهام المكتملة نهائيًا" className="text-red-400 transition hover:text-red-300">🗑</button>
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-red-400">
                فاشلة: {stats.failed}
                <button onClick={() => delTasks("failed", "المهام الفاشلة")} title="حذف المهام الفاشلة نهائيًا" className="text-red-400 transition hover:text-red-300">🗑</button>
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-amber-400">
                جارية: {stats.processing}
                <button onClick={() => delTasks("processing", "المهام الجارية وبالانتظار")} title="حذف المهام الجارية وبالانتظار نهائيًا" className="text-red-400 transition hover:text-red-300">🗑</button>
              </span>
            </div>
          </div>
          {tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">لا توجد مهام بعد — استخدم قسم «تجربة التوليد» أعلاه أو أدوات MCP من أي عميل.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-800 bg-[#0e1420] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold">{typeAr(t.type)}</span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${statusBadge(t.status)}`}>{statusAr(t.status)}</span>
                    {t.status === "processing" && t.progress > 0 && (
                      <span className="flex-1">
                        <span className="mb-0.5 block h-1.5 w-full rounded-full bg-slate-800">
                          <span className="block h-full rounded-full bg-gradient-to-l from-cyan-400 to-violet-500" style={{ width: `${t.progress}%` }} />
                        </span>
                      </span>
                    )}
                    <span className="text-slate-400">محاولات: {t.attempts}</span>
                    <span className="text-slate-500" dir="ltr">{new Date(t.created_at + "Z").toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300" dir="ltr">{t.model}</p>
                  {t.prompt && <p className="mt-0.5 truncate text-xs text-slate-400">{t.prompt}</p>}
                  {t.status === "completed" && t.result_urls.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {t.result_urls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" className="rounded-lg bg-cyan-500/15 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/25" dir="ltr">
                          🔗 فتح النتيجة {t.result_urls.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
                  )}
                  {t.status === "failed" && t.error_message && <p className="mt-1 text-xs text-red-400">❌ {t.error_message}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* د) ربط السيرفر */}
        <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
          <h2 className="mb-3 text-base font-extrabold">🔌 ربط السيرفر</h2>
          <div className="mb-4 flex items-center gap-2">
            <input readOnly dir="ltr" value={mcpUrl} className="flex-1 rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 font-mono text-sm text-cyan-300" />
            <button onClick={() => copy(mcpUrl, "url")} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold hover:border-cyan-400 hover:text-cyan-300">
              {copied === "url" ? "✅ تم النسخ" : "📋 نسخ"}
            </button>
          </div>
          <div className="mb-2 flex gap-2 text-sm">
            {([["chatgpt", "ChatGPT / GPT Agents"], ["claude", "Claude Desktop"], ["cursor", "Cursor / Windsurf / Cline"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1.5 font-bold ${tab === id ? "bg-gradient-to-l from-cyan-500 to-violet-600 text-amber-200" : "border border-slate-700 text-slate-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "chatgpt" && (
            <p className="mb-2 text-xs text-slate-400">في ChatGPT: Settings → Connectors → Create → Custom MCP server وضع الرابط أعلاه في «Server URL».</p>
          )}
          <div className="relative">
            <pre dir="ltr" className="rounded-xl border border-slate-800 bg-[#05070c] p-4 pt-8 text-left text-xs leading-5 text-cyan-200">{tabJson[tab]}</pre>
            <button onClick={() => copy(tabJson[tab], "json")} className="absolute left-2 top-2 rounded-lg border border-slate-600 bg-[#0e1420] px-3 py-1 text-xs font-bold hover:border-cyan-400 hover:text-cyan-300">
              {copied === "json" ? "✅" : "📋 نسخ"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {TOOLS.map(([name, desc]) => (
              <div key={name} className="rounded-xl border border-slate-800 bg-[#0e1420] px-3 py-2">
                <span className="font-mono text-xs font-bold text-violet-300" dir="ltr">{name}</span>
                <p className="text-[11px] text-slate-400">{desc}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-300">
            ⚠️ الفيديو يحتاج دقائق: يعيد السيرفر task_id فورًا، ويتابَع تلقائيًا بـ get_task كل 10 ثوانٍ — وعند اكتمال المهمة يُعرض الرابط في الدردشة ويتوقف.
            أثناء الانتظار يُبَث تقدم حي (Progress notifications) حتى لا تنقطع العملية.
          </p>
        </section>

        {/* هـ) قناة تليجرام الآلية — التسويق المجاني: نشر تلقائي لكل حلقة جديدة */}
        <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">📣 قناة تليجرام الآلية</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${tg?.configured ? statusBadge("completed") : statusBadge("disabled")}`}>
              {tg?.configured ? "✅ مفعّلة — النشر تلقائي" : "⚪ غير مفعّلة"}
            </span>
          </div>
          <p className="mb-3 text-xs leading-6 text-slate-400">
            اعمل بوت من <b className="text-cyan-300">@BotFather</b> في تليجرام (/newbot ← انسخ التوكن)، وحط معرف قناتك
            (@اسم أو الرقم الرمزي -100…)، وارفع البوت <b className="text-amber-300">أدمن</b> في القناة. أول ما أي حلقة تكتمل دمجها
            هيُنشر أوتوماتيكيًا: صورة الغلاف + العنوان + الوصف + الهاشتاقات + الرابط — تسويق مجاني 24/7 بدون تدخل.
          </p>
          {tgMsg && <p className="mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2.5 text-xs text-cyan-200">{tgMsg}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={tgForm.bot_token}
              onChange={(e) => setTgForm({ ...tgForm, bot_token: e.target.value })}
              dir="ltr"
              placeholder="توكن البوت: 123456:AAExxx…"
              className="min-w-[240px] flex-1 rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 font-mono text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
            />
            <input
              value={tgForm.chat_id}
              onChange={(e) => setTgForm({ ...tgForm, chat_id: e.target.value })}
              dir="ltr"
              placeholder="@mychannel أو -1001234…"
              className="w-56 rounded-lg border border-slate-700 bg-[#0e1420] px-3 py-2 font-mono text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
            />
            <button onClick={() => tgAction("save")} disabled={tgBusy} className="rounded-lg bg-gradient-to-l from-cyan-500 to-violet-600 px-4 py-2 text-sm font-bold text-amber-200 hover:brightness-110 disabled:opacity-50">
              {tgBusy ? "⏳…" : "💾 حفظ"}
            </button>
            <button onClick={() => tgAction("test")} disabled={tgBusy} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
              🚀 رسالة اختبار
            </button>
            {tg?.configured && (
              <button onClick={() => tgAction("clear")} disabled={tgBusy} className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50">
                🗑️ إلغاء
              </button>
            )}
          </div>
          {tg?.configured && (
            <p className="mt-2 text-[11px] text-slate-500" dir="ltr">bot: {tg.bot_masked} · chat: {tg.chat_id}</p>
          )}
        </section>

        <SiteSettingsCard />

        <ColoringManager />

        <FilesManager />
      </div>

      <ChatWidget />
      <footer className="mt-6 text-center text-[11px] text-slate-500">
        روابط فقط — لا تُنزَّل الوسائط على السيرفر · المفاتيح مقنّعة دائمًا · .env مستثنى من Git منذ اليوم الأول
      </footer>
    </main>
  );
}

// ============================================================
// 📁 مكتبة الملفات — رفع وحذف PDF / صور / ملفات كبيرة من لوحة الإدارة
// التخزين: Turso BLOB مقسّم قطعًا (~2.5MB لكل قطعة) — يتجاوز حد body السيرفرلس
// كل ملف يأخذ رابطًا عامًا /api/files/{id}/raw يُقدَّم للزوار (عرض أو تنزيل)
// ============================================================
interface FileRow {
  id: string;
  name: string;
  mime: string;
  kind: "pdf" | "image" | "big";
  size: number;
  chunks: number;
  total_chunks: number;
  created_at: string | null;
}

const FILE_KINDS: Array<{ key: "pdf" | "image" | "big"; label: string; accept: string; hint: string }> = [
  { key: "pdf", label: "📄 رفع PDF", accept: ".pdf,application/pdf", hint: "حتى 25MB" },
  { key: "image", label: "🖼️ رفع صورة", accept: "image/*", hint: "حتى 8MB — jpg/png/webp/gif" },
  { key: "big", label: "📦 رفع ملف كبير", accept: "*/*", hint: "حتى 100MB — فيديو/أرشيف/أي ثنائي" },
];
const FILE_CHUNK = 2.5 * 1024 * 1024;
const FILE_LIMITS: Record<string, number> = { pdf: 25 * 1024 * 1024, image: 8 * 1024 * 1024, big: 100 * 1024 * 1024 };

function fmtFileSize(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيبي`;
  return `${(n / 1024 / 1024).toFixed(1)} ميجا`;
}

function FilesManager() {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [busyKind, setBusyKind] = useState("");
  const [prog, setProg] = useState<{ name: string; i: number; total: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/files");
      const d = await r.json();
      setFiles(Array.isArray(d.files) ? d.files : []);
    } catch {
      setFiles([]);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function uploadFile(file: File, kind: "pdf" | "image" | "big") {
    setMsg("");
    if (file.size > FILE_LIMITS[kind]) {
      setMsg(`⚠️ «${file.name}» أكبر من الحد المسموح (${fmtFileSize(FILE_LIMITS[kind])})`);
      return;
    }
    const id = crypto.randomUUID();
    const total = Math.max(1, Math.ceil(file.size / FILE_CHUNK));
    setBusyKind(kind);
    try {
      for (let i = 0; i < total; i++) {
        setProg({ name: file.name, i: i + 1, total });
        const data = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
          fr.onerror = () => reject(new Error("فشل قراءة المقطع من الجهاز"));
          fr.readAsDataURL(file.slice(i * FILE_CHUNK, (i + 1) * FILE_CHUNK));
        });
        const r = await fetch("/api/files/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name: file.name, mime: file.type || "application/octet-stream", kind, idx: i, total, data }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "فشل رفع قطعة");
      }
      const fin = await fetch("/api/files/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const fd = await fin.json();
      if (!fin.ok) throw new Error(fd.error || "فشل إتمام الرفع");
      setMsg(`✅ تم رفع «${file.name}» (${fmtFileSize(file.size)}) — رابطه العام: ${window.location.origin}${fd.url}`);
      await refresh();
    } catch (e) {
      setMsg(`⚠️ ${(e as Error).message}`);
    } finally {
      setBusyKind("");
      setProg(null);
    }
  }

  async function deleteFile(id: string, name: string) {
    if (!confirm(`حذف «${name}» نهائيًا؟ الرابط العام هيوقف بعد الحذف.`)) return;
    const r = await fetch("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMsg(r.ok ? `🗑️ تم حذف «${name}»` : "⚠️ تعذر الحذف — حاول تاني");
    if (r.ok) await refresh();
  }

  function copyLink(id: string) {
    const url = `${window.location.origin}/api/files/${id}/raw`;
    navigator.clipboard?.writeText(url).then(
      () => { setCopiedId(id); setTimeout(() => setCopiedId(""), 1800); },
      () => setMsg(`⚠️ انسخ يدويًا: ${url}`)
    );
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
      <h2 className="mb-1 text-lg font-black text-amber-200">📁 مكتبة الملفات — PDF / صور / ملفات كبيرة</h2>
      <p className="mb-4 text-xs text-slate-400">رفع مقسّم قطعًا يتحمل الملفات الكبيرة (حتى 100MB) · كل ملف يأخذ رابطًا عامًا يقدم للزوار · الحذف نهائي فورًا</p>

      <div className="flex flex-wrap items-center gap-3">
        {FILE_KINDS.map((k) => (
          <label key={k.key} className={`cursor-pointer rounded-lg px-4 py-2.5 text-sm font-bold transition ${busyKind === k.key ? "pointer-events-none border border-slate-600 bg-slate-800/60 text-slate-400" : "border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"}`}>
            {busyKind === k.key ? "⏳ جارٍ الرفع…" : k.label}
            <span className="mr-2 text-[11px] text-slate-500">({k.hint})</span>
            <input
              type="file"
              hidden
              accept={k.accept}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadFile(f, k.key);
              }}
            />
          </label>
        ))}
      </div>

      {prog && (
        <p className="mt-3 text-xs font-bold text-cyan-300" dir="rtl">
          ⏫ «{prog.name}» — قطعة {prog.i} من {prog.total} ({Math.round((prog.i / prog.total) * 100)}٪)
        </p>
      )}
      {msg && <p className="mt-2 break-all text-xs font-bold text-amber-300" dir="rtl">{msg}</p>}

      <div className="mt-4 space-y-2">
        {files === null && <p className="text-xs text-slate-500">⏳ جارٍ تحميل القائمة…</p>}
        {files?.length === 0 && <p className="text-xs text-slate-500">مكتبة فاضية — ارفع أول ملف من الأزرار فوق 👆</p>}
        {files?.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-black/30 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-200">
                {f.kind === "pdf" ? "📄" : f.kind === "image" ? "🖼️" : "📦"} {f.name}
              </p>
              <p className="text-[11px] text-slate-500">
                {fmtFileSize(f.size)} · {f.total_chunks} قطعة · {f.created_at?.slice(0, 16).replace("T", " ") || "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => copyLink(f.id)} className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20">
                {copiedId === f.id ? "✓ اتنسخ" : "🔗 نسخ الرابط"}
              </button>
              <button onClick={() => deleteFile(f.id, f.name)} className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20">
                🗑️ حذف
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// ⚙️ إعدادات الموقع — أدسنس (تفعيل الربح) + خصم كتب التلوين
// تُحفظ في site_settings عبر /api/settings — تعمل فورًا بدون إعادة نشر
// ============================================================
function SiteSettingsCard() {
  const [st, setSt] = useState({
    adsense_client: "",
    adsense_slot: "",
    coloring_discount: "0",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const s = d?.settings || {};
        setSt((prev) => ({
          adsense_client: s.adsense_client || "",
          adsense_slot: s.adsense_slot || "",
          coloring_discount: s.coloring_discount || "0",
        }));
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const body = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, String(v).trim()]));
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMsg(r.ok ? "✅ تم الحفظ — يعمل فورًا بدون إعادة نشر" : "⚠️ تعذر الحفظ — حاول تاني");
    } catch {
      setMsg("⚠️ تعذر الحفظ — حاول تاني");
    }
    setBusy(false);
  };

  const fld = "w-full rounded-lg border border-slate-700 bg-black/40 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500/60";
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
      <h2 className="mb-1 text-lg font-black text-amber-200">⚙️ إعدادات الموقع — الإعلانات والخصم</h2>
      <p className="mb-4 text-xs text-slate-400">كل حاجة هنا بتشتغل لحظيًا بعد الحفظ — بدون إعادة نشر</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">💰 معرف ناشر أدسنس (تفعيل الإعلانات)</label>
          <input dir="ltr" value={st.adsense_client} onChange={(e) => setSt({ ...st, adsense_client: e.target.value })} placeholder="ca-pub-1234567890123456" className={fld} />
          <p className="mt-1 text-[11px] text-slate-500">من أدسنس بعد قبول الموقع — لما يتسجل هنا يظهر الإعلان أعلى الموقع تلقائيًا ويتولد /ads.txt</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">🧩 معرف وحدة الإعلان (Ad Slot)</label>
          <input dir="ltr" value={st.adsense_slot} onChange={(e) => setSt({ ...st, adsense_slot: e.target.value })} placeholder="1234567890" className={fld} />
          <p className="mt-1 text-[11px] text-slate-500">من صفحة الإعلانات في أدسنس — وحدة إعلانية مقاس متجاوب (Display)</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-emerald-300">🏷️ نسبة الخصم لكتب التلوين (٪)</label>
          <input dir="ltr" inputMode="numeric" value={st.coloring_discount} onChange={(e) => setSt({ ...st, coloring_discount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="0 - 90" className={fld} />
          <p className="mt-1 text-[11px] text-slate-500">تظهر على كل المنتجات: السعر القديم مشطوب + السعر بعد الخصم + شارة التوفير</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-sm font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
          {busy ? "⏳…" : "💾 حفظ الإعدادات"}
        </button>
        {msg && <span className="text-xs font-bold text-amber-300" dir="rtl">{msg}</span>}
      </div>
    </section>
  );
}

// ============================================================
// 🎨 إدارة كتب التلوين — تحويل PDF من مكتبة الملفات لمنتج بسعر، تعديل السعر
// والتفعيل والترتيب والحذف — الأسعار والخصم يظهران على المنتجات فورًا
// ============================================================
interface ColoringRow {
  id: string;
  title: string;
  price: number;
  final: number;
  pages: number;
  url: string;
  active?: number;
}

function ColoringManager() {
  const [books, setBooks] = useState<ColoringRow[] | null>(null);
  const [pdfs, setPdfs] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({ file_id: "", title: "", price_egp: "49", pages: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/coloring?all=1");
      const d = await r.json();
      setBooks(Array.isArray(d.books) ? d.books : []);
    } catch {
      setBooks([]);
    }
    try {
      const r = await fetch("/api/files");
      const d = await r.json();
      setPdfs((d.files || []).filter((f: { kind: string }) => f.kind === "pdf"));
    } catch { /* القائمة تتحدث لاحقًا */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? okMsg : `⚠️ ${d.error || "تعذر تنفيذ العملية"}`);
      if (r.ok) await refresh();
    } catch {
      setMsg("⚠️ تعذر تنفيذ العملية");
    }
    setBusy(false);
  };

  const fld = "w-full rounded-lg border border-slate-700 bg-black/40 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500/60";
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#121826] p-5 lg:col-span-2">
      <h2 className="mb-1 text-lg font-black text-amber-200">🎨 كتب التلوين — المنتجات والأسعار</h2>
      <p className="mb-4 text-xs text-slate-400">ارفع PDF من مكتبة الملفات تحت ثم حوّله لمنتج بسعر يظهر في قسم كتب التلوين بالصفحة الرئيسية</p>

      <div className="grid gap-3 rounded-xl border border-slate-700/60 bg-black/20 p-4 md:grid-cols-[1.6fr_1fr_0.6fr_0.6fr_auto]">
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">📄 ملف PDF (من مكتبة الملفات)</label>
          <select value={form.file_id} onChange={(e) => setForm({ ...form, file_id: e.target.value })} className={fld}>
            <option value="">— اختر ملف PDF مرفوع —</option>
            {pdfs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">✍️ اسم الكتاب</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="رحلة إلى عالم البحار" className={fld} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">💵 السعر (ج)</label>
          <input dir="ltr" inputMode="decimal" value={form.price_egp} onChange={(e) => setForm({ ...form, price_egp: e.target.value })} className={fld} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-cyan-300">📄 عدد الصفحات</label>
          <input dir="ltr" inputMode="numeric" value={form.pages} onChange={(e) => setForm({ ...form, pages: e.target.value.replace(/[^0-9]/g, "") })} className={fld} />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => act({ action: "create", ...form, price_egp: Number(form.price_egp), pages: Number(form.pages) }, "✅ تمت إضافة الكتاب للصفحة الرئيسية")}
            disabled={busy || !form.file_id || !form.title}
            className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            ➕ إضافة
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-xs font-bold text-amber-300" dir="rtl">{msg}</p>}

      <div className="mt-4 space-y-2">
        {books === null && <p className="text-xs text-slate-500">⏳ جارٍ التحميل…</p>}
        {books?.length === 0 && <p className="text-xs text-slate-500">لا كتب بعد — أضف أول كتاب من الفورم فوق 👆</p>}
        {books?.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-black/30 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-200">🎨 {b.title} {(b as { active?: number }).active === 0 && <span className="text-[11px] text-red-400">(مخفي)</span>}</p>
              <p className="text-[11px] text-slate-500">{b.final}ج بعد الخصم · أصلًا {b.price}ج · {b.pages} صفحة</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                dir="ltr"
                defaultValue={b.price}
                inputMode="decimal"
                className="w-20 rounded-lg border border-slate-700 bg-black/40 px-2 py-1.5 text-center text-xs text-slate-100"
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v !== b.price) act({ action: "update", id: b.id, price_egp: v }, `✅ اتحدث سعر «${b.title}»`);
                }}
                title="عدّل السعر ثم اضغط خارج الخانة للحفظ"
              />
              <button onClick={() => act({ action: "update", id: b.id, active: (b as { active?: number }).active === 0 ? 1 : 0 }, "✅ تم التغيير")} className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20">
                {(b as { active?: number }).active === 0 ? "👁️ إظهار" : "🙈 إخفاء"}
              </button>
              <button onClick={() => act({ action: "delete", id: b.id }, "🗑️ تم حذف الكتاب")} className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20">
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

