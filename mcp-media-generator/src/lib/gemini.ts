// ============================================================
// تكامل Gemini API — النصوص الذكية المجانية (سيناريوهات + حزم النشر)
// المفتاح: GEMINI_API_KEY (من Google AI Studio) — الطبقة المجانية
// ملاحظة: النداء يتم من سيرفر Vercel (منطقة مدعومة) وليس من جهاز المستخدم
// ============================================================

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function geminiText(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY غير مضبوط");
  // سلسلة تدوير: lite أخف وأسرع أولًا ثم الأساسي — موديلات جيل 3.x (الوحيدة المتاحة للمفاتيح الجديدة)
  const chain = [...new Set([
    process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
  ])];
  let lastError = "فشل اتصال Gemini";
  for (const model of chain) {
    try {
      return await geminiTextOne(key, model, prompt, maxTokens);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // الضغط المؤقت/التشبع/موديل غير متاح → جرّب التالي؛ أخطاء المفتاح والمعطيات → فشل فورًا
      if (!/high demand|overload|unavailable|no longer available|deprecat|429|500|503|quota|timeout|aborted/i.test(lastError)) throw e;
    }
  }
  throw new Error(lastError);
}

async function geminiTextOne(
  key: string,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  // موديلات 2.5 فقط: تعطيل التفكير بـthinkingBudget — موديلات 3.x لا نرسل شيئًا (إرسال thinkingBudget لها يسبب تعليقًا)
  const thinking = /gemini-2\.5/.test(model);
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: maxTokens,
      ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000), // مهلة لكل محاولة — سلسلتان × 25 ثانية تحت حد الدالة 60
  });
  const j = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!res.ok) {
    throw new Error(`فشل اتصال Gemini (${model}): ${j.error?.message || `HTTP ${res.status}`}`);
  }
  const text = (j.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error(`Gemini (${model}) رجّع ردًا فارغًا`);
  return text;
}

// استخراج قيمة بعد علامة معروفة (TITLE: ...) — العلامة في بداية سطر، ونأخذ آخر تطابق
// (لأن موديلات التفكير قد تذكر العلامات في شرحها الداخلي قبل الإجابة النهائية)
function pickLabeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*[A-Z_]+\\s*[:：]|$)`,
      "gi"
    );
    let m: RegExpExecArray | null;
    let last: string | null = null;
    while ((m = re.exec(text)) !== null) {
      const v = m[1]?.trim();
      if (v) last = v;
    }
    if (last) return last;
  }
  return null;
}

export interface AiEpisode {
  title: string;
  script: string;
  kit: {
    youtube_title: string;
    youtube_description: string;
    hashtags: string;
    source: "gemini";
  };
}

// حلقة كاملة من فكرة واحدة — نداء واحد يرجّع السيناريو + حزمة النشر معًا (أسرع وأرخص)
export async function generateEpisodeFullAi(topic: string): Promise<AiEpisode> {
  const text = await geminiText(
    `أنت كاتب سيناريوهات ومدير قناة كرتون عائلي مصري محترف لقناة «كوكب الكرتون».
اكتب حلقة قصيرة جدًا (فيديو 8 ثوانٍ) عن الفكرة: «${topic}»

أجب بالتنسيق ده وبالظبط — كل عنصر في سطر منفصل يبدأ بعلامته، بدون أي مقدمة أو شرح أو تفكير ظاهر:
TITLE: عنوان الحلقة بالعربي — قصير وجاذب لجميع أفراد الأسرة، بدون علامات تنصيص
SCRIPT: وصف مشهد واحد متصل مكتوب كبرومبت توليد فيديو — غني بالتفاصيل البصرية (الشخصية وعمرها وملابسها، المكان، الحركة، الإضاءة، الألوان) ويذكر أسلوب "كرتون ثلاثي الأبعاد مشرق مناسب لجميع أفراد الأسرة". بدون حوارات وبدون تقسيم مشاهد. المحتوى عائلي آمن ومناسب لجميع أفراد العائلة — بدون أي عنف أو مخيف أو كلام غير لائق. أنهِ البرومبت دائمًا بسطر صوتي بهذا الشكل حرفيًا: «التعليق الصوتي: الراوي ينطق بالعربية الفصحى هذه الجملة: <اكتب جملة عربية قصيرة من أجواء المشهد نفسه>» — الجملة لازم تكون عربية فصحى حقيقية ذات معنى، لا كلام أجنبي ولا لغة أخرى. واكتب المشهد بحدث وتكوين بصري جديد كليًا — ممنوع نسخ أو تكرار أي مشهد سبق وصفه في حلقة أخرى.
YOUTUBE_TITLE: عنوان يوتيوب جاذب حتى 90 حرفًا بالعربي مناسب لجميع أفراد الأسرة — ممكن يختلف عن TITLE بلمسة تشويق
YOUTUBE_DESCRIPTION: وصف من 2-3 أسطر — سطر عن القصة، سطر دعوة للاشتراك وتفعيل الجرس
HASHTAGS: من 8 إلى 12 هاشتاق مفصولة بمسافات — أولها #قصص_عائلية وبينها #shorts وهاشتاق عن فكرة الحلقة، بالعربي والإنجليزي`,
    1200
  );
  const title = pickLabeled(text, ["TITLE"]);
  const script = pickLabeled(text, ["SCRIPT"]);
  const yt = pickLabeled(text, ["YOUTUBE_TITLE"]);
  const desc = pickLabeled(text, ["YOUTUBE_DESCRIPTION"]);
  const tags = pickLabeled(text, ["HASHTAGS"]);
  if (!title || !script) throw new Error("تعذر قراءة السيناريو من رد Gemini");
  const fallbackKit = (src: "gemini") => ({
    youtube_title: yt || title,
    youtube_description: desc || `${script.slice(0, 160)}\n\n🌟 قصة ممتعة من كوكب الكرتون — اشترك وفعّل الجرس!`,
    hashtags: tags || "#قصص_عائلية #كوكب_الكرتون #كرتون_عربي #cartoon #shorts",
    source: src,
  });
  return { title: title.slice(0, 120), script: script.slice(0, 2000), kit: fallbackKit("gemini") };
}

// قصة كاملة من فكرة واحدة — بداية ووسط ونهاية جاهزة للتقسيم لمشاهد حلقة متكاملة
// + عناصر حزمة النشر (عنوان يوتيوب + وصف + هاشتاجات) تُكتب مع القصة في نداء واحد
export async function generateStoryFromIdea(
  idea: string,
  scenes: number
): Promise<{ title: string; story: string; yt_title: string; description: string; hashtags: string }> {
  const text = await geminiText(
    `أنت كاتب قصص كرتون عائلي مصري محترف لقناة «كوكب الكرتون».
اكتب قصة كاملة متكاملة عن الفكرة: «${idea}»
القصة لازم يكون ليها بداية مشوقة ووسط فيه حادثة أو مشكلة بسيطة ونهاية سعيدة ومرضية — مناسبة للتقسيم إلى ${scenes} مشهد فيديو كرتوني (كل مشهد 8 ثوانٍ).
كل مشهد لازم يكون حدثًا مختلفًا تمامًا — ممنوع تكرار نفس الحدث أو نفس المكان مرتين، ونوّع الأماكن والحركة والتفاصيل من مشهد لآخر عشان الفيديو النهائي ما يكونش فيه أي لقطة متكررة.

أجب بالتنسيق ده وبالظبط — كل عنصر في سطر منفصل يبدأ بعلامته، بدون أي مقدمة أو شرح أو تفكير ظاهر:
TITLE: عنوان الحلقة بالعربي — قصير وجاذب لجميع أفراد الأسرة بدون علامات تنصيص
STORY: القصة كاملة من البداية للنهاية — سرد متصل بسيط يصلح للتقسيم إلى ${scenes} مشاهد بالترتيب، بدون عناوين أو أرقام مشاهد، والبطل «عمر» شخصية كرتونية شابة بنفس شكلها في كل مشهد. المحتوى عائلي آمن ومناسب لجميع أفراد العائلة — بدون أي عنف أو مشاهد مخيفة.
YOUTUBE_TITLE: عنوان يوتيوب جاذب حتى 90 حرفًا بالعربي مع لمسة تشويق
YOUTUBE_DESCRIPTION: وصف من 2-3 أسطر — سطر عن القصة وسطران دعوة للاشتراك وتفعيل الجرس
HASHTAGS: من 8 إلى 12 هاشتاق مفصولة بمسافات — أولها #قصص_عائلية وبينها #shorts وهاشتاق عن الفكرة، بالعربي والإنجليزي`,
    2000
  );
  const title = pickLabeled(text, ["TITLE"]);
  const story = pickLabeled(text, ["STORY"]);
  if (!title || !story) throw new Error("تعذر قراءة القصة من رد Gemini — حاول تاني");
  return {
    title: title.slice(0, 120),
    story: story.slice(0, 2900),
    yt_title: (pickLabeled(text, ["YOUTUBE_TITLE"]) || "").slice(0, 90),
    description: (pickLabeled(text, ["YOUTUBE_DESCRIPTION"]) || "").slice(0, 900),
    hashtags: (pickLabeled(text, ["HASHTAGS"]) || "").slice(0, 400),
  };
}

export interface AiKit {
  youtube_title: string;
  youtube_description: string;
  hashtags: string;
  source: "gemini" | "template";
}

// حزمة نشر ذكية — بديل أفضل للنمط الثابت، مع رجوع آمن عند أي فشل
export async function generatePublishKitAi(
  title: string,
  script: string
): Promise<AiKit> {
  const text = await geminiText(
    `أنت مدير قناة كرتون عائلي ناجحة اسمها «كوكب الكرتون».
اكتب حزمة نشر احترافية لهذه الحلقة.

عنوان الحلقة: ${title}
السيناريو: ${script.slice(0, 800)}

أجب بالتنسيق ده بالظبط — كل عنصر في سطر منفصل يبدأ بعلامته:
YOUTUBE_TITLE: عنوان يوتيوب جاذب حتى 90 حرفًا بالعربي مناسب لجميع أفراد الأسرة
YOUTUBE_DESCRIPTION: وصف من 2-3 أسطر — سطر عن القصة، سطر دعوة للاشتراك وتفعيل الجرس
HASHTAGS: من 8 إلى 12 هاشتاق مفصولة بمسافات — أولها #قصص_عائلية وبينها #shorts وهاشتاق عن فكرة الحلقة، بالعربي والإنجليزي`,
    600
  );
  const yt = pickLabeled(text, ["YOUTUBE_TITLE"]);
  const desc = pickLabeled(text, ["YOUTUBE_DESCRIPTION"]);
  const tags = pickLabeled(text, ["HASHTAGS"]);
  if (!yt || !desc || !tags) throw new Error("تعذر قراءة حزمة النشر من رد Gemini");
  return {
    youtube_title: yt.slice(0, 100),
    youtube_description: desc.slice(0, 900),
    hashtags: tags.split(/\s+/).filter(Boolean).slice(0, 12).join(" "),
    source: "gemini",
  };
}

// ============================================================
// مساعد الشات الذكي — يجيب أسئلة الزبائن عن الموقع
// ============================================================
export interface ChatTurn {
  role: "user" | "bot";
  text: string;
}

const SITE_CONTEXT = `أنت "مساعد كوكب 🤖" — مساعد موقع «كوكب الكرتون» — مصنع حلقات كرتون عائلي بالذكاء الاصطناعي من مصر.
معلومات الموقع الرسمية (اعتمد عليها فقط ولا تخترع أي شيء آخر):
- الباقات بالجنيه المصري: 1000 كريدت = 50 جنيه • 2000 كريدت = 100 جنيه • 4000 كريدت = 200 جنيه — وكل مشهد فيديو 8 ثوانٍ = 15 كريدت بالظبط
- طرق الدفع: فودافون كاش وإنستاباي فقط — من صفحة «شحن الرصيد»: حوّل المبلغ وسجّل طلبك بإثبات التحويل وهيتشحن حسابك سريعًا
- إزاي تطلب حلقة: اشحن رصيد → افتح «الاستوديو» → اكتب فكرة الحلقة وشخصيات عيلتك → الموقع يبني القصة والمشاهد ويجمعها حلقة كاملة (كل مشهد 8 ثوانٍ)
- قسم «كتب التلوين»: كتب PDF جاهزة للتحميل والطباعة بجودة كاملة (تنزيل مباشر من صفحة كل كتاب)
- قسم «أحدث الحلقات»: نماذج جاهزة تشوفها قبل ما تدفع
- التسجيل مجاني من صفحة «الحساب» بإيميل وباسورد
- المحتوى آمن ومناسب لجميع أفراد العائلة
- للتواصل المباشر: زر «اسألنا على واتساب» أسفل يمين الصفحة — رد سريع
لو السؤال خارج نطاق الموقع أو تقني إداري (مفاتيح/قواعد بيانات/لوحة تحكم) — اعتذر بلطف وارجع لخدمات الموقع.`;

export async function chatAnswer(question: string, history: ChatTurn[]): Promise<string> {
  const hist = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "الزائر" : "المساعد"}: ${t.text}`)
    .join("\n");
  const prompt = `${SITE_CONTEXT}

${hist ? `سياق المحادثة السابقة:\n${hist}\n\n` : ""}سؤال الزائر: ${question}

اكتب الرد بصفتك مساعد الموقع: مصري بسيط وودود، 3 أسطر كحد أقصى، بدون نجوم أو رموز تنسيق.`;
  return geminiText(prompt, 350);
}

// تقسيم قصة كاملة إلى مشاهد متسلسلة (كل مشهد = برومبت فيديو 8 ثوانٍ)
// وصف الشخصية يتكرر حرفيًا في كل مشهد لتثبيت شكل الشخصية بين المشاهد
export async function splitStoryIntoScenes(story: string, count: number): Promise<string[]> {
  const text = await geminiText(
    `أنت كاتب سيناريوهات كرتون عائلي مصري محترف لقناة «كوكب الكرتون» — متخصص في قصص الفيرال اللي بتجيب مشاهدات وساعات مشاهدة عالية على يوتيوب وفيسبوك.
اقرأ القصة دي واقسمها إلى ${count} مشاهد متسلسلة تحكي القصة كاملة بالترتيب (كل مشهد فيديو 8 ثوانٍ).

قواعد مهمة جدًا:
- افتتح كل مشهد بوصف ثابت للشخصية الرئيسية بنفس الكلمات حرفيًا في كل المشاهد (الاسم، العمر، الملابس، الملامح) عشان شكل الشخصية يفضل ثابت بين المشاهد
- كل مشهد = مشهد بصري واحد متصل يصلح كبرومبت توليد فيديو، بدون حوارات وبدون تقسيم داخلي
- اذكر أسلوب "كرتون ثلاثي الأبعاد مشرق مناسب لجميع أفراد الأسرة" في كل مشهد
- أنهِ كل مشهد بسطر صوتي بهذا الشكل حرفيًا: «التعليق الصوتي: الراوي ينطق بالعربية الفصحى هذه الجملة: <جملة عربية فصحى قصيرة من أجواء المشهد نفسه>» — عربي حقيقي ذو معنى، لا كلام أجنبي ولا لغة أخرى، وسطر آخر: «مشهد جديد مختلف تمامًا عن أي مشهد سابق — ممنوع تكرار نفس اللقطة أو نفس الحدث»
- المحتوى عائلي آمن ومناسب لجميع أفراد العائلة (صغار وكبار) — بدون عنف أو مشاهد مخيفة أو أي شيء غير لائق

قواعد الفيرال والاحتفاظ بالمشاهد (إجبارية — دي اللي بتخلي الفيديو يتصدر):
- المشهد الأول لازم يبدأ بهوك قوي يمسك المشاهد من أول ثانيتين: حدث مفاجئ، لقطة لافتة، أو سؤال مشوق — مش مطلع بطيء
- كل مشهد (ما عدا الأخير) ينتهي بتشويق/كليفهانجر بصري يخلّي المشاهد مستني المشهد اللي بعده — ده اللي بيرفع ساعات المشاهدة
- المشهد الأخير: نهاية مرضية + لقطة ختامية لطيفة تشجع إعادة المشاهدة، وسطر دعوة بسيط للمتابعة أو المشاركة
- استخدم أفعال حركة بصرية قوية (اندفع، قفز، انكشف، لمع، طار) عشان الإيقاع يفضل سريع ويقاوم الملل

القصة: ${story}

أجب بالتنسيق ده بالظبط — كل مشهد في سطر منفصل يبدأ بعلامته، بدون أي مقدمة أو شرح:
SCENE_1: وصف المشهد الأول
SCENE_2: وصف المشهد الثاني
(وهكذا حتى SCENE_${count})`,
    1800
  );
  const re = /(?:^|\n)\s*SCENE_(\d+)\s*[:：]\s*([\s\S]*?)(?=\n\s*SCENE_\d+\s*[:：]|$)/gi;
  const out: Array<{ n: number; t: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[2]?.trim();
    if (t) out.push({ n: parseInt(m[1], 10), t });
  }
  if (out.length < 1) throw new Error("تعذر تقسيم القصة — جرّب صياغة أبسط أو زيّد التفاصيل");
  return out.sort((a, b) => a.n - b.n).slice(0, count).map((x) => x.t.slice(0, 1200));
}

// 📦 حزمة النشر الترندية — حزمة جاهزة للنشر على يوتيوب/فيسبوك مع كل حلقة:
// عناوين محسّنة للبحث + وصف بكلمات مفتاحية + هاشتاجات + تعليق مثبت + وقت النشر الأفضل + نص غلاف
// كل الحقول حقيقية مبنية على القصة نفسها — بدون أي أرقام مشاهدة مخترعة
export interface PublishKit {
  titles: string[];
  description: string;
  hashtags: string[];
  pinned_comment: string;
  best_post_time: string;
  thumbnail_text: string;
}

export async function generatePublishKit(title: string, story: string, section: string, sceneCount: number): Promise<PublishKit> {
  const text = await geminiText(
    `أنت خبير نشر محتوى فيرال لقنوات كرتون عائلية على يوتيوب وفيسبوك (شورتس وريلز) — بتحضر حزم نشر بتتصدر نتائج البحث وبتجيب ساعات مشاهدة.
جهّز حزمة نشر للحلقة دي من «كوكب الكرتون» (القسم: ${section}، عدد المشاهد: ${sceneCount}، كل مشهد 8 ثوانٍ).

الحلقة — العنوان: ${title}
القصة: ${story.slice(0, 1800)}

القواعد:
- العناوين: 5 عناوين مختلفة جذابة بالعربي المصري البسيط، كل واحد أقل من 60 حرف، فيه واحد على الأقل بسؤال وواحد برقم أو كلمة مفاجئة — محسّنة لكلمات بحث حقيقية (كرتون عائلي، قصص مصورة، مغامرات...) بدون كليك بيت عشوائي كاذب
- الوصف: 3-4 أسطر: أول سطر ملخص تشويقي، تاني سطر ماذا سيتعلم الصغار/ماذا سيعجب بقية العائلة، تالت سطر دعوة اشتراك وتفعيل الجرس — + سطر كلمات مفتاحية مفصولة بفواصل
- الهاشتاجات: 15 هاشتاج: أول 5 عامة رائجة (#قصص_كرتون #كرتون_عائلي...) والباقي نيش خاصة بالقسم — بدون تكرار
- التعليق المثبت: سؤال تفاعلي قصير يخلي الصغار والأهالي يردوا (بيرفع التفاعل والتصدر)
- وقت النشر الأفضل: نصيحة قصيرة مبنية على عادات المشاهدة المصرية/العربية للعائلة (الوقت الأنسب بالتوقيت المصري)
- نص الغلاف: 3-5 كلمات ضخمة تتحط على صورة الغلاف

أجب JSON فقط بدون أي شرح أو markdown، بالمفاتيح دي بالظبط:
{"titles":["عنوان1","عنوان2","عنوان3","عنوان4","عنوان5"],"description":"الوصف الكامل","hashtags":["#هاشتاج1",...15],"pinned_comment":"التعليق","best_post_time":"الوقت والسبب","thumbnail_text":"نص الغلاف"}`,
    1400
  );
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error("تعذر تجهيز حزمة النشر — جرّب تاني بعد شوية");
  const kit = JSON.parse(m[0]) as PublishKit;
  if (!Array.isArray(kit.titles) || !kit.titles.length) throw new Error("حزمة النشر ناقصة — جرّب تاني");
  kit.titles = kit.titles.slice(0, 5).map((t) => String(t).slice(0, 80));
  kit.hashtags = Array.isArray(kit.hashtags) ? kit.hashtags.slice(0, 18).map((h) => String(h).slice(0, 40)) : [];
  kit.description = String(kit.description || "").slice(0, 1200);
  kit.pinned_comment = String(kit.pinned_comment || "").slice(0, 300);
  kit.best_post_time = String(kit.best_post_time || "").slice(0, 200);
  kit.thumbnail_text = String(kit.thumbnail_text || "").slice(0, 60);
  return kit;
}
