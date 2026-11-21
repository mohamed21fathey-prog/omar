"use client";

// 📚 مكتبة الفيديوهات — رفع شورتس/فيديو عرضي + استيراد فيديوهات الموقع
// + دمج أي مجموعة فيديوهات (مرفوع أو مستورد) + حذف مكتمل أو غير مكتمل
import { useCallback, useEffect, useRef, useState } from "react";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

interface Item {
  id: string;
  title: string;
  source: string; // upload | import | merge
  orientation: string;
  status: string; // ready | merging | failed
  size: number | null;
  src: string | null;
  error: string | null;
  created_at: string | null;
}

interface Source {
  title: string;
  url: string;
}

const MAX_UPLOAD = 3 * 1024 * 1024;
const SOURCE_LABEL: Record<string, string> = { upload: "⬆️ مرفوع", import: "📥 مستورد", merge: "🧩 مدمج" };
const STATUS_LABEL: Record<string, string> = { ready: "✅ جاهز", merging: "⏳ جارٍ الدمج", failed: "❌ فشل" };

export default function LibraryPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [episodes, setEpisodes] = useState<Source[]>([]);
  const [scenes, setScenes] = useState<Source[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [orientation, setOrientation] = useState("9:16");
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSources, setShowSources] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "فشلت العملية");
    return d;
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/library");
      if (r.status === 401) {
        setAuthed(false);
        return;
      }
      const d = await r.json();
      setAuthed(true);
      setItems(Array.isArray(d.items) ? d.items : []);
      setEpisodes(Array.isArray(d.sources?.episodes) ? d.sources.episodes : []);
      setScenes(Array.isArray(d.sources?.scenes) ? d.sources.scenes : []);
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // متابعة آلية: أي عنصر جارٍ الدمج → استعلام كل 5 ثوانٍ حتى ينتهي
  useEffect(() => {
    const merging = items.some((it) => it.status === "merging");
    if (!merging) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const now = items.filter((it) => it.status === "merging");
      for (const it of now) {
        try {
          await post({ action: "refresh", id: it.id });
        } catch { /* نحاول مرة تالية */ }
      }
      void load();
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, load]);

  const pickFile = (f: File | null) => {
    setFile(f);
    setMsg("");
    if (f && f.size > MAX_UPLOAD) setMsg("⚠️ الحجم أكبر من 3MB — قصّ الفيديو أو اضغطه ثم أعد الرفع");
    if (f && !/video\/(mp4|webm|quicktime)/.test(f.type)) setMsg("⚠️ الصيغة المسموحة: MP4 أو WebM أو MOV فقط");
  };

  const upload = async () => {
    if (!file) return setMsg("⚠️ اختار ملف فيديو أولًا");
    if (file.size > MAX_UPLOAD) return setMsg("⚠️ الحجم أكبر من 3MB — قصّ الفيديو أو اضغطه ثم أعد الرفع");
    setBusy(true);
    setMsg("");
    try {
      const buf = await file.arrayBuffer();
      // base64 بالقطع — أسرع وأخف من التجميع سطرًا سطرًا
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const b64 = btoa(binary);
      await post({ action: "add-upload", title: title.trim() || file.name.slice(0, 120), mime: file.type, orientation, data64: b64 });
      setFile(null);
      setTitle("");
      setMsg("✅ اترفع الفيديو ومتضاف للمكتبة");
      await load();
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "فشل الرفع"}`);
    }
    setBusy(false);
  };

  const importSource = async (s: Source, orient: string) => {
    setBusy(true);
    try {
      await post({ action: "import", title: s.title, url: s.url, orientation: orient });
      setMsg(`✅ اتستورد: ${s.title.slice(0, 40)}`);
      await load();
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "فشل الاستيراد"}`);
    }
    setBusy(false);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const mergeSelected = async () => {
    if (selected.size < 2) return setMsg("⚠️ اختار فيديوهين على الأقل للدمج");
    setBusy(true);
    try {
      await post({ action: "merge", ids: [...selected] });
      setSelected(new Set());
      setMsg("🧩 بدأ الدمج — هتلاقي الناتج جاهز هنا بعد لحظات");
      await load();
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "فشل بدء الدمج"}`);
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await post({ action: "delete", id });
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      await load();
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "فشل الحذف"}`);
    }
    setBusy(false);
  };

  const fmtSize = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(1)}MB` : "");

  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">📚 مكتبة الفيديوهات</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>

        {authed === null && <p className="p-8 text-center text-slate-400">⏳ جارٍ التحميل…</p>}

        {authed === false && (
          <div className="rounded-3xl border border-amber-400/30 bg-white/5 p-8 text-center shadow-xl">
            <p className="text-5xl">🔐</p>
            <h2 className="mt-3 text-lg font-black text-amber-200">المكتبة مرتبطة بحسابك</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">سجل دخول من صفحة حسابك ثم ارجع هنا — هتلاقي فيديوهاتك وترفع الجديد وتدمج زي ما تحب.</p>
            <a href="/account" className="btn-gold mt-5 inline-block px-8 py-3 text-base">🔑 سجل دخول من صفحة حسابي</a>
          </div>
        )}

        {authed === true && (
          <>
            {msg && <p className="mb-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-center text-sm font-bold text-cyan-200">{msg}</p>}

            {/* رفع فيديو جديد */}
            <section className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
              <h2 className="mb-1 text-lg font-black text-amber-200">⬆️ ارفع فيديو جديد</h2>
              <p className="mb-4 text-xs text-slate-400">شورتس (9:16) أو فيديو عرضي (16:9) — MP4/WebM/MOV حتى 3MB (اللقطات القصيرة والشورتس بترفع عادي)</p>
              <div className="grid gap-2 md:grid-cols-4">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الفيديو (اختياري)" className="rounded-lg border border-slate-600 bg-slate-900/70 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none md:col-span-2" />
                <select value={orientation} onChange={(e) => setOrientation(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-900/70 p-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none">
                  <option value="9:16">📱 شورتس عمودي (9:16)</option>
                  <option value="16:9">🖥️ فيديو عرضي (16:9)</option>
                </select>
                <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => pickFile(e.target.files?.[0] || null)} className="rounded-lg border border-slate-600 bg-slate-900/70 p-2 text-sm text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-amber-500/20 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-amber-200" />
              </div>
              <button onClick={upload} disabled={busy || !file} className="btn-gold mt-3 px-7 py-2.5 text-sm disabled:opacity-50">
                {busy ? "⏳…" : "🚀 ارفع للمكتبة"}
              </button>
            </section>

            {/* استيراد من إنتاج الموقع */}
            <section className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
              <button onClick={() => setShowSources((s) => !s)} className="flex w-full items-center justify-between text-lg font-black text-amber-200">
                <span>📥 استورد فيديوهات جاهزة من إنتاج الموقع</span>
                <span className="text-sm text-slate-400">{showSources ? "إخفاء ▲" : `عرض (${episodes.length + scenes.length}) ▼`}</span>
              </button>
              {showSources && (
                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="mb-2 text-sm font-bold text-cyan-300">🎬 حلقات مدمجة ({episodes.length})</h3>
                    {episodes.length === 0 && <p className="text-xs text-slate-500">لسه مفيش حلقات مدمجة — تظهر هنا أول ما المصنع يكمل حلقة</p>}
                    <div className="space-y-2">
                      {episodes.map((s, i) => (
                        <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                          <span className="text-xs text-slate-300">{s.title.slice(0, 70)}</span>
                          <button onClick={() => importSource(s, "16:9")} disabled={busy} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">📥 استورد</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-bold text-cyan-300">🎥 مشاهد الاستوديو المكتملة ({scenes.length})</h3>
                    {scenes.length === 0 && <p className="text-xs text-slate-500">كمّل مشهد في الاستوديو وهتلاقيه هنا جاهز للاستيراد</p>}
                    <div className="space-y-2">
                      {scenes.map((s, i) => (
                        <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                          <span className="text-xs text-slate-300">{s.title.slice(0, 70)}</span>
                          <button onClick={() => importSource(s, "16:9")} disabled={busy} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">📥 استورد</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* شريط الدمج */}
            <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4">
              <p className="text-sm font-bold text-fuchsia-200">🧩 الدمج: علّم على أي فيديوهات (مرفوعة أو مستوردة) وادمجهم في فيديو واحد — بالترتيب اللي ظاهرين به</p>
              <button onClick={mergeSelected} disabled={busy || selected.size < 2} className="btn-gold px-6 py-2.5 text-sm disabled:opacity-50">
                🧩 ادمج المحدد ({selected.size})
              </button>
            </section>

            {/* شبكة الفيديوهات */}
            {items.length === 0 ? (
              <p className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-400">المكتبة فاضية — ارفع أول فيديو أو استورد من إنتاج الموقع فوق ☝️</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((it) => (
                  <div key={it.id} className={`overflow-hidden rounded-2xl border shadow-lg transition ${selected.has(it.id) ? "border-fuchsia-400/60 bg-fuchsia-500/10" : "border-white/10 bg-white/5"}`}>
                    <div className="relative bg-slate-900">
                      {it.src ? (
                        <video src={it.src} controls preload="metadata" playsInline className="aspect-video w-full bg-slate-900 object-contain" />
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center text-3xl">{it.status === "merging" ? "⏳" : "🎬"}</div>
                      )}
                      <label className="absolute right-2 top-2 flex cursor-pointer items-center gap-1 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[10px] font-bold text-slate-200">
                        <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="accent-fuchsia-500" disabled={it.status !== "ready"} />
                        للدمج
                      </label>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-bold text-slate-100" title={it.title}>{it.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                        <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">{SOURCE_LABEL[it.source] || it.source}</span>
                        <span className={`rounded-full border px-2 py-0.5 ${it.status === "ready" ? "border-green-400/40 bg-green-500/10 text-green-300" : it.status === "merging" ? "border-amber-400/40 bg-amber-500/10 text-amber-300" : "border-rose-400/40 bg-rose-500/10 text-rose-300"}`}>{STATUS_LABEL[it.status] || it.status}</span>
                        <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-slate-300">{it.orientation === "9:16" ? "📱 9:16" : "🖥️ 16:9"}</span>
                        {it.size ? <span className="text-slate-500">{fmtSize(it.size)}</span> : null}
                      </div>
                      {it.error && <p className="mt-2 line-clamp-2 text-[10px] text-rose-300">{it.error}</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <button onClick={() => remove(it.id)} disabled={busy} className="flex-1 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50">🗑️ حذف</button>
                        {it.status === "merging" && (
                          <button onClick={async () => { try { await post({ action: "refresh", id: it.id }); await load(); } catch { /* مرة تانية */ } }} disabled={busy} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/20">🔄 تحديث</button>
                        )}
                        {it.src && <a href={it.src} download target="_blank" rel="noreferrer" onClick={() => { void fetch("/api/downloads", { method: "POST" }).catch(() => undefined); }} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20">⬇️ تنزيل</a>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <footer className="mt-8 border-t border-slate-600/50 py-5 text-center text-xs text-slate-500">
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · أُنشئت المكتبة: 2026-11-20</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/studio" className="text-cyan-300 hover:underline">الاستوديو</a>
            <a href="/game" className="text-cyan-300 hover:underline">ألغاز</a>
            <a href="/contact" className="text-cyan-300 hover:underline">اتصل بنا</a>
            <a href="/privacy" className="text-cyan-300 hover:underline">سياسة الخصوصية</a>
          </div>
        </footer>
      </div>
      <FloatingWhatsApp />
    </div>
  );
}
