# مولّد الوسائط MCP — Media Generator MCP

خادم MCP لتوليد الصور والفيديو بالذكاء الاصطناعي (kie.ai + CometAPI مع تبديل مفاتيح تسلسلي تلقائي) ودمج المقاطع، مع لوحة إدارة عربية RTL.

- **المسار:** `/mcp` — Streamable HTTP حسب مواصفات MCP (خمس أدوات، نتائجها بالعربية).
- **الواجهة:** `/` — مدير المفاتيح + لوحة المهام الحية + إعدادات الربط جاهزة للنسخ.
- **قاعدة ذهبية (الخادم الرئيسي):** لا يُنزَّل أي ملف وسائط على السيرفر الرئيسي — روابط النتائج فقط تُخزَّن في Turso.
  الاستثناء الوحيد هو **خدمة الدمج الشقيقة** (`../merger`): هي بالضرورة تنزّل المقاطع المصدر مؤقتًا إلى `/tmp` داخل الـ instance
  (حد 420MB) وتحفظ الناتج كصفوف Blobs في Turso ثم تنظف `/tmp` بعد كل مهمة — ولا تخزن أي شيء على قرص دائم.

## الأدوات الخمس

| الأداة | الوظيفة |
|---|---|
| `generate_image` | توليد صورة بـ `gpt-image-2-6/flare-text-to-image` |
| `generate_video` | توليد فيديو بـ `grok-imagine-video-1-5-preview` (صوت متزامن أصلي) |
| `merge_videos` | دمج 2–10 مقاطع بالترتيب — `urls` مباشرة أو `task_ids` لمهام مكتملة |
| `get_task` | تتبع أي مهمة (يحدّث من المزود/خدمة الدمج) — استعلام كل ~10 ثوانٍ |
| `list_media` | استرجاع الوسائط المخزنة سابقًا بروابطها |

## نظام المفاتيح المتسلسلة (القلب)

- التجربة **تسلسلية صارمة بترتيب الإضافة** (`created_at ASC, id ASC`) — ليست round-robin.
- التبديل فوري عند أي خطأ أو نفاد رصيد **دون توقف المهمة**: نفس المهمة تُستأنف بنفس `task_id` على المفتاح التالي.
- **نموذج الذكاء الاصطناعي لا يرى أخطاء المفاتيح/الرصيد أبدًا** — التبديل صامت من وجهة نظره.
- فشل على كل المفاتيح → المهمة تبقى `processing` وتُعاد تلقائيًا مع كل `get_task` (تهدئة ~45 ثانية).
- المفتاح المستنزف (`exhausted`) يبقى في القاعدة — الاستثناء الوحيد هو التعطيل اليدوي.
- المفاتيح **مقنّعة دائمًا** في كل الاستجابات (`ABCD123••••••••WXYZ`).

## التشغيل المحلي

```bash
# 0) خدمة الدمج (المشروع الشقيق ../merger) — منفذ 3001
cd ../merger && npm install && node server.js

# 1) هذا المشروع — منفذ 3000
npm install
cp .env.example .env.local   # واملأ القيم (انظر الجدول أدناه)
npm run build && npm start   # أو: npm run dev
```

- الواجهة: http://localhost:3000
- خادم MCP: http://localhost:3000/mcp

### متغيرات البيئة (`.env.local` — ممنوع رفعه إلى Git)

| المتغير | إلزامي | الوصف |
|---|---|---|
| `TURSO_DATABASE_URL` | ✅ | `libsql://<db>-<org>.turso.io` — محليًا يمكن `file:./db/local.db` للتجربة |
| `TURSO_AUTH_TOKEN` | ✅ | توكن Turso بصلاحيات كتابة (`turso db tokens create <name>`) |
| `MERGER_API_BASE` | ✅ | رابط خدمة الدمج — محليًا `http://localhost:3001` أو رابط Vercel بعد النشر |
| `MCP_ACCESS_TOKEN` | ✅ في الإنتاج | `Authorization: Bearer <token>` على `/mcp` و `/api/generate` — **بدونه في الإنتاج المسار يرد 503 مغلقًا** (لا افتراضية في الكود) |
| `ADMIN_PASSWORD` / `ADMIN_USERNAME` | ✅ في الإنتاج | بيانات Basic Auth للمسارات الإدارية — بدون افتراضيات في الإنتاج |
| `ADMIN_TOKEN` | مُستحسن | Bearer/كوكي لمسارات الإدارة API (`/api/keys`، `/api/tasks`، `/api/health`…) للسكربتات والمراقبة |
| `MERGER_API_TOKEN` | ✅ في الإنتاج | توكن Bearer مشترك مع خدمة الدمج (كلا الطرفين بنفس القيمة) |
| `MERGER_SIGNING_SECRET` | مُستحسن | سر توقيع روابط `/video` (HMAC + exp) — احتياطًا يُستخدم `MERGER_API_TOKEN` |
| `CRON_SECRET` | مُستحسن | Bearer لمسارات `/api/cron` (مجدول Vercel يُصادق بترويسة `x-vercel-cron`) |
| `KIE_IMAGE_MODEL` / `KIE_VIDEO_MODEL` / `COMETAPI_IMAGE_MODEL` / `COMETAPI_VIDEO_MODEL` | — | تجاوز أسماء الموديلات إن غيّرها المزودون |

> ملاحظة: مع مفتاح kie.ai حقيقي ستظهر الأشكال الموصوفة في التوثيق؛ مفاتيح خاطئة تُعطَّل تلقائيًا وتُسجَّل محاولاتها في `attempts_json` دون أي أثر على العميل.

## النشر على Vercel

1. ارفع المستودع إلى GitHub (تأكد أن `.env*` مستثنى — موجود في `.gitignore` منذ أول commit).
2. أنشئ قاعدة Turso مجانية:
   ```bash
   turso db create media-gen
   turso db show media-gen --url        # ← TURSO_DATABASE_URL
   turso db tokens create media-gen     # ← TURSO_AUTH_TOKEN
   ```
3. انشر خدمة الدمج (مجلد `../merger`) أولًا وانقل رابطها إلى `MERGER_API_BASE`.
4. Vercel → Import Project → Settings → Environment Variables: أضف `TURSO_DATABASE_URL` و `TURSO_AUTH_TOKEN` و `MERGER_API_BASE` (ورفض `MCP_ACCESS_TOKEN` إن أردت حماية).
5. Deploy — كل الاتصالات عبر HTTP (libSQL) فلا يعتمد المشروع على أي ملف محلي.
6. اختبار سريع بعد النشر: `GET https://<app>.vercel.app/api/health` **بـ `Authorization: Bearer <ADMIN_TOKEN>`** يجب أن يرجع `ok:true` و `database:"turso-connected"` و `merger.healthy:true` (بدون التوكن يرد 401 — المسار محمي).

## الربط بعملاء MCP

انظر بطاقة «ربط السيرفر» في الواجهة — تعرض JSON جاهزًا للنسخ لكل من:
- **ChatGPT:** Settings → Connectors → Create → Custom MCP server وضع `https://<app>/mcp` في Server URL.
- **Claude Desktop:** ملف `claude_desktop_config.json` بنفس الصيغة مع `"type": "http"`.
- **Cursor / Windsurf / Cline:** ملف `mcp.json` بنفس الصيغة.

## اختبارات

```bash
npx tsc --noEmit && npx next build   # البناء النظيف
# e2e كامل ضد الخادم الحي (يحتاج خادمي 3000/3001 يعملان):
node ../scripts/e2e-mcp.js
```

يغطي الـ e2e: التهيئة والأدوات والمخططات، ردود no_keys العربية، التبديل التسلسلي مع مفاتيح خاطئة (تعطيل تلقائي + عدّادات + إخفاء)، دمجًا حقيقيًا بروابط عامة مع Range 206، إشعارات التقدم، ورفض الدمج بأقل من مقطعين أو أكثر من 10 برسائل عربية.
