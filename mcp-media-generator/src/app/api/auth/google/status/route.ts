// GET /api/auth/google/status — هل تسجيل جوجل مفعّل؟ (تحدد ظهور الزر في صفحة الحساب)
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const enabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return NextResponse.json({ enabled });
}
