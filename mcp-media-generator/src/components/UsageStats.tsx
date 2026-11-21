"use client";

// 📈 نبض كوكب الكرتون — رسم بياني حي للزوار + عدد التحميلات
// أرقام حقيقية 100% من /api/visits — لا يظهر شيء حتى تصل البيانات الحقيقية
import { useEffect, useState } from "react";

interface DayPoint {
  day: string;
  visits: number;
  downloads: number;
}
interface Stats {
  total: number;
  today: number;
  totalDownloads: number;
  days: DayPoint[];
}

// عدّاد يتصاعد بنعومة عند وصول القيمة (إحساس حي بدل رقم ثابت)
function useCountUp(target: number, dur = 1100): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

const shortDay = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

export default function UsageStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/visits")
      .then((r) => r.json())
      .then((d: Stats) => {
        if (Array.isArray(d?.days) && d.days.length) setStats(d);
      })
      .catch(() => undefined);
  }, []);

  // 🛡️ قواعد الخطافات: كل الخطافات تُستدعى دائمًا بنفس الترتيب في كل رندر —
  // قبل أي خروج مبكر، وإلا انهار الموقع كله لما تصل البيانات (React #310)
  const vTotal = useCountUp(stats?.total ?? 0);
  const vToday = useCountUp(stats?.today ?? 0);
  const vDownloads = useCountUp(stats?.totalDownloads ?? 0);

  if (!stats) return null;

  const days = stats.days;
  const max = Math.max(1, ...days.map((d) => d.visits));

  // هندسة الرسم — SVG خفيف بدون أي مكتبة خارجية
  const W = 560, H = 190, PAD = 14, GAP = 9;
  const n = days.length;
  const barW = (W - PAD * 2 - GAP * (n - 1)) / n;
  const baseY = H - 26;

  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-14 pt-2">
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/25 bg-gradient-to-br from-slate-900/80 via-slate-950/90 to-black/80 p-6 shadow-2xl md:p-8">
        <div className="pointer-events-none absolute -top-24 right-1/4 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-black text-amber-200 md:text-2xl">
            📈 نبض كوكب الكرتون — بالأرقام الحقيقية
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
          </h2>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300">آخر 14 يومًا — يتحدث لحظيًا</span>
        </div>

        <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_240px]">
          {/* الرسم البياني */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="رسم بياني للزوار والتحميلات آخر 14 يومًا">
              <defs>
                <linearGradient id="gVisits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.55" />
                </linearGradient>
                <linearGradient id="gVisitsTop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              {/* خطوط الشبكة */}
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1={PAD} x2={W - PAD} y1={baseY - (baseY - 16) * f} y2={baseY - (baseY - 16) * f} stroke="#ffffff14" strokeDasharray="3 5" />
              ))}
              <line x1={PAD} x2={W - PAD} y1={baseY} y2={baseY} stroke="#ffffff33" />
              {days.map((d, i) => {
                const x = PAD + i * (barW + GAP);
                const h = d.visits > 0 ? Math.max(6, (baseY - 16) * (d.visits / max)) : 0;
                const y = baseY - h;
                const dl = d.downloads > 0;
                const isHover = hover === i;
                return (
                  <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                    <rect x={x} y={12} width={barW} height={baseY - 12} fill="transparent" />
                    {h > 0 && (
                      <rect x={x} y={y} width={barW} height={h} rx={5} fill="url(#gVisits)" opacity={isHover ? 1 : 0.9}>
                        <animate attributeName="opacity" from="0" to={isHover ? 1 : 0.9} dur="0.5s" fill="freeze" />
                      </rect>
                    )}
                    {h > 0 && <rect x={x} y={y} width={barW} height={3.5} rx={1.75} fill="url(#gVisitsTop)" />}
                    {dl && <circle cx={x + barW / 2} cy={baseY - h - 7} r={3.5} fill="#22d3ee" stroke="#0e7490" />}
                    <text x={x + barW / 2} y={H - 9} textAnchor="middle" fontSize={9} fill={i === n - 1 ? "#fbbf24" : "#64748b"} fontWeight={i === n - 1 ? "bold" : "normal"}>
                      {shortDay(d.day)}
                    </text>
                    {isHover && (
                      <text x={x + barW / 2} y={Math.max(11, y - 10)} textAnchor="middle" fontSize={10} fill="#fde68a" fontWeight="bold">
                        {d.visits} زيارة{d.downloads ? ` · ${d.downloads} تحميل` : ""}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-b from-amber-300 to-amber-600" /> الزوار يوميًا</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" /> التحميلات</span>
            </div>
          </div>

          {/* العدّادات — بجوار الرسم مباشرة */}
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <p className="text-3xl font-black tabular-nums text-amber-200">👁️ {vTotal.toLocaleString("ar-EG")}</p>
              <p className="mt-1 text-[11px] font-bold text-amber-100/80">إجمالي الزوار</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <p className="text-3xl font-black tabular-nums text-emerald-300">⚡ {vToday.toLocaleString("ar-EG")}</p>
              <p className="mt-1 text-[11px] font-bold text-emerald-100/80">زوار اليوم</p>
            </div>
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-center">
              <p className="text-3xl font-black tabular-nums text-cyan-300">⬇️ {vDownloads.toLocaleString("ar-EG")}</p>
              <p className="mt-1 text-[11px] font-bold text-cyan-100/80">عدد التحميلات</p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-500">كل رقم هنا حقيقي من سجل الموقع — كل زيارة وتحميل يُحتسب لحظيًا. زوّر أصدقائك وشاهد النبض يتحرك 🚀</p>
      </div>
    </section>
  );
}
