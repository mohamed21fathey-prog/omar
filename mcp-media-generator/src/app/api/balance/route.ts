// GET /api/balance — رصيد الكريدتس الحالي لكل مفتاح kie في الحساب
import { NextResponse } from "next/server";
import { getBalances } from "@/lib/balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const info = await getBalances();
    return NextResponse.json(info);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "فشل جلب الرصيد" },
      { status: 500 }
    );
  }
}
