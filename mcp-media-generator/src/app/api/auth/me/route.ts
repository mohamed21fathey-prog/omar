// GET /api/auth/me — بيانات الزبون الحالي من الجلسة (null لو مش مسجل)
import { after, NextRequest, NextResponse } from "next/server";
import { getUserById, readSession } from "@/lib/auth";
import { maybeSweepGlobal } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const id = readSession(req);
  if (!id) return NextResponse.json({ user: null });
  // 🧹 كاسحة عالمية بعد الرد (بمهلة تبريد 60ث) — تلتئم المشاهد العالقة مع كل تنقل عادي
  after(() => maybeSweepGlobal().catch(() => undefined));
  const user = await getUserById(id);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      username: user.username,
      email: user.email,
      created_at: user.created_at,
      credits: user.credits,
      referral_code: user.referral_code,
      invited_count: user.invited_count,
    },
  });
}
