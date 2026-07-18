import { NextResponse } from "next/server";
import { verifyPaytechIpn } from "@/lib/paytech";
import { createAdminClient } from "@/lib/supabase/admin";

// PayTech envoie ce webhook en server-to-server, sans session utilisateur —
// la vérification HMAC ci-dessous EST la sécurité (pas la RLS, contournée volontairement
// via la clé service_role une fois la signature validée).
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let payload: Record<string, string>;

  if (contentType.includes("application/json")) {
    payload = await request.json();
  } else {
    const form = await request.formData();
    payload = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
  }

  const { type_event, ref_command, item_price, payment_method, hmac_compute } = payload;

  if (!ref_command || !hmac_compute) {
    return NextResponse.json({ error: "Payload invalide." }, { status: 400 });
  }

  const isValid = verifyPaytechIpn({
    itemPrice: item_price,
    refCommand: ref_command,
    hmacCompute: hmac_compute,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 403 });
  }

  if (type_event !== "sale_complete") {
    // On accuse réception des autres événements (annulation, remboursement...) sans les traiter pour l'instant.
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: payment_method || null })
    .eq("ref_command", ref_command)
    .eq("status", "pending")
    .select("creation_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (order?.creation_id) {
    await admin.from("creations").update({ unlocked: true }).eq("id", order.creation_id);
  }

  return NextResponse.json({ ok: true });
}
