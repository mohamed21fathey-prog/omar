"use client";

// ============================================================
// 🎬 استوديو الإنتاج الذاتي — نظام كامل لإنتاج أفلام الكرتون
// مشروع جديد ← كتابة القصة ← تقسيم المشاهد ← الشخصيات ← توليد كل مشهد
// (15 كريدت للمشهد) ← معاينة ← دمج ← تنزيل الفيلم النهائي
// المشاريع محفوظة في القاعدة — العميل يرجع لها في أي وقت
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

interface Me { username: string; email: string; credits?: number }
interface Character { name: string; description: string }
interface Project {
  id: string; title: string; story: string; aspect_ratio: string;
  characters: Character[]; status: string; merged_url: string | null;
  created_at: string; updated_at: string; scenes_total?: number; scenes_done?: number;
}
interface Scene {
  id: string; project_id: string; scene_no: number; prompt: string;
  status: string; task_id: string | null; video_url: string | null; error_message: string | null;
}

const SCENE_STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: "⏳ بانتظار التوليد", cls: "bg-slate-500/20 text-slate-300" },
  generating: { text: "🔄 قيد التوليد", cls: "bg-cyan-500/20 text-cyan-300" },
  completed: { text: "✅ جاهز", cls: "bg-green-500/20 text-green-300" },
  failed: { text: "❌ فشل — جرّب تاني", cls: "bg-red-500/20 text-red-300" },
};

// 💳 ثوابت الفوترة — المشهد = 15 كريدت بالظبط (توافق مع صفحات الشحن والرئيسية)
const SCENE_COST = 15;

// 🎛️ أقسام الخدمات الأحد عشر — نفس محرك التوليد، أسلوب مضبوط لكل نوع محتوى
const CATEGORIES: Array<{ key: string; label: string; hint: string }> = [
  { key: "kids_edu", label: "🎓 تعليمية للصغار", hint: "لغة بسيطة مبهجة وألوان زاهية" },
  { key: "nursery", label: "🔤 محتوى الحضانة", hint: "الحروف والأرقام والألوان والأشكال لعمر 2-5" },
  { key: "curriculum", label: "📚 شرح المناهج والدروس", hint: "خطوة بخطوة مع مثال لكل درس" },
  { key: "adults_edu", label: "🧠 تعليمية للكبار", hint: "معلومات عملية بعرض احترافي" },
  { key: "cartoon_film", label: "🎬 أفلام كرتون للعائلة", hint: "بناء درامي كامل وشخصيات ثابتة" },
  { key: "adventure", label: "🕵️ مغامرات وغموض وتشويق", hint: "تشنّج متصاعد ونهاية مفاجئة" },
  { key: "ads", label: "📢 إعلانات وتسويق", hint: "خطاف سريع ودعوة إجراء واضحة" },
  { key: "social", label: "📱 عامة وسوشيال ميديا", hint: "إيقاع سريع مناسب للشورتس" },
  { key: "puzzles", label: "🧩 ألغاز وتحديات", hint: "لغز في كل مشهد والإجابة في النهاية" },
  { key: "bedtime", label: "🌙 قصص قبل النوم", hint: "حكاية هادئة وإضاءة دافئة تنهيها بالنوم" },
  { key: "songs", label: "🎵 أغاني أطفال", hint: "إيقاع حماسي وحرف متكرر يردد عليه الطفل" },
];

const inputCls = "w-full rounded-lg border border-slate-600 bg-slate-900/70 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none";
const btnPrimary = "rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-amber-200 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50";
const btnGhost = "rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10";

// 📈 أفكار ترند — صيغ محتوى أثبتت نجاحها تاريخيًا في الانتشار على يوتيوب/فيسبوك لجميع أفراد الأسرة
// (بداية بديهية جاهزة: الزبون يضغط فيتكتب نص بدائي في خانة القصة ويكمل عليه)
const TREND_IDEAS: Record<string, string[]> = {
  kids_edu: [
    "بطل صغير خائف من الظلام يكتشف أن ظله صديق لعب محبب، ويتعلم مواجهة الخوف خطوة خطوة في مغامرة مضيئة.",
    "فتاة صغيرة تحلم بأن تصبح طبيبة، تلعب بالطبيب مع دميتها، وتنقذ يوم قطتها المريضة بذكائها وقلبها الطيب.",
    "بطل صغير يخسر لعبة محبوبة ويتعلم أن الصداقة أغلى من أي لعبة عندما يساعده صديقه في استرجاعها بمغامرة صغيرة ممتعة.",
  ],
  nursery: [
    "كرة ملونة تهرب من صندوق الألعاب وتتجول بين الحروف والأرقام، وتعلم الصغار الألوان وأشكالها بضحك ومرح.",
    "دبدوب صغير يفقد زر أنفه ويرحلة بين الأرقام من 1 إلى 5 ليجده، ويعيد الصغار العد معه في كل خطوة.",
    "بطة صغيرة تتعلم أصوات الحيوانات واحد واحد حتى تلحن أغنية جميلة يدندن معها كل الحيوانات.",
  ],
  curriculum: [
    "شرح عملي بسيط لعملية البولنج/الضرب لطالب متعثر بالرياضيات، يفهم المفهوم بمثال من مبيعات عصير في المدرسة.",
    "طالب يستعد لامتحان العلوم، ويكتشف الدورة المائية للماء بمغامرة قطرته الصغيرة من السحابة للنهر للبيت.",
    "طالبة تشرح لأصدقائها الجملة الاسمية والفعلية بمسرحية قصيرة، فيتضح الدرس بالمثال والتمثيل الممتع.",
  ],
  adults_edu: [
    "موظف يكتشف قاعدة الدقيقتين لإدارة الوقت، ويرتب يومه الفوضوي بمهام صغيرة تبدأ فورًا — مع نتائج عملية واضحة.",
    "شاب يبدأ استثماره الأول بمبلغ صغير، ويتعلم الفرق بين الادخار والاستثمار بأمثلة مبسطة من حياته اليومية.",
    "خريجة جديدة تتعلم مهارة التفاوض على الراتب في أول مقابلة عمل، بثلاث خطوات عملية تطبقها وتنجح.",
  ],
  cartoon_film: [
    "جرو صغير يتاه في المدينة الكبيرة، يقابل أصدقاء جدد يبني معهم بيتًا من الكرتون، ويعثر على بيت أحلامه بقلبه الشجاع.",
    "بطل صغير يصنع صاروخ من كرتونة قديمة، يطير به لأحلامه، ويلتقي بكوكب الألعاب التائهة ويرجع بحكاية رائعة.",
    "قطة عايدة مخبأ سحري بالأحلام، تطير كل ليلة لكوكب الأسماك الملونة، وتصنع فيلمًا كاملًا من مغامراتها.",
  ],
  adventure: [
    "خريطة كنز قديمة تظهر في مكتبة المدرسة، وطالبان ذكيان يحلان ألغازها المتتالية حتى يكتشفان كنزًا مفاجئًا.",
    "حبة مغربية مفقودة من صندوق الألعاب، يتحول العثور عليها لتحقيق بوليسي طفولي ممتع بخيوط وأدلة صغيرة.",
    "بطل صغير يسمع صوتًا غريبًا بالليل، يتبع أثره بشجاعة، ويكتشف سرًا لطيفًا يغير يومه بالكامل.",
  ],
  ads: [
    "منتج عصير طبيعي جديد: شاب يشربه فيتحول يومه الباهت ليوم مشرق مليان طاقة ولعب — مع دعوة واضحة للتجربة.",
    "مكتبة كتب جديدة تفتح في الحي، ومغامرة بطل صغير يكتشف فيها عالم الكتب المضيئة ويشاركه أصدقاؤه الاكتشاف.",
    "حذاء رياضي سحري جديد، يخلي خطواتك أسرع وأنشط في اللعب والمدرسة — إعلان بخطاف قوي من أول ثانية.",
  ],
  social: [
    "تحدي الطبخ الصغير: بطل صغير يحاول يجهز ساندويتش بنفسه وينتهي بالفوضى الكوميدية والنتيجة اللذيذة — إيقاع سريع للشورتس.",
    "قبل وبعد: ترتيب الغرفة الفوضوية في 10 ثوانٍ بموسيقى حماسية — قص سريع ومفاجأة النهاية.",
    "بطل صغير يقلد أصوات الحيوانات وأخته تتخمن الاسم الصح — لعبة تفاعلية الجمهور يشارك فيها من التعليقات.",
  ],
  puzzles: [
    "ألغاز مفقودات: مشهد غرفة ألعاب فيها 5 فروقات مخفية، والمشاهد له فرصة عدّها قبل كشف الإجابة مشهدًا مشهدًا.",
    "لغز الحيوان المجهول: ظل حيوان كبير يظهر بالتدريج مع تلميحات صوتية، والطفل يحاول التخمين قبل الإجابة المبهجة.",
    "تحدي المتاهة: بطل صغير يواجه متاهة مشهدين يختار طريق صحيح ويقع في طرق طريفة حتى يصل للجائزة في النهاية.",
  ],
  bedtime: [
    "النجم الصغير اللي بيساعد الأطفال يناموا: رحلة لطيفة في السماء هادئة بين الكواكب النائمة قبل إغماض العينين.",
    "الغزال الصغير بينسى حاجته قبل النوم: أسنان، فرشاة، قصة — روتين النوم بحكاية هادئة تنهيها جملة تصبح على خير.",
    "قمر أطفال الحي يقوم كل ليلة بالأمان: يعد الجمادات ويراقب أحلامهم بنور خافت دافئ حتى الصباح.",
  ],
  songs: [
    "أغنية الحروف: طفل يجري بين حروف عملاقة ملونة يقطفها واحد واحد مع إيقاع سريع — من الألف للياء.",
    "أغنية الأرقام من 1 لـ 10: كرات تنطط وتتجمع لعدّ كل رقم مع ردّد حماسي يشاركه الطفل.",
    "أغنية صباح الخير: روتين الصباح بالغناء — موعد الصحو، الفرشاة، السيريال، وحقيبة المدرسة بترتيب ممتع.",
  ],
};
const TREND_DEFAULT = TREND_IDEAS.kids_edu;

// 📦 حزمة النشر — نفس بنية الرد من /api/studio/action?action=publishkit
interface PublishKitUI {
  titles: string[];
  description: string;
  hashtags: string[];
  pinned_comment: string;
  best_post_time: string;
  thumbnail_text: string;
}

export default function StudioPage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [meError, setMeError] = useState(false);
  const [meRetry, setMeRetry] = useState(0);
  const [credits, setCredits] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [kit, setKit] = useState<PublishKitUI | null>(null);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [category, setCategory] = useState("");
  const [chars, setChars] = useState<Character[]>([]);
  const [sceneCount, setSceneCount] = useState(4);
  const [newScenePrompt, setNewScenePrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [mergeProgress, setMergeProgress] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mergePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- الجلسة (نمط محصّن: مهلة + إعادة محاولة) ----------
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    fetch("/api/auth/me", { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user || null);
        if (d.user) setCredits(typeof d.user.credits === "number" ? d.user.credits : 0);
      })
      .catch(() => setMeError(true))
      .finally(() => clearTimeout(timer));
  }, [meRetry]);

  // ---------- نوع المحتوى من الرابط: /studio?cat=kids_edu (من بطاقات الأقسام في الرئيسية) ----------
  useEffect(() => {
    try {
      const cat = new URLSearchParams(window.location.search).get("cat") || "";
      if (CATEGORIES.some((c) => c.key === cat)) {
        setCategory(cat);
        setMsg(`🎯 نوع المحتوى محدد مسبقًا: «${CATEGORIES.find((c) => c.key === cat)?.label}» — اكتب قصتك واضغط «قسّم القصة لمشاهد»`);
      }
    } catch { /* تجاهل */ }
  }, []);

  // ---------- المشاريع ----------
  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/studio/projects");
    if (!res.ok) return;
    const d = await res.json();
    setProjects(d.projects || []);
  }, []);

  useEffect(() => {
    if (me) void loadProjects();
  }, [me, loadProjects]);

  // ---------- فتح مشروع ----------
  const openProject = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setMsg("");
    const res = await fetch(`/api/studio/projects/${id}`);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error || "⚠️ تعذر فتح المشروع"); return; }
    const d = await res.json();
    setProject(d.project);
    setScenes(d.scenes || []);
    setTitle(d.project.title);
    setStory(d.project.story);
    setAspect(d.project.aspect_ratio);
    setCategory((d.project as Project & { category?: string }).category || "");
    setChars(d.project.characters || []);
  }, []);

  // متابعة المشاهد قيد التوليد — كل 5 ثوانٍ (أسرع في إظهار المشاهد الجاهزة)
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (project && scenes.some((s) => s.status === "generating")) {
      pollRef.current = setInterval(() => { void openProject(project.id, true); }, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [project, scenes, openProject]);

  // ---------- إنشاء / حفظ ----------
  const newProject = async () => {
    setBusy("new"); setMsg("");
    try {
      const res = await fetch("/api/studio/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "مشروع جديد", category }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر إنشاء المشروع");
      setProjects((p) => [d.project, ...p]);
      setTitle(d.project.title); setStory(""); setAspect("16:9"); setChars([]); setScenes([]);
      setProject(d.project);
      setMsg("🎬 مشروع جديد جاهز — اكتب قصتك واضغط «قسّم القصة لمشاهد»");
    } catch (e) { setMsg(`⚠️ ${(e as Error).message}`); }
    setBusy("");
  };

  const saveProject = async () => {
    if (!project) return;
    setBusy("save"); setMsg("");
    try {
      const res = await fetch(`/api/studio/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, story, aspect_ratio: aspect, category, characters: chars }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر الحفظ");
      setProject(d.project);
      setMsg("✅ اتحفظ — تقدر ترجع للمشروع في أي وقت من قائمة مشاريعك");
      void loadProjects();
    } catch (e) { setMsg(`⚠️ ${(e as Error).message}`); }
    setBusy("");
  };

  const removeProject = async (id: string) => {
    if (!confirm("متأكد من حذف المشروع وكل مشاهد؟")) return;
    setBusy("del"); setMsg("");
    try {
      const res = await fetch(`/api/studio/projects/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "تعذر الحذف"); }
      setProjects((p) => p.filter((x) => x.id !== id));
      if (project?.id === id) { setProject(null); setScenes([]); }
      setMsg("🗑️ اتمسح المشروع");
    } catch (e) { setMsg(`⚠️ ${(e as Error).message}`); }
    setBusy("");
  };

  // ---------- العمليات ----------
  const act = async (payload: Record<string, unknown>, busyKey: string): Promise<Record<string, unknown> | null> => {
    setBusy(busyKey); setMsg("");
    try {
      const res = await fetch("/api/studio/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(d.error || "فشل تنفيذ العملية"));
      return d;
    } catch (e) { setMsg(`⚠️ ${(e as Error).message}`); return null; }
    finally { setBusy(""); }
  };

  const split = async () => {
    if (!project) return;
    if (!story.trim()) return setMsg("⚠️ اكتب القصة الأول");
    const d = await act({ action: "split", project_id: project.id, count: sceneCount, category }, "split");
    if (d) {
      setScenes((d.scenes as Scene[]) || []);
      setMsg(`✅ اتقسمت القصة لـ ${d.split_count} مشاهد — راجعها وعدّل اللي تحب ثم ولّد كل مشهد`);
      if (typeof d === "object") void loadProjects();
    }
  };

  const addScene = async () => {
    if (!project || !newScenePrompt.trim()) return setMsg("⚠️ اكتب وصف المشهد");
    const d = await act({ action: "add_scene", project_id: project.id, prompt: newScenePrompt }, "add");
    if (d) { setScenes((d.scenes as Scene[]) || []); setNewScenePrompt(""); }
  };

  const saveScene = async (sceneId: string, prompt: string) => {
    const d = await act({ action: "update_scene", scene_id: sceneId, prompt }, "scene");
    if (d) setScenes((d.scenes as Scene[]) || []);
  };

  const deleteScene = async (sceneId: string) => {
    if (!confirm("حذف المشهد؟ (المشاهد المكتملة معاها فيديوها هتتشال)")) return;
    const d = await act({ action: "delete_scene", scene_id: sceneId }, "del");
    if (d) { setScenes((d.scenes as Scene[]) || []); void loadProjects(); }
  };

  const generate = async (sceneId: string) => {
    if (!project) return;
    const d = await act({ action: "generate", scene_id: sceneId }, `gen-${sceneId}`);
    if (d) {
      const scene = d.scene as Scene;
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? scene : s)));
      if (typeof d.deducted === "number" && d.deducted > 0) {
        setCredits(typeof d.balance === "number" ? d.balance : credits - d.deducted);
        setMsg(`🎬 بدأ توليد المشهد — اتحسب ${d.deducted} كريدت (رصيدك دلوقتي ${d.balance})`);
      }
      void loadProjects();
    }
  };

  // ⚡ توليد كل المشاهد المتبقية بالتوازي — المشاهد تشتغل كلها عند المزود في نفس الوقت
  // (بدل ما الزبون يضغط على كل مشهد لوحده ويستنى واحد واحد) — الخصم والاسترداد لكل مشهد زي ما هو ذريًا
  const pendingScenes = scenes.filter((s) => s.status !== "completed" && s.status !== "generating" && s.prompt.trim());
  const pendingCost = pendingScenes.length * SCENE_COST;
  const generateAll = async () => {
    if (!project || !pendingScenes.length) return;
    if (pendingCost > credits) {
      setMsg(`💳 توليد كل المشاهد (${pendingScenes.length} × ${SCENE_COST} = ${pendingCost} كريدت) أكبر من رصيدك ${credits} — اشحن الأول أو ولّد مشهد مشهد`);
      return;
    }
    if (!confirm(`⚡ توليد ${pendingScenes.length} مشاهد بالتوازي دفعة واحدة؟ (اتحسب ${pendingCost} كريدت — وكل مشهد فشل رصيده بيرجع تلقائيًا)`)) return;
    setMsg(`⚡ بدأ توليد ${pendingScenes.length} مشاهد بالتوازي — المشاهد بتشتغل كلها مع بعض دلوقتي…`);
    const results = await Promise.allSettled(
      pendingScenes.map((s) => act({ action: "generate", scene_id: s.id }, `gen-${s.id}`))
    );
    let ok = 0;
    let newBalance: number | null = null;
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        ok++;
        const d = r.value as { scene?: Scene; balance?: number };
        if (d.scene) setScenes((prev) => prev.map((x) => (x.id === d.scene!.id ? d.scene! : x)));
        if (typeof d.balance === "number") newBalance = d.balance;
      }
    }
    if (newBalance != null) setCredits(newBalance);
    setMsg(`⚡ اتولد طلب تشغيل ${ok}/${pendingScenes.length} مشهد بالتوازي — تقدر تقفل الصفحة، المشاهد بتكمل وتظهر لوحدها`);
    void loadProjects();
  };

  // 📦 حزمة النشر الترندية — مجانية (نصوص بالذكاء الاصطناعي، مش بتكليس توليد)
  const loadKit = async () => {
    if (!project) return;
    const d = await act({ action: "publishkit", project_id: project.id }, "kit");
    if (d?.kit) { setKit(d.kit as PublishKitUI); setMsg("📦 حزمة النشر جاهزة — انسخ العناوين والهاشتاجات وانشر"); }
  };

  const merge = async () => {
    if (!project) return;
    const d = await act({ action: "merge", project_id: project.id }, "merge");
    if (!d) return;
    if (d.done) {
      setProject((p) => (p ? { ...p, merged_url: String(d.merged_url || ""), status: "merged" } : p));
      setMsg(`🎉 الفيلم جاهز (${d.parts} مشاهد مدموجة) — عاينه وانزّله تحت`);
      setMergeProgress(null);
    } else {
      setMergeProgress(typeof d.progress === "number" ? d.progress : 10);
      const mergeTaskId = String(d.merge_task_id || "");
      if (mergePollRef.current) clearInterval(mergePollRef.current);
      mergePollRef.current = setInterval(async () => {
        const res = await fetch("/api/studio/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge_status", project_id: project.id, merge_task_id: mergeTaskId }) });
        const st = await res.json().catch(() => ({}));
        if (st.done) {
          if (mergePollRef.current) clearInterval(mergePollRef.current);
          setMergeProgress(null);
          if (st.merged_url) {
            setProject((p) => (p ? { ...p, merged_url: String(st.merged_url), status: "merged" } : p));
            setMsg("🎉 الفيلم النهائي جاهز — عاينه وانزّله");
          } else if (st.failed) setMsg(`⚠️ فشل الدمج: ${st.error || "جرّب تاني"}`);
        } else if (typeof st.progress === "number") setMergeProgress(st.progress);
      }, 5000);
    }
  };

  const backToList = () => {
    if (mergePollRef.current) clearInterval(mergePollRef.current);
    setProject(null); setScenes([]); setMsg(""); setMergeProgress(null); setKit(null);
    void loadProjects();
  };

  // ---------- العرض ----------
  if (me === undefined && !meError) {
    return <main className="min-h-screen lux p-4 text-slate-100"><p className="py-24 text-center text-sm text-slate-300">⏳ بيحمّل…</p></main>;
  }
  if (me === undefined && meError) {
    return (
      <main className="min-h-screen lux p-4 text-slate-100">
        <div className="py-24 text-center">
          <p className="text-sm font-bold text-rose-300">⚠️ تعذّر تحميل الاستوديو — تأكد من اتصالك.</p>
          <button onClick={() => { setMeError(false); setMeRetry((n) => n + 1); }} className={`mt-4 ${btnPrimary}`}>🔄 أعد المحاولة</button>
        </div>
      </main>
    );
  }
  if (me === null) {
    return (
      <main className="min-h-screen lux p-4 text-slate-100">
        <div className="mx-auto max-w-md py-24 text-center">
          <p className="text-3xl">🎬</p>
          <h1 className="mt-3 text-xl font-bold text-amber-200">استوديو الإنتاج الذاتي</h1>
          <p className="mt-3 text-sm text-slate-300">سجّل دخولك الأول عشان تنشئ مشاريعك وتحفظها وترجع لها في أي وقت.</p>
          <a href="/account" className={`mt-5 inline-block ${btnPrimary}`}>🔑 سجل دخول من صفحة حسابي</a>
          <p className="mt-4 text-xs text-slate-400">معندكش حساب؟ نفس الصفحة تعملك حساب جديد بثواني.</p>
        </div>
      </main>
    );
  }

  const doneCount = scenes.filter((s) => s.status === "completed").length;
  const generatingCount = scenes.filter((s) => s.status === "generating").length;

  return (
    <main className="min-h-screen lux p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl"><span className="neon-title">🎬 استوديو الإنتاج الذاتي</span></h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">من القصة للفيلم: قسّم، ولّد، عاين، ادمج، وانزّل — كل حاجة بنفسك</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">⚡ رصيدك: {credits} كريدت</span>
            <ThemeToggle />
            <a href="/account" className={btnGhost}>حسابي</a>
            <a href="/" className={btnGhost}>← الرئيسية</a>
          </div>
        </header>

        {msg && <div className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">{msg}</div>}

        {!project ? (
          /* ---------------- قائمة المشاريع ---------------- */
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-200">مشاريعك ({projects.length})</h2>
              <button onClick={newProject} disabled={busy === "new"} className={btnPrimary}>{busy === "new" ? "⏳ جاري…" : "＋ مشروع جديد"}</button>
            </div>
            {projects.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                <p className="text-4xl">🎥</p>
                <p className="mt-3 text-sm text-slate-300">لسه مفيش مشاريع — اعمل أول مشروع واكتب قصتك، والاستوديو يقسّمها ويولّدها فيديو</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/40">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => openProject(p.id)} className="text-right">
                        <p className="font-bold text-amber-200">{p.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{p.scenes_total || 0} مشهد — جاهز منهم {p.scenes_done || 0}</p>
                        <p className="mt-1 text-xs text-slate-500">{p.status === "merged" ? "🎉 متدمج" : p.status === "producing" ? "قيد الإنتاج" : "مسودة"}</p>
                      </button>
                      <button onClick={() => removeProject(p.id)} disabled={busy === "del"} className="text-xs text-red-300 hover:text-red-200">حذف</button>
                    </div>
                    {p.merged_url && (
                      <video src={p.merged_url} controls preload="metadata" className="mt-3 w-full rounded-lg" style={{ maxWidth: "100%", height: "auto" }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          /* ---------------- محرر المشروع ---------------- */
          <>
            <section className="space-y-5">
              {/* رأس المشروع */}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={backToList} className={btnGhost}>← مشاريعي</button>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} max-w-md flex-1 font-bold`} placeholder="عنوان المشروع" />
                <button onClick={saveProject} disabled={busy === "save"} className={btnPrimary}>{busy === "save" ? "⏳…" : "💾 حفظ"}</button>
              </div>

              {/* الخطوة 1: القصة والشخصيات */}
              <section className="glass p-5">
                <h2 className="mb-3 text-lg font-bold text-slate-200">1) القصة والنوع والشخصيات</h2>
                {/* نوع المحتوى — 8 أقسام: يضبط أسلوب التقسيم والمشاهد بنفس محرك التوليد */}
                <div className="mb-4">
                  <p className="mb-2 text-sm font-bold text-slate-300">نوع المحتوى — اختار القسم وهنضبط الأسلوب أوتوماتيكيًا:</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setCategory(category === c.key ? "" : c.key)}
                        title={c.hint}
                        className={`card-3d rounded-xl border p-2.5 text-right ${category === c.key ? "border-fuchsia-400/60 bg-fuchsia-500/15 shadow-lg shadow-fuchsia-500/20" : "border-white/10 bg-white/5 hover:border-cyan-400/40"}`}
                      >
                        <span className={`text-sm font-bold ${category === c.key ? "text-fuchsia-200" : "text-slate-200"}`}>{c.label}</span>
                        <span className="block text-[11px] text-slate-400">{c.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={6} className={inputCls} placeholder="اكتب قصتك كاملة هنا — والاستوديو يقسمها لمشاهد فيديو متسلسلة…" />
                {/* 📈 أفكار ترند — صيغ انتشار مجربة: ضغطة واحدة تكتب بداية جاهزة تعديل عليها */}
                <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                  <p className="mb-2 text-xs font-bold text-amber-300">📈 أفكار ترند لقسم «{CATEGORIES.find((c) => c.key === category)?.label || "كل الأقسام"}» — بنية فيرال مجربة تجيب مشاهدات وساعات مشاهدة:</p>
                  <div className="flex flex-wrap gap-2">
                    {(TREND_IDEAS[category] || TREND_DEFAULT).map((idea, i) => (
                      <button
                        key={i}
                        onClick={() => { setStory(idea); setMsg(`📈 اتحط فكرة ترند جاهزة (${i + 1}) — عدّلها زي ما تحب ثم قسّمها لمشاهد`); }}
                        className="max-w-full rounded-lg border border-amber-500/35 bg-black/40 px-3 py-1.5 text-right text-[11px] leading-relaxed text-slate-200 transition hover:border-amber-300 hover:bg-amber-500/10"
                      >
                        {idea.length > 64 ? `${idea.slice(0, 64)}…` : idea}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <span>الشاشة:</span>
                    <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-900/70 p-2 text-sm text-slate-100">
                      <option value="16:9">16:9 عرضي</option>
                      <option value="9:16">9:16 شورتس</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <span>عدد المشاهد:</span>
                    <input type="number" min={2} max={12} value={sceneCount} onChange={(e) => setSceneCount(Math.max(2, Math.min(12, Number(e.target.value) || 4)))} className="w-16 rounded-lg border border-slate-600 bg-slate-900/70 p-2 text-center text-sm text-slate-100" />
                  </div>
                  <button onClick={split} disabled={busy === "split"} className={btnPrimary}>{busy === "split" ? "⏳ بيقسم…" : "✂️ قسّم القصة لمشاهد"}</button>
                  <span className="text-xs text-slate-400">تقسيم بالذكاء الاصطناعي مع ثبات شكل الشخصيات بين المشاهد</span>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-300">الشخصيات ({chars.length}) — وصف ثابت = شكل ثابت في كل المشاهد</p>
                    <button onClick={() => chars.length < 8 && setChars([...chars, { name: "", description: "" }])} className={btnGhost}>＋ شخصية</button>
                  </div>
                  {chars.length === 0 && <p className="text-xs text-slate-400">مفيش شخصيات (اختياري) — بس لو حطيت وصف ثابت، شكل البطل هيفضل زي بعضه في كل مشهد</p>}
                  <div className="space-y-2">
                    {chars.map((c, i) => (
                      <div key={i} className="grid gap-2 sm:grid-cols-[1fr_3fr_auto]">
                        <input value={c.name} onChange={(e) => setChars(chars.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={inputCls} placeholder="الاسم (مثل: عمر)" />
                        <input value={c.description} onChange={(e) => setChars(chars.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className={inputCls} placeholder="الشكل الثابت: بطل صغير 7 سنين، قميص أحمر، شعر أسفرفاتح، عينين كبيرتين — كرتون ثلاثي الأبعاد" />
                        <button onClick={() => setChars(chars.filter((_, j) => j !== i))} className="rounded-lg border border-red-400/30 px-3 text-sm text-red-300 hover:bg-red-500/10">حذف</button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* الخطوة 2: المشاهد */}
              <section className="glass p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-slate-200">2) المشاهد ({scenes.length}) — كل مشهد فيديو 8 ثوانٍ بـ <span className="text-amber-300">15 كريدت</span></h2>
                  {generatingCount > 0 && <span className="text-sm text-cyan-300">🔄 {generatingCount} مشاهد بتتولد دلوقتي…</span>}
                </div>
                <p className="mb-3 rounded-lg border border-green-400/25 bg-green-500/10 px-3 py-2 text-xs text-green-200">
                  💳 <b>رصيد الموقع هو المحرك لكل شيء</b> — كل مشهد (8 ثوانٍ) بيخصم {SCENE_COST} كريدت من رصيدك مباشرة. مش محتاج أي مفاتيح أو إعدادات تقنية، كل شيء جاهز من عندنا.
                  ولو التوليد فشل لأي سبب، رصيدك بيرجع تلقائيًا بالكامل.
                </p>
                {scenes.length === 0 && <p className="text-sm text-slate-400">لسه مفيش مشاهد — قسّم القصة فوق أو ضيف مشهد يدويًا تحت</p>}
                <div className="space-y-4">
                  {pendingScenes.length > 1 && (
                    <button onClick={generateAll} disabled={busy !== ""} className="btn-gold w-full px-5 py-3 text-sm">
                      ⚡ ولّد كل المشاهد المتبقية بالتوازي ({pendingScenes.length} مشاهد = {pendingCost} كريدت) — أسرع 4×
                    </button>
                  )}
                  {scenes.map((s) => (
                    <div key={s.id} className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-cyan-300">مشهد {s.scene_no}</span>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${SCENE_STATUS[s.status]?.cls || SCENE_STATUS.pending.cls}`}>{SCENE_STATUS[s.status]?.text || s.status}</span>
                          {(s.status === "pending" || s.status === "failed") && (
                            <button onClick={() => generate(s.id)} disabled={busy === `gen-${s.id}`} className={btnPrimary}>{busy === `gen-${s.id}` ? "⏳…" : s.status === "failed" ? "🔁 جرّب تاني" : "🎬 ولّد (15 كريدت)"}</button>
                          )}
                          <button onClick={() => deleteScene(s.id)} className="text-xs text-red-300 hover:text-red-200">حذف</button>
                        </div>
                      </div>
                      {s.status === "completed" && s.video_url ? (
                        <video src={s.video_url} controls preload="metadata" className="w-full rounded-lg" style={{ maxWidth: "100%", height: "auto" }} />
                      ) : (
                        <>
                          <SceneEditor initial={s.prompt} onSave={(p) => saveScene(s.id, p)} />
                          {s.error_message && <p className="mt-2 text-xs text-red-300">{s.error_message}</p>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-white/20 p-4">
                  <textarea value={newScenePrompt} onChange={(e) => setNewScenePrompt(e.target.value)} rows={2} className={inputCls} placeholder="ضيف مشهد يدويًا — وصف بصري كامل: شكل الشخصية + الحدث + الخلفية + أسلوب كرتون ثلاثي الأبعاد مشرق" />
                  <button onClick={addScene} disabled={busy === "add" || !newScenePrompt.trim()} className={`mt-2 ${btnPrimary}`}>＋ ضيف المشهد</button>
                </div>
              </section>

              {/* الخطوة 3: الدمج والتنزيل */}
              <section className="glass p-5">
                <h2 className="mb-3 text-lg font-bold text-slate-200">3) الدمج والتنزيل</h2>
                {doneCount < 2 ? (
                  <p className="text-sm text-slate-400">محتاج مشهدَين مكتملَين على الأقل عشان الدمج (جاهز: {doneCount}) — الدمج نفسه <span className="text-green-300">مجاني</span></p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={merge} disabled={busy === "merge"} className={btnPrimary}>{busy === "merge" ? "⏳ بيدمج…" : "🎬 ادمج المشاهد واعمل الفيلم"}</button>
                    <span className="text-xs text-slate-400">{doneCount} مشاهد جاهزة (حد أقصى للدمج 10)</span>
                  </div>
                )}
                {/* 📦 حزمة النشر الترندية — مجانية بالذكاء الاصطناعي: عناوين + وصف + هاشتاجات + تعليق مثبت + وقت النشر */}
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-amber-300">📦 حزمة النشر الترندية — تصدّر أسرع على يوتيوب وفيسبوك</p>
                    <button onClick={loadKit} disabled={busy === "kit"} className="btn-gold px-4 py-2 text-xs">{busy === "kit" ? "⏳ بيجهز…" : kit ? "🔄 حدّث الحزمة" : "🚀 جهّز حزمة النشر (مجاني)"}</button>
                  </div>
                  {kit && (
                    <div className="mt-3 space-y-3 text-xs">
                      <div>
                        <p className="mb-1 font-bold text-slate-300">5 عناوين محسّنة للبحث — اضغط العنوان لتنسخه:</p>
                        <div className="space-y-1">
                          {kit.titles.map((t, i) => (
                            <button key={i} onClick={() => { navigator.clipboard?.writeText(t).catch(() => undefined); setMsg(`✅ اتنسخ العنوان ${i + 1}`); }} className="block w-full rounded-lg border border-amber-500/25 bg-black/40 px-2.5 py-1.5 text-right text-slate-200 hover:border-amber-300">{i + 1}. {t}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 font-bold text-slate-300">الوصف + الكلمات المفتاحية:</p>
                        <p className="whitespace-pre-line rounded-lg border border-white/10 bg-black/40 p-2.5 leading-relaxed text-slate-200">{kit.description}</p>
                        <button onClick={() => { navigator.clipboard?.writeText(kit.description).catch(() => undefined); setMsg("✅ اتنسخ الوصف"); }} className="mt-1 text-[11px] text-cyan-300 hover:text-cyan-200">📋 انسخ الوصف</button>
                      </div>
                      <div>
                        <p className="mb-1 font-bold text-slate-300">الهاشتاجات ({kit.hashtags.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {kit.hashtags.map((h, i) => <span key={i} className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-fuchsia-300">{h}</span>)}
                        </div>
                        <button onClick={() => { navigator.clipboard?.writeText(kit.hashtags.join(" ")).catch(() => undefined); setMsg("✅ اتنسخت الهاشتاجات"); }} className="mt-1 text-[11px] text-cyan-300 hover:text-cyan-200">📋 انسخ الكل</button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-white/10 bg-black/40 p-2.5"><p className="mb-1 font-bold text-amber-300">💬 تعليق مثبت</p><p className="text-slate-200">{kit.pinned_comment}</p></div>
                        <div className="rounded-lg border border-white/10 bg-black/40 p-2.5"><p className="mb-1 font-bold text-amber-300">⏰ أفضل وقت نشر</p><p className="text-slate-200">{kit.best_post_time}</p></div>
                        <div className="rounded-lg border border-white/10 bg-black/40 p-2.5"><p className="mb-1 font-bold text-amber-300">🖼️ نص الغلاف</p><p className="text-slate-200">{kit.thumbnail_text}</p></div>
                      </div>
                      <p className="text-[10px] text-slate-500">الأرقام هنا حقيقية مبنية على قصتك — ومفيش أي مشاهدات مخترعة. مشاهدات يوتيوب الفعلية هتظهر أول ما تربط قناتك وتنشر منها.</p>
                    </div>
                  )}
                </div>
                {mergeProgress !== null && (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-violet-600 transition-all" style={{ width: `${Math.min(100, Math.max(5, mergeProgress))}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-cyan-300">🔄 الدمج شغال… {Math.min(100, Math.max(5, mergeProgress))}%</p>
                  </div>
                )}
                {project.merged_url && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-bold text-green-300">🎉 الفيلم النهائي:</p>
                    <video src={project.merged_url} controls className="w-full rounded-xl" style={{ maxWidth: "100%", height: "auto" }} />
                    <a href={project.merged_url} download target="_blank" rel="noreferrer" className={`mt-3 inline-block ${btnPrimary}`}>⬇️ نزّل الفيلم</a>
                  </div>
                )}
              </section>
            </section>
          </>
        )}
        <FloatingWhatsApp />
      </div>
    </main>
  );
}

// محرر وصف المشهد — حالة محلية مستقلة لكل مشهد مع زر حفظ صريح
function SceneEditor({ initial, onSave }: { initial: string; onSave: (p: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <div>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={2} className={inputCls} placeholder="وصف المشهد البصري…" />
      <button onClick={() => onSave(v)} disabled={!v.trim() || v.trim() === initial.trim()} className="mt-2 rounded-lg border border-cyan-400/40 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-40">💾 احفظ تعديل الوصف</button>
    </div>
  );
}
