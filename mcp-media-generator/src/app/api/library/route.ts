// ============================================================
// /api/library — مكتبة الفيديوهات
// GET: عناصر المستخدم + مصادر الاستيراد من فيديوهات الموقع
// POST: { action } → add-upload | import | merge | refresh | delete
// المصادقة: جلسة المستخدم داخل المسار (المسار عام في proxy)
// ============================================================
import { NextResponse, NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { listItems, addItem, getItem, updateItem, deleteItem, listSources, type LibraryItem } from "@/lib/videoLibrary";
import { upsertUploadMeta, putChunk, finishUpload } from "@/lib/filestore";
import { mergerClient, MergerError } from "@/lib/merger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://media-generator-topaz.vercel.app").replace(/\/$/, "");
const MAX_VIDEO_BYTES = 3 * 1024 * 1024; // رفع لقطة واحدة — تحت حد body في Vercel (4.5MB) بأمان
const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ORIENTATIONS = new Set(["9:16", "16:9"]);

function itemVideoSrc(it: LibraryItem): string | null {
  if (it.source === "upload" && it.file_id) return `/api/library/file/${it.file_id}`;
  if (it.source === "merge") return it.result_url || null;
  return it.url || it.result_url || null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "سجل دخول أولًا من صفحة حسابك" }, { status: 401 });
  try {
    const [items, sources] = await Promise.all([listItems(user.id), listSources()]);
    return NextResponse.json({
      items: items.map((it) => ({ ...it, src: itemVideoSrc(it) })),
      sources,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getSessionUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "سجل دخول أولًا من صفحة حسابك" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  try {
    // ---------- رفع فيديو جديد (شورتس أو عرضي) — لقطة واحدة base64 ----------
    if (action === "add-upload") {
      const data64 = String(body.data64 || "");
      const mime = String(body.mime || "");
      const orientation = ORIENTATIONS.has(String(body.orientation)) ? String(body.orientation) : "16:9";
      const title = String(body.title || "").trim().slice(0, 120) || "فيديو مرفوع";
      if (!VIDEO_MIMES.has(mime)) {
        return NextResponse.json({ error: "الصيغة المسموحة: MP4 أو WebM أو MOV فقط" }, { status: 400 });
      }
      const bytes = Buffer.from(data64, "base64");
      if (!bytes.length) return NextResponse.json({ error: "الملف فاضي أو غير مقروء" }, { status: 400 });
      if (bytes.length > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: "الحجم أكبر من 3MB — قصّ الفيديو أو اضغطه ثم أعد الرفع (الشورتس القصيرة بترفع عادي)" }, { status: 400 });
      }
      const fileId = randomUUID();
      await upsertUploadMeta({ id: fileId, name: title, mime, kind: "big", total_chunks: 1 });
      await putChunk(fileId, 0, new Uint8Array(bytes));
      const fin = await finishUpload(fileId);
      if (fin.error) throw new Error(fin.error);
      const item = await addItem({
        id: randomUUID(),
        user_id: user.id,
        title,
        source: "upload",
        file_id: fileId,
        size: bytes.length,
        orientation,
      });
      return NextResponse.json({ ok: true, item: { ...item, src: itemVideoSrc(item) } });
    }

    // ---------- استيراد فيديو من إنتاج الموقع (رابط مباشر) ----------
    if (action === "import") {
      const url = String(body.url || "").trim();
      const title = String(body.title || "").trim().slice(0, 120) || "فيديو مستورد";
      const orientation = ORIENTATIONS.has(String(body.orientation)) ? String(body.orientation) : "16:9";
      if (!/^https?:\/\/.+/i.test(url)) {
        return NextResponse.json({ error: "رابط الفيديو غير صالح" }, { status: 400 });
      }
      const item = await addItem({ id: randomUUID(), user_id: user.id, title, source: "import", url, orientation });
      return NextResponse.json({ ok: true, item: { ...item, src: itemVideoSrc(item) } });
    }

    // ---------- دمج عناصر مختارة (مرفوع أو مستورد أو مدمج سابقًا) ----------
    if (action === "merge") {
      const ids = Array.isArray(body.ids) ? (body.ids as string[]).map(String).filter(Boolean) : [];
      if (ids.length < 2) {
        return NextResponse.json({ error: "اختار فيديوهين على الأقل للدمج" }, { status: 400 });
      }
      const urls: string[] = [];
      const titles: string[] = [];
      for (const id of ids.slice(0, 12)) {
        const it = await getItem(id);
        if (!it || it.user_id !== user.id) return NextResponse.json({ error: "أحد العناصر غير موجود في مكتبتك" }, { status: 404 });
        if (it.status !== "ready") return NextResponse.json({ error: `«${it.title}» ليس جاهزًا للدمج الآن` }, { status: 400 });
        const src = itemVideoSrc(it);
        if (!src) return NextResponse.json({ error: `«${it.title}» بدون فيديو قابل للدمج` }, { status: 400 });
        urls.push(src.startsWith("/") ? `${SITE_URL}${src}` : src);
        titles.push(it.title);
      }
      const { jobId } = await mergerClient.createJob(urls);
      const item = await addItem({
        id: randomUUID(),
        user_id: user.id,
        title: `دمج: ${titles.slice(0, 3).join(" + ")}${titles.length > 3 ? " +…" : ""}`.slice(0, 120),
        source: "merge",
        orientation: "16:9",
        status: "merging",
        job_id: jobId,
      });
      return NextResponse.json({ ok: true, item: { ...item, src: null } });
    }

    // ---------- متابعة مهمة دمج قيد التنفيذ (يستدعيها العميل دوريًا) ----------
    if (action === "refresh") {
      const id = String(body.id || "");
      const it = await getItem(id);
      if (!it || it.user_id !== user.id) return NextResponse.json({ error: "العنصر غير موجود" }, { status: 404 });
      if (it.status !== "merging" || !it.job_id) return NextResponse.json({ ok: true, item: { ...it, src: itemVideoSrc(it) } });
      try {
        const job = await mergerClient.processJob(it.job_id);
        if (job.status === "done") {
          const url = job.videoUrl || mergerClient.signedVideoUrl(it.job_id);
          await updateItem(id, { status: "ready", result_url: url, error: null });
          const fresh = await getItem(id);
          return NextResponse.json({ ok: true, item: { ...(fresh as LibraryItem), src: itemVideoSrc(fresh as LibraryItem) } });
        }
        // لسه بيتعالج — نقرأ أحدث حالة ونرجعها
        const fresh = await getItem(id);
        return NextResponse.json({ ok: true, processing: true, item: { ...(fresh as LibraryItem), src: null } });
      } catch (e) {
        const msg = e instanceof MergerError ? e.message : e instanceof Error ? e.message : "فشل الدمج";
        await updateItem(id, { status: "failed", error: msg.slice(0, 300) });
        const fresh = await getItem(id);
        return NextResponse.json({ ok: true, item: { ...(fresh as LibraryItem), src: itemVideoSrc(fresh as LibraryItem) } });
      }
    }

    // ---------- حذف عنصر (مكتمل أو غير مكتمل) ----------
    if (action === "delete") {
      const id = String(body.id || "");
      const ok = await deleteItem(id, user.id);
      if (!ok) return NextResponse.json({ error: "العنصر غير موجود في مكتبتك" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "عملية غير معروفة" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير متوقع";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
