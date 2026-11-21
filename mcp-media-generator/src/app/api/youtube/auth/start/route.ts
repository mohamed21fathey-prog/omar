// GET /api/youtube/auth/start — رابط شاشة تأذين جوجل (مرة واحدة فقط)
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildAuthUrl, clientConfigured } from "@/lib/youtube";
import { sessionHmac } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!clientConfigured()) {
    return NextResponse.json(
      { error: "مفاتيح جوجل غير مضبوطة — أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET أولًا" },
      { status: 400 }
    );
  }
  // state عشوائي موقّع (10 دقائق) — يُتحقق منه في callback لمنع ربط قناة مهاجم
  const state = crypto.randomBytes(16).toString("hex");
  const exp = Date.now() + 10 * 60_000;
  const sig = sessionHmac(`yt:${state}.${exp}`);
  const res = NextResponse.json({ authUrl: buildAuthUrl(new URL(req.url).origin, state) });
  res.cookies.set("yt_state", `${state}.${exp}.${sig}`, {
    httpOnly: true,
    secure: process.env.VERCEL_ENV === "production",
    sameSite: "strict",
    maxAge: 600,
    path: "/",
  });
  return res;
}
