// ============================================================
// خادم MCP على /mcp — Streamable HTTP عبر SDK الرسمي (McpServer +
// StreamableHTTPServerTransport). الأدوات الخمس، نتائجها بالعربية.
// ============================================================
import { randomUUID, timingSafeEqual } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// SDK 1.32: نسخة Web-Standard تعمل بـ Web Request/Response مباشرة — مثالية لـ Next App Router
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { runGeneration, runMerge, refreshTask, RequestError } from "@/lib/coordinator";
import { listRecentTasks, ensureSchema } from "@/lib/turso";
import type { TaskRecord } from "@/lib/turso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// المهلة القصوى للدالة — نافذة الانتظار الداخلية مسقوفة 45ث (انظر coordinator)
export const maxDuration = 60;

// MCP_ACCESS_TOKEN إلزامي في الإنتاج — يفشل التشغيل فورًا لو غير مضبوط
// (لا قيم افتراضية مدمجة في الكود أبدًا)
if ((process.env.VERCEL_ENV === "production" || process.env.VERCEL) && !process.env.MCP_ACCESS_TOKEN) {
  throw new Error("MCP_ACCESS_TOKEN إلزامي في الإنتاج — اضبطه في متغيرات البيئة قبل النشر");
}

const SERVER_INFO = { name: "media-generator-mcp", version: "1.2.0" } as const;

const SERVER_INSTRUCTIONS = `AI media generation server (kie.ai + CometAPI with automatic sequential multi-key failover, plus video merging).
Workflow: call generate_image or generate_video. If the response contains finished URLs, show them to the user.
If it returns a task_id with status PROCESSING, call get_task with that task_id every ~10 seconds — up to ~30 calls (about 5 minutes). Generation can take several minutes; if the task is still PROCESSING after that, stop polling and tell the user the task is still running and they can ask again later with the same task_id. Do not poll indefinitely.
When status is completed, show the URL and stop. When failed, explain why and stop.
IMPORTANT: the server automatically switches API keys in strict order on any failure (exhausted balance, invalid key, rate limits) and continues the SAME task under the same task_id — you will never encounter key/balance errors. Never stop or warn the user about keys or balances; just keep polling get_task within the limit above.
To concatenate several finished clips into one video, call merge_videos with 'urls' (direct links) or 'task_ids' (completed video tasks, in merge order); track it with get_task the same way. Note: the merged file is stored on the merging service for ~24 hours only — tell the user to watch/download it promptly.
Use list_media to recall previously generated media from the database.`;

// ---------------- جلسات في الذاكرة (خادم + نقل لكل جلسة) ----------------
const sessions = new Map<string, { server: McpServer; transport: WebStandardStreamableHTTPServerTransport }>();

function buildServer(): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });

  // ---------------- صياغة الردود العربية ----------------
  const fmtTask = (t: TaskRecord): string => {
    if (t.status === "completed") {
      const url = t.result_urls[0];
      if (t.type === "image") return `✅ تم توليد الصورة بنجاح\n\n![image](${url})\n\nالرابط المباشر: ${url}`;
      if (t.type === "merge")
        return `✅ تم دمج المقاطع بنجاح\n\nالرابط المباشر: ${url}\n\n⚠️ ملف الدمج يُحذف من خدمة الدمج بعد ~24 ساعة — شاهده/نزّله سريعًا.`;
      let out = `✅ تم توليد الفيديو بنجاح`;
      for (const u of t.result_urls) out += `\n\nالرابط المباشر: ${u}`;
      return out;
    }
    if (t.status === "failed") return `❌ فشلت المهمة: ${t.error_message || "سبب غير معروف"}`;
    // processing
    let out = `⏳ المهمة قيد المعالجة — task_id: ${t.id}`;
    if (typeof t.progress === "number" && t.progress > 3) out += ` (${t.progress}%)`;
    out += `\n\nتابع بـ get_task كل ~10 ثوانٍ حتى تكتمل.`;
    return out;
  };

  const fmtError = (e: unknown): string => {
    if (e instanceof RequestError) return e.message;
    return `❌ حدث خطأ غير متوقع: ${e instanceof Error ? e.message : String(e)}`;
  };

  const errResult = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
  const okResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

  // عرّف حزمة إشعارات التقدم لو زوّد العميل الطلب بـ progressToken
  const progressBridge = (extra: { _meta?: { progressToken?: string | number }; sendNotification: (n: unknown) => Promise<void> }) => {
    const token = extra?._meta?.progressToken;
    if (token == null) return undefined;
    return (progress: number, message: string) => {
      extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken: token, progress, total: 100, message },
        })
        .catch(() => {});
    };
  };

  // ---------------- الأدوات الخمس ----------------
  server.registerTool(
    "generate_image",
    {
      title: "Generate Image",
      description:
        "توليد صورة بـ gpt-image-2-6/flare-text-to-image (تبديل تلقائي عبر كل المفاتيح النشطة). تعيد رابط الصورة جاهزًا إذا اكتملت خلال نافذة الانتظار، وإلا تعيد task_id — استدعِ get_task كل ~10 ثوانٍ حتى completed ثم اعرض الرابط وتوقف.",
      inputSchema: {
        prompt: z.string().min(1, { message: "المعامل prompt إلزامي — وصف ما سيُرسم" }).describe("What to draw. Detailed prompts give better results."),
        model: z
          .enum(["gpt-image-2-6/flare-text-to-image", "gpt-image-2.6/flare-text-to-image"])
          .default("gpt-image-2-6/flare-text-to-image"),
        aspect_ratio: z
          .enum(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21", "3:1", "1:3"])
          .default("auto"),
        resolution: z.enum(["1K", "2K", "4K"]).default("1K"),
        background: z.enum(["auto", "transparent", "opaque"]).default("auto").describe("Only applied at 1K."),
        output_format: z.enum(["png", "jpeg", "webp", "gif"]).default("png"),
        wait_seconds: z.number().int().min(0).max(45).default(45).describe("نافذة الانتظار داخل النداء — السقف الفعلي 45 ثانية (حد دالة الاستضافة)؛ أكمل التتبع بـ get_task"),
      },
    },
    async (args, extra) => {
      const a = args as {
        prompt: string;
        model: string;
        aspect_ratio: string;
        resolution: string;
        background: string;
        output_format: string;
        wait_seconds: number;
      };
      try {
        const task = await runGeneration(
          {
            type: "image",
            model: a.model,
            input: { prompt: a.prompt, aspect_ratio: a.aspect_ratio, resolution: a.resolution, background: a.background, output_format: a.output_format },
            waitSeconds: a.wait_seconds ?? 45,
          },
          progressBridge(extra as never)
        );
        const text = fmtTask(task);
        return task.status === "failed" ? errResult(text) : okResult(text);
      } catch (e) {
        return errResult(fmtError(e));
      }
    }
  );

  server.registerTool(
    "generate_video",
    {
      title: "Generate Video",
      description:
        "توليد فيديو بـ grok-imagine-video-1-5-preview (صوت متزامن أصلي، image-to-video اختياري). الفيديو يحتاج دقائق: انتظار قصير مع بث تقدم ثم task_id — تابع بـ get_task كل ~10 ثوانٍ.",
      inputSchema: {
        prompt: z.string().max(4096).describe("Scene description. Dialogue in the prompt is spoken in the video."),
        image_url: z.string().optional().describe("Optional public image URL as the first frame (image-to-video)."),
        model: z.enum(["grok-imagine-video-1-5-preview", "grok-imagine-video-1.5-preview"]).default("grok-imagine-video-1-5-preview"),
        aspect_ratio: z.enum(["auto", "1:1", "16:9", "9:16", "3:2", "2:3"]).default("auto"),
        resolution: z.enum(["480p", "720p", "1080p"]).default("480p"),
        enable_audio: z.boolean().default(true),
        duration: z.number().int().min(1).max(15).default(8).describe("Duration in seconds."),
        wait_seconds: z.number().int().min(0).max(45).default(25).describe("نافذة الانتظار داخل النداء — السقف الفعلي 45 ثانية (حد دالة الاستضافة)؛ أكمل التتبع بـ get_task"),
      },
    },
    async (args, extra) => {
      const a = args as {
        prompt: string;
        image_url?: string;
        model: string;
        aspect_ratio: string;
        resolution: string;
        enable_audio: boolean;
        duration: number;
        wait_seconds: number;
      };
      try {
        const task = await runGeneration(
          {
            type: "video",
            model: a.model,
            input: {
              prompt: a.prompt,
              ...(a.image_url ? { image_url: a.image_url } : {}),
              aspect_ratio: a.aspect_ratio,
              resolution: a.resolution,
              enable_audio: a.enable_audio,
              duration: a.duration,
            },
            waitSeconds: a.wait_seconds ?? 25,
          },
          progressBridge(extra as never)
        );
        const text = fmtTask(task);
        return task.status === "failed" ? errResult(text) : okResult(text);
      } catch (e) {
        return errResult(fmtError(e));
      }
    }
  );

  server.registerTool(
    "merge_videos",
    {
      title: "Merge Videos",
      description:
        'دمج عدة مقاطع في فيديو واحد نهائي بالترتيب المعطى. مرر urls (روابط فيديو مباشرة عامة — مثل روابط generate_video) أو task_ids (لمهام فيديو مكتملة تُحل روابطها من قاعدة البيانات بالترتيب — مثالي بعد توليد عدة مقاطع). الدمج سريع عادةً: انتظار قصير مع بث تقدم ثم task_id للدمج — تابعه بـ get_task. Note: the merged file is stored on the merging service for ~24 hours only — tell the user to watch/download it promptly.',
      inputSchema: {
        urls: z
          .array(z.string(), { message: "مرّر urls (روابط مباشرة) أو task_ids لمهام مكتملة" })
          .min(2, { message: "❌ الدمج يحتاج مقطعَين على الأقل. مرّر urls (روابط مباشرة) أو task_ids لمهام مكتملة." })
          .max(10, { message: "❌ أقصى عدد مقاطع للدمج هو 10 (خدمة الدمج تقبل 10 مقاطع كحد أقصى)." })
          .optional()
          .describe("Public direct video URLs (http/https) in merge order — the first clip starts the final video."),
        task_ids: z
          .array(z.string(), { message: "مرّر urls (روابط مباشرة) أو task_ids لمهام مكتملة" })
          .min(2, { message: "❌ الدمج يحتاج مقطعَين على الأقل. مرّر urls (روابط مباشرة) أو task_ids لمهام مكتملة." })
          .max(10, { message: "❌ أقصى عدد مقاطع للدمج هو 10 (خدمة الدمج تقبل 10 مقاطع كحد أقصى)." })
          .optional()
          .describe("Alternative to urls: task_ids of COMPLETED video generation tasks — their result URLs are merged in this order."),
        wait_seconds: z.number().int().min(0).max(45).default(45).describe("نافذة الانتظار داخل النداء — السقف الفعلي 45 ثانية (حد دالة الاستضافة)؛ أكمل التتبع بـ get_task"),
      },
    },
    async (args, extra) => {
      const a = args as { urls?: string[]; task_ids?: string[]; wait_seconds: number };
      try {
        const task = await runMerge({ urls: a.urls, taskIds: a.task_ids, waitSeconds: a.wait_seconds ?? 60 }, progressBridge(extra as never));
        const text = fmtTask(task);
        return task.status === "failed" ? errResult(text) : okResult(text);
      } catch (e) {
        return errResult(fmtError(e));
      }
    }
  );

  server.registerTool(
    "get_task",
    {
      title: "Get Task",
      description:
        "تتبع أي مهمة بمعرّفها — توليد صور/فيديو ودمج (يقرأ قاعدة Turso ويحدّث من المزود/الخدمة إن كانت جارية). استعلمه كل ~10 ثوانٍ؛ عند completed ستجد روابط النتائج — اعرضها للمستخدم وتوقف عن الاستعلام.",
      inputSchema: {
        task_id: z.string().min(1, { message: "المعامل task_id إلزامي" }),
      },
    },
    async (args) => {
      const a = args as { task_id: string };
      try {
        const task = await refreshTask(a.task_id);
        return okResult(fmtTask(task));
      } catch (e) {
        return errResult(fmtError(e));
      }
    }
  );

  server.registerTool(
    "list_media",
    {
      title: "List Media",
      description:
        "أحدث الصور/الفيديوهات/الدمجات المخزنة بروابطها من قاعدة البيانات (بدون إعادة توليد) — لاسترجاع نتائج سابقة.",
      inputSchema: {
        type: z.enum(["image", "video", "merge"]).optional(),
        status: z.enum(["completed", "failed", "processing"]).optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
    },
    async (args) => {
      const a = args as { type?: "image" | "video" | "merge"; status?: "completed" | "failed" | "processing"; limit: number };
      try {
        await ensureSchema();
        const tasks = await listRecentTasks(a.limit ?? 10, { type: a.type, status: a.status });
        if (!tasks.length) return okResult("لا توجد وسائط مخزنة بعد حسب هذا الفلتر.");
        const lines = tasks.map((t, i) => {
          const typeAr = t.type === "image" ? "صورة" : t.type === "merge" ? "دمج" : "فيديو";
          const statusAr = t.status === "completed" ? "✅ مكتملة" : t.status === "failed" ? "❌ فاشلة" : "⏳ جارية";
          const urls = t.result_urls.length ? `\n   الرابط: ${t.result_urls[0]}` : "";
          const err = t.status === "failed" && t.error_message ? `\n   الخطأ: ${t.error_message.slice(0, 160)}` : "";
          return `${i + 1}. [${typeAr}] ${statusAr} — ${t.model}\n   task_id: ${t.id}\n   الوصف: ${(t.prompt || "-").slice(0, 120)}${urls}${err}`;
        });
        return okResult(`آخر ${tasks.length} وسائط مخزنة (الأحدث أولًا):\n\n${lines.join("\n\n")}`);
      } catch (e) {
        return errResult(fmtError(e));
      }
    }
  );

  return server;
}

// ---------------- مسار /mcp ----------------
function authOk(req: Request): boolean {
  const expected = process.env.MCP_ACCESS_TOKEN || "";
  if (!expected) {
    // محليًا بدون توكن: مفتوح للتطوير — في الإنتاج proxy.ts يرد 503 قبل الوصول هنا
    return !process.env.VERCEL;
  }
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m) return false;
  // مقارنة زمنية-ثابتة (timing-safe) — لا تسريب زمني على التوكن
  const a = Buffer.from(m[1].trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a); // استهلاك زمني متقارب حتى مع اختلاف الطول
    return false;
  }
  return timingSafeEqual(a, b);
}

function jsonResp(obj: unknown, status = 400): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

export async function POST(req: Request): Promise<Response> {
  if (!authOk(req)) {
    return jsonResp({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized — مطلوب Authorization: Bearer <MCP_ACCESS_TOKEN>" } }, 401);
  }
  const rawBody = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResp({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error — JSON غير صالح" } }, 400);
  }

  const sid = req.headers.get("mcp-session-id");
  const isInit = isInitializeRequest(body as never);

  if (isInit) {
    // جلسة جديدة: خادم + نقل + معرف جلسة
    let sessionSid: string | null = null;
    const transport: WebStandardStreamableHTTPServerTransport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSid) => {
        sessionSid = newSid;
        sessions.set(newSid, { server, transport });
      },
      enableJsonResponse: false, // استجابات SSE → Progress notifications تعمل
    });
    transport.onclose = () => {
      if (sessionSid) sessions.delete(sessionSid);
    };
    const server = buildServer();
    await server.connect(transport);
    // جسم الطلب حُلّل بالفعل أعلاه — يُمرَّر parsedBody حتى لا يُقرأ الدفق ثانية
    return transport.handleRequest(req, { parsedBody: body });
  }

  if (sid && sessions.has(sid)) {
    const { transport } = sessions.get(sid)!;
    return transport.handleRequest(req, { parsedBody: body });
  }

  return jsonResp({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request — mcp-session-id غير موجود أو منتهٍ، ابدأ بـ initialize" } }, 400);
}

// GET: تدفق رسائل الخادم→العميل (SSE) للجلسة القائمة
export async function GET(req: Request): Promise<Response> {
  if (!authOk(req)) return jsonResp({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" } }, 401);
  const sid = req.headers.get("mcp-session-id");
  if (!sid || !sessions.has(sid)) {
    return jsonResp({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found" } }, 404);
  }
  const { transport } = sessions.get(sid)!;
  return transport.handleRequest(req);
}

// DELETE: إنهاء الجلسة
export async function DELETE(req: Request): Promise<Response> {
  if (!authOk(req)) return jsonResp({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" } }, 401);
  const sid = req.headers.get("mcp-session-id");
  if (!sid || !sessions.has(sid)) {
    return jsonResp({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found" } }, 404);
  }
  const { transport } = sessions.get(sid)!;
  return transport.handleRequest(req);
}
