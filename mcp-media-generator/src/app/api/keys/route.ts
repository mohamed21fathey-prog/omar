// GET /api/keys — القائمة (المفاتيح مقنّعة دائمًا)
// POST /api/keys — إضافة مفتاح مع رفض التكرار لنفس المزود
import { NextResponse } from "next/server";
import { ensureSchema, insertKey, listKeys } from "@/lib/turso";
import { maskKey, ensureKeyRoleColumn, ensureKeyUserColumn } from "@/lib/keys";
import { decryptApiKey, isEncrypted } from "@/lib/keycipher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// القناع يُحسب على المفتاح الأصلي لا على نصه المشفر (enc:v1:…) — وإلا يظهر قناع التشفير في اللوحة
function maskPlain(encryptedOrPlain: string): string {
  return maskKey(isEncrypted(encryptedOrPlain) ? decryptApiKey(encryptedOrPlain) : encryptedOrPlain);
}

const PROVIDERS = ["kie", "cometapi", "apiframe"];

export async function GET() {
  await ensureSchema();
  await ensureKeyRoleColumn();
  await ensureKeyUserColumn();
  const keys = await listKeys();
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      label: k.label,
      role: k.role || "customer",
      user_id: (k as unknown as { user_id?: string }).user_id || null,
      masked: maskPlain(k.api_key),
      status: k.status,
      usage_count: k.usage_count,
      success_count: k.success_count,
      fail_count: k.fail_count,
      last_used_at: k.last_used_at,
      last_error: k.last_error,
      created_at: k.created_at,
    })),
  });
}

// ربط مفتاح زبون بحسابه يتم عبر PATCH /api/keys/{id} مع { user_id } — انظر [id]/route.ts

export async function POST(req: Request) {
  await ensureSchema();
  let body: { provider?: string; api_key?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 });
  }
  const provider = String(body.provider || "").trim();
  const apiKey = String(body.api_key || "").trim();
  const label = String(body.label || "").trim().slice(0, 100);

  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "المزود يجب أن يكون kie أو cometapi" }, { status: 400 });
  }
  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json({ error: "المفتاح قصير أو مفقود" }, { status: 400 });
  }
  // 💰 لا تحقق خارجي عند الإضافة — المفتاح يُحفظ فورًا سرًا داخل الخادم ويُجرَّب وقت
  // التوليد فعليًا (الفوترة للزبائن من الرصيد الداخلي فقط، بلا أي اعتماد على kie.ai)
  // رفض التكرار عبر فهرس فريد UNIQUE(provider, api_key) — بلا قراءة كل الصفوف
  let created;
  try {
    created = await insertKey(provider, apiKey, label);
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(String((e as Error)?.message || e))) {
      return NextResponse.json({ error: "هذا المفتاح مضاف بالفعل لنفس المزود" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json(
    {
      id: created.id,
      provider: created.provider,
      label: created.label,
      masked: maskPlain(created.api_key),
      status: created.status,
    },
    { status: 201 }
  );
}
