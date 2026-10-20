import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  confirmationReply,
  extractVerificationCode,
  parseWebhookMessages,
  whatsappVerificationEnabled,
  type ConfirmStatus,
} from "@/lib/whatsapp/verification";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";

// Webhook WhatsApp Cloud API (Meta) — vérification du numéro de la boutique (migration 0049).
// Meta appelle cette route en server-to-server : la signature X-Hub-Signature-256 (App Secret) EST
// la sécurité ; ensuite seulement on passe par la clé service_role.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET : poignée de main à l'enregistrement du webhook (Meta > WhatsApp > Configuration).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET ?? "")) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 403 });
  }
  // Vérification en pause : on accuse réception sans rien confirmer (pas de renvois de Meta).
  if (!whatsappVerificationEnabled()) return NextResponse.json({ ok: true, paused: true });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // corps illisible : on accuse réception pour éviter les renvois
  }

  const admin = createAdminClient();
  for (const msg of parseWebhookMessages(body)) {
    const code = extractVerificationCode(msg.text);
    if (!code) continue; // message ordinaire au numéro Jaarle : pas une vérification

    if (!msg.from) {
      // Nom d'utilisateur WhatsApp sans numéro partagé : impossible de comparer au numéro de la boutique.
      await sendReply(msg.replyTo, "phone_hidden");
      continue;
    }
    const { data, error } = await admin.rpc("confirm_whatsapp_verification", {
      p_from: msg.from,
      p_code: code,
      p_message_id: msg.id,
    });
    if (error) {
      console.error("[whatsapp/webhook] confirm failed:", error.message);
      continue; // on répond 200 quand même : Meta renverrait sinon le lot entier
    }
    const status = (data as { status?: ConfirmStatus } | null)?.status;
    if (status) await sendReply(msg.replyTo, status);
  }

  // Toujours 200 rapidement : Meta désactive les webhooks qui échouent ou traînent.
  return NextResponse.json({ ok: true });
}

/** Réponse optionnelle au vendeur, dans la fenêtre de service ouverte par son propre message. */
async function sendReply(to: string, status: ConfirmStatus) {
  const text = confirmationReply(status);
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!text || process.env.WHATSAPP_SEND_CONFIRMATION !== "on" || !token || !phoneNumberId) return;
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
    if (!res.ok) console.error("[whatsapp/webhook] reply failed:", res.status, await res.text());
  } catch (e) {
    console.error("[whatsapp/webhook] reply error:", e);
  }
}
