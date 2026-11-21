// GET /api/youtube/status — هل مفاتيح جوجل مضبوطة؟ وهل القناة مرتبطة؟
import { NextResponse } from "next/server";
import { clientConfigured, getLinked } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;
  const linked = await getLinked();
  return NextResponse.json({
    configured: clientConfigured(),
    linked: linked.linked,
    channel_title: linked.channel_title,
    redirect_uri: `${origin}/api/youtube/callback`,
  });
}
