// ============================================================
// /api/wallets — عام للزبائن: أرقام محافظ الاستلام + اسم صاحب الحساب
// + واتساب المشرف (زر «اسألنا» الثابت في كل الصفحات)
// بدون أي بيانات إدارية حساسة (مفاتيح الإشعارات / توكنات)
// ============================================================
import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const s = await getSettings();
    return NextResponse.json({
      vodafone_number: s.vodafone_number || "",
      instapay_handle: s.instapay_handle || "",
      wallet_holder_name: s.wallet_holder_name || "",
      admin_whatsapp: s.admin_whatsapp || "", // رقم تواصل الزبائن — يغذي زر واتساب الثابت
      paypal_email: s.paypal_email || "",
      bank_visa_note: s.bank_visa_note || "",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, { status: 500 });
  }
}
