// GET /api/health — حالة الخدمة الكاملة (تُستخدم في شارة الواجهة والفحص)
import { NextResponse } from "next/server";
import { dbHealthy } from "@/lib/turso";
import { MERGER_BASE, mergerClient } from "@/lib/merger";
import { MODELS } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await dbHealthy();
  const mergerHealthy = await mergerClient.healthy();
  return NextResponse.json(
    {
      ok: db,
      database: db ? "turso-connected" : "disconnected",
      mcpEndpoint: "/mcp",
      models: MODELS.map((m) => ({ canonical: m.canonical, type: m.type, providers: m.providers })),
      merger: { base: MERGER_BASE || "(غير مضبوط)", healthy: mergerHealthy },
      authRequired: !!process.env.MCP_ACCESS_TOKEN,
    },
    { status: db ? 200 : 503 }
  );
}
