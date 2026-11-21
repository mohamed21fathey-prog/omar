"use client";

// 🎮 لعبة ألغاز كوكب الكرتون — 15 لغز عربي عائلي، كل جولة 10 أسئلة عشوائية
// نقاط + سلسلة إجابات صحيحة + نجوم في النهاية + إعادة اللعب بترتيب جديد
import { useEffect, useMemo, useState } from "react";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import ThemeToggle from "@/components/ThemeToggle";

// 🔊 أصوات تفاعلية مولّدة برمجيًا (Web Audio — بدون أي ملفات) + قراءة عربية بمحرك المتصفح
let audioCtx: AudioContext | null = null;
function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.18, delay = 0) {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx || new Ctor();
    void audioCtx.resume();
    const t0 = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur);
  } catch {
    /* الصوت اختياري — لا يعطل اللعب */
  }
}
const sfx = {
  click: () => tone(520, 0.08, "triangle", 0.12),
  correct: () => {
    tone(523, 0.14);
    tone(784, 0.2, "sine", 0.18, 0.1);
  },
  wrong: () => tone(180, 0.28, "sawtooth", 0.1),
  streak: () => {
    tone(660, 0.1);
    tone(880, 0.14, "sine", 0.14, 0.08);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, "sine", 0.16, i * 0.13)),
};
// 🗣️ قراءة عربية للسؤال والنتيجة — يستخدم أصوات المتصفح العربية عند توفرها
function speakAr(text: string) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-EG";
    u.rate = 0.95;
    const ar = window.speechSynthesis.getVoices().find((v) => (v.lang || "").toLowerCase().startsWith("ar"));
    if (ar) u.voice = ar;
    window.speechSynthesis.speak(u);
  } catch {
    /* القراءة اختيارية */
  }
}
function stopSpeak() {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

interface Riddle {
  q: string;
  options: string[];
  answer: string; // يجب أن يكون موجودًا داخل options
  hint: string;
}

// 15 لغزًا كلاسيكيًا مؤكد الإجابة — عائلي آمن وممتع للصغار والكبار
const RIDDLES: Riddle[] = [
  { q: "شيء له أسنان كثيرة لكنه لا يعض أبدًا، ما هو؟", options: ["المشط", "التمساح", "المنشار", "الشوكة"], answer: "المشط", hint: "نستخدمه يوميًا لترتيب الشعر 🪮" },
  { q: "يكتب ولا يقرأ أبدًا، فمن يكون؟", options: ["الطالب", "القلم", "الكاتب", "الورق"], answer: "القلم", hint: "نمسكه بأصابعنا عند الكتابة ✏️" },
  { q: "له عين واحدة لكنه لا يرى بها، ما هو؟", options: ["الإبرة", "القط", "المجهر", "الكاميرا"], answer: "الإبرة", hint: "تنخال فيها الخيط للخياطة 🪡" },
  { q: "تمشي بلا أرجل وتدمع بلا عيون، فمن تكون؟", options: ["السحابة", "الحلزون", "الساعة", "النهر"], answer: "السحابة", hint: "في السماء وعندما تمطر كأنها تبكي ☁️" },
  { q: "شيء إذا وقع في الماء لم يبتل أبدًا، ما هو؟", options: ["الظل", "الورق", "القطن", "الحجر"], answer: "الظل", hint: "يتبعنا في المشمس ويختفي في المظلم 🌚" },
  { q: "حرف واحد يقيم في وسط كلمة «باريس» فمن هو؟", options: ["حرف الراء", "حرف الباء", "حرف السين", "حرف الياء"], answer: "حرف الراء", hint: "انظر إلى وسط الكلمة: با-ر-يس 🔤" },
  { q: "هي أخت خالك لكنها ليست خالتك، فمن هي؟", options: ["أمي", "عمتي", "جدتي", "أختي"], answer: "أمي", hint: "أخت والدتك هي أمك نفسها 👩‍👦" },
  { q: "ما هو الشيء الذي كلما أخذت منه زاد وكبر؟", options: ["الحفرة", "الكعكة", "المال", "العجين"], answer: "الحفرة", hint: "كل حبة تُخلع منها تجعلها أعمق ⛏️" },
  { q: "له أوراق كثيرة لكنه ليس نباتًا، ما هو؟", options: ["الكتاب", "الشجرة", "الزهرة", "الدفتر المهمل"], answer: "الكتاب", hint: "نقرأ صفحاته كل ليلة 📖" },
  { q: "يسمع بلا أذن ويتكلم بلا لسان، فمن يكون؟", options: ["الهاتف", "الصوت", "الراديو الخالد", "القطة"], answer: "الهاتف", hint: "في جيبك ويوصل صوت أحبابك عن بُعد 📱" },
  { q: "أخوان: واحد كبير وواحد صغير، وبينهما ميل، فمن هما؟", options: ["عود الثقاب", "الدرج", "الجسر", "المسطرة"], answer: "عود الثقاب", hint: "رأسهما أحمر ويولّدان النار 🔥" },
  { q: "تحمل على ظهرها كل يوم وهي ليست حاملًا، فمن هي؟", options: ["البطة", "السلحفاة", "الجمل", "النملة"], answer: "البطة", hint: "بيضها يولد جاهزًا على ظهرها 🦆" },
  { q: "ما هو الشيء الذي يرتفع دائمًا ولا ينزل أبدًا؟", options: ["العمر", "الشمس", "البالون", "الطائرة"], answer: "العمر", hint: "يزيد كل عام وهنت 🎂" },
  { q: "رأسه مال وريحه طيبة جدًا، فما هو؟", options: ["النعناع", "الكوكيز", "الريحة العطرية", "الموز"], answer: "النعناع", hint: "نحضره في الشاي في رمضان 🌿" },
  { q: "لا يمشي ولا يجري لكنه يسقي الأرض كلها، فما هو؟", options: ["المطر", "السحاب", "الهواء", "الريح"], answer: "المطر", hint: "ينزل من السماء في الشتاء 🌧️" },
];

const ROUND_SIZE = 10;
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

interface Q {
  riddle: Riddle;
  options: string[];
}

export default function GamePage() {
  const [stage, setStage] = useState<"start" | "play" | "end">("start");
  const [round, setRound] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [soundOn, setSoundOn] = useState(true);

  // استرجاع تفضيل الصوت + تنظيف القراءة عند الخروج
  useEffect(() => {
    try {
      const saved = localStorage.getItem("game_sound");
      if (saved === "off") setSoundOn(false);
    } catch {}
    return () => stopSpeak();
  }, []);

  const snd = (fn: () => void) => {
    if (soundOn) fn();
  };
  const say = (text: string) => {
    if (soundOn) speakAr(text);
  };

  // قراءة السؤال الجديد بصوت عربي عند تغيّر السؤال
  useEffect(() => {
    if (stage === "play" && round[idx]) say(round[idx].riddle.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, stage]);

  const toggleSound = () => {
    setSoundOn((on) => {
      const nextOn = !on;
      try {
        localStorage.setItem("game_sound", nextOn ? "on" : "off");
      } catch {}
      if (!nextOn) stopSpeak();
      else snd(sfx.click);
      return nextOn;
    });
  };

  const startRound = () => {
    const chosen = shuffle(RIDDLES).slice(0, ROUND_SIZE);
    setRound(chosen.map((r) => ({ riddle: r, options: shuffle(r.options) })));
    setIdx(0);
    setPicked(null);
    setScore(0);
    setStreak(0);
    setCorrectCount(0);
    setStage("play");
    snd(sfx.click);
  };

  const stars = useMemo(() => {
    const pct = correctCount / ROUND_SIZE;
    if (pct >= 0.9) return "⭐⭐⭐";
    if (pct >= 0.7) return "⭐⭐";
    if (pct >= 0.5) return "⭐";
    return "🌟";
  }, [correctCount]);

  const pick = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    if (opt === round[idx].riddle.answer) {
      const bonus = Math.min(streak, 3) * 2; // بونص السلسلة حتى +6
      setScore((s) => s + 10 + bonus);
      const ns = streak + 1;
      setStreak(ns);
      setCorrectCount((c) => c + 1);
      snd(sfx.correct);
      if (ns >= 2) snd(sfx.streak);
      say("أحسنت! إجابة صحيحة");
    } else {
      setStreak(0);
      snd(sfx.wrong);
      say(`الإجابة الصحيحة هي: ${round[idx].riddle.answer}`);
    }
  };

  const next = () => {
    snd(sfx.click);
    if (idx + 1 >= round.length) {
      setBest((b) => Math.max(b, score));
      setStage("end");
      snd(sfx.win);
      say(
        correctCount >= 9
          ? `ممتاز! أجبت على ${correctCount} من ${round.length}. أنت بطل ألغاز كوكب الكرتون`
          : `انتهت الجولة. أجبت على ${correctCount} من ${round.length}، ومجموع نقاطك ${score} نقطة`
      );
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  };

  const current = round[idx];

  return (
    <div dir="rtl" className="lux min-h-screen p-4 text-slate-200 md:p-8">
      <div className="relative mx-auto max-w-2xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-amber-200">🎮 ألغاز كوكب الكرتون</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              title={soundOn ? "إيقاف الأصوات والقراءة" : "تشغيل الأصوات والقراءة"}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
            <ThemeToggle />
            <a href="/" className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">← الرئيسية</a>
          </div>
        </header>

        {stage === "start" && (
          <div className="rounded-3xl border border-amber-400/30 bg-white/5 p-8 text-center shadow-xl">
            <p className="text-6xl">🧩</p>
            <h2 className="mt-3 text-xl font-black text-amber-200">جاهز تستخبر عقلك؟</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-300">
              {RIDDLES.length} لغزًا عربيًا عائليًا — كل جولة فيها {ROUND_SIZE} ألغاز عشوائية. كل إجابة صحيحة = 10 نقاط،
              والإجابات الصحيحة المتتالية تجيب لك بونص إضافي 🔥. صغار وكبار يلعبوا مع بعض وشوف مين الأذكى!
            </p>
            <button onClick={startRound} className="btn-gold mt-6 px-8 py-3 text-base">🚀 ابدأ اللعب</button>
            {best > 0 && <p className="mt-4 text-xs font-bold text-cyan-300">🏆 أفضل نتيجة لك: {best} نقطة</p>}
          </div>
        )}

        {stage === "play" && current && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between text-xs font-bold">
              <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-cyan-300">السؤال {idx + 1} من {round.length}</span>
              <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-300">💰 {score} نقطة</span>
              {streak >= 2 && <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-fuchsia-300">🔥 سلسلة {streak}</span>}
            </div>
            {/* شريط التقدم */}
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 transition-all duration-500" style={{ width: `${((idx + (picked ? 1 : 0)) / round.length) * 100}%` }} />
            </div>
            <h2 className="text-lg font-black leading-relaxed text-slate-100 md:text-xl">{current.riddle.q}</h2>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {current.options.map((opt) => {
                const isAnswer = opt === current.riddle.answer;
                const chosen = picked === opt;
                let cls = "border-white/10 bg-white/5 text-slate-200 hover:border-amber-400/50 hover:bg-amber-500/10";
                if (picked) {
                  if (isAnswer) cls = "border-green-400/60 bg-green-500/20 text-green-200";
                  else if (chosen) cls = "border-rose-400/60 bg-rose-500/20 text-rose-200";
                  else cls = "border-white/10 bg-white/5 text-slate-400 opacity-60";
                }
                return (
                  <button key={opt} onClick={() => pick(opt)} disabled={Boolean(picked)}
                    className={`rounded-2xl border px-4 py-3 text-right text-sm font-bold transition-all ${cls}`}>
                    {isAnswer && picked ? "✅ " : chosen ? "❌ " : "• "}{opt}
                  </button>
                );
              })}
            </div>
            {picked && (
              <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm leading-relaxed text-cyan-200">
                {picked === current.riddle.answer ? "🎉 أحسنت! إجابة صحيحة" : `💪 الإجابة الصحيحة: ${current.riddle.answer}`} — {current.riddle.hint}
                <button onClick={next} className="btn-gold mt-3 block w-full px-6 py-2.5 text-sm">
                  {idx + 1 >= round.length ? "🏁 شوف نتيجتك" : "السؤال التالي ←"}
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "end" && (
          <div className="rounded-3xl border border-amber-400/30 bg-white/5 p-8 text-center shadow-xl">
            <p className="text-6xl">{correctCount >= 7 ? "🏆" : correctCount >= 5 ? "🎉" : "🌱"}</p>
            <h2 className="mt-3 text-2xl font-black text-amber-200">{stars} انتهت الجولة!</h2>
            <p className="mt-4 text-lg font-bold text-slate-200">إجابات صحيحة: {correctCount} من {round.length}</p>
            <p className="mt-1 text-lg font-black text-cyan-300">مجموع نقاطك: {score} نقطة</p>
            <p className="mt-3 text-xs text-slate-400">
              {correctCount >= 9 ? "عقل خارق! أنت بطل ألغاز كوكب الكرتون 👑" : correctCount >= 6 ? "ممتاز جدًا! جولة تانية وتكمل استηνك 💪" : "حلو! جرب تاني وهتوصل أعلى 🚀"}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button onClick={startRound} className="btn-gold px-7 py-3 text-base">🔄 جولة جديدة بألغاز مختلفة</button>
              <a href="/" className="rounded-full border-2 border-amber-500/50 bg-black/50 px-7 py-3 text-base font-extrabold text-amber-300 hover:scale-105 transition">← العودة للرئيسية</a>
            </div>
          </div>
        )}

        <footer className="mt-8 border-t border-slate-600/50 py-5 text-center text-xs text-slate-500">
          <p>كوكب الكرتون — مشروع محتوى كرتوني عائلي 🪐 · أُنشئت اللعبة: 2026-11-20</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/library" className="text-cyan-300 hover:underline">مكتبة الفيديو</a>
            <a href="/about" className="text-cyan-300 hover:underline">من نحن</a>
            <a href="/contact" className="text-cyan-300 hover:underline">اتصل بنا</a>
            <a href="/privacy" className="text-cyan-300 hover:underline">سياسة الخصوصية</a>
          </div>
        </footer>
      </div>
      <FloatingWhatsApp />
    </div>
  );
}
