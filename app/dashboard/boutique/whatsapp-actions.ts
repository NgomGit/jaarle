"use server";

import { createClient } from "@/lib/supabase/server";
import { verificationWaLink, whatsappVerificationEnabled } from "@/lib/whatsapp/verification";

// Vérification du numéro WhatsApp de la boutique (migration 0049).

export type StartVerificationResult =
  | { status: "pending"; code: string; waLink: string; expiresAt: string; phone: string }
  | { status: "already_verified" | "taken" | "rate_limited" | "no_shop" | "suspended" | "not_configured" | "error" };

export async function startWhatsappVerification(): Promise<StartVerificationResult> {
  const jaarleNumber = process.env.JAARLE_WHATSAPP_NUMBER;
  if (!jaarleNumber || !whatsappVerificationEnabled()) return { status: "not_configured" };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_whatsapp_verification");
  if (error || !data) {
    console.error("[boutique/whatsapp] start failed:", error?.message);
    return { status: "error" };
  }
  const res = data as { status: string; code?: string; phone?: string; expires_at?: string };
  if (res.status === "pending" && res.code && res.expires_at && res.phone) {
    return { status: "pending", code: res.code, phone: res.phone, expiresAt: res.expires_at, waLink: verificationWaLink(jaarleNumber, res.code) };
  }
  if (res.status === "unauthenticated") return { status: "error" };
  return { status: res.status as Exclude<StartVerificationResult["status"], "pending"> };
}

export type VerificationState = { verified: boolean; lastRejection: "mismatch" | "number_changed" | "taken" | null };

/** Interrogé toutes les 3 s par la carte pendant que le vendeur envoie son message. */
export async function getWhatsappVerificationState(): Promise<VerificationState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { verified: false, lastRejection: null };
  const { data: shop } = await supabase.from("shops").select("id, whatsapp_verified_at").eq("owner_id", user.id).maybeSingle();
  if (!shop) return { verified: false, lastRejection: null };
  if (shop.whatsapp_verified_at) return { verified: true, lastRejection: null };
  const { data: last } = await supabase
    .from("whatsapp_verifications")
    .select("status, reject_reason")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const reason = last?.status === "rejected" ? (last.reject_reason as VerificationState["lastRejection"]) : null;
  return { verified: false, lastRejection: reason };
}
