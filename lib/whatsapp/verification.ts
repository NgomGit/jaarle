// Vérification du numéro WhatsApp de la boutique (migration 0049).
// Logique pure (testée dans __tests__/verification.test.ts) : format du code, message pré-rempli,
// lecture du webhook Meta et signature X-Hub-Signature-256.

export const VERIFICATION_PREFIX = "JRL";

/**
 * Interrupteur général de la vérification WhatsApp — EN PAUSE (2026-10-20) tant que le numéro
 * dédié à l'API WhatsApp Cloud n'est pas prêt. Rien ne s'affiche ni ne s'exécute sauf si
 * WHATSAPP_VERIFICATION_ENABLED=on ET JAARLE_WHATSAPP_NUMBER sont posés. Le Market n'exige
 * rien tant que market_settings.whatsapp_required_from reste null.
 */
export function whatsappVerificationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WHATSAPP_VERIFICATION_ENABLED === "on" && !!env.JAARLE_WHATSAPP_NUMBER;
}

/** 482913 → « JRL-482913 » */
export function formatVerificationCode(code: string): string {
  return `${VERIFICATION_PREFIX}-${code}`;
}

/** Texte pré-rempli envoyé par le vendeur. Le code reste lisible même si le vendeur modifie le reste. */
export function verificationMessage(code: string): string {
  return `Bonjour Jaarle, je confirme le numéro WhatsApp de ma boutique. Code : ${formatVerificationCode(code)}`;
}

/** Lien wa.me vers le numéro Jaarle (E.164 ou chiffres), message pré-rempli. */
export function verificationWaLink(jaarleNumber: string, code: string): string {
  return `https://wa.me/${jaarleNumber.replace(/\D/g, "")}?text=${encodeURIComponent(verificationMessage(code))}`;
}

/** Retrouve les 6 chiffres dans « JRL-482913 », « jrl 482913 », « JRL482913 »… sinon null. */
export function extractVerificationCode(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/\bJRL[\s\-_:]*(\d{6})\b/i);
  return m ? m[1] : null;
}

export interface IncomingWhatsappMessage {
  id: string;
  /** Numéro de l'expéditeur, chiffres seuls (« 221771234567 »), fourni par WhatsApp. null si l'utilisateur
   *  a un nom d'utilisateur WhatsApp et n'a pas partagé son numéro (seul un BSUID est alors transmis). */
  from: string | null;
  /** Destinataire technique pour une réponse (numéro, ou à défaut le champ `from` brut / BSUID). */
  replyTo: string;
  text: string;
}

/** Un numéro E.164 en chiffres seuls : 8 à 15 chiffres. Un BSUID (identifiant opaque) ne passe pas. */
function asPhoneDigits(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/^\+/, "");
  return /^\d{8,15}$/.test(t) ? t : null;
}

/** Messages texte entrants d'un webhook WhatsApp Cloud (les statuts de livraison sont ignorés). */
export function parseWebhookMessages(body: unknown): IncomingWhatsappMessage[] {
  const out: IncomingWhatsappMessage[] = [];
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[]; contacts?: unknown[] } })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      const contacts = Array.isArray(value?.contacts) ? (value!.contacts as { wa_id?: string; user_id?: string }[]) : [];
      for (const raw of messages) {
        const msg = raw as { id?: string; from?: string; from_user_id?: string; type?: string; text?: { body?: string }; button?: { text?: string } };
        if (!msg?.id || !(msg.from || msg.from_user_id)) continue;
        const text = msg.type === "text" ? msg.text?.body : msg.type === "button" ? msg.button?.text : undefined;
        if (!text) continue;
        // Numéro : champ `from` s'il s'agit d'un numéro, sinon wa_id du contact (une seule entrée par message).
        const phone = asPhoneDigits(msg.from) ?? asPhoneDigits(contacts.length === 1 ? contacts[0]?.wa_id : undefined);
        out.push({ id: msg.id, from: phone, replyTo: phone ?? String(msg.from ?? msg.from_user_id), text });
      }
    }
  }
  return out;
}


export type ConfirmStatus = "verified" | "already" | "unknown_code" | "expired" | "mismatch" | "number_changed" | "taken" | "phone_hidden";

/** Réponse renvoyée au vendeur (si l'envoi de confirmation est activé). null = ne rien répondre. */
export function confirmationReply(status: ConfirmStatus): string | null {
  switch (status) {
    case "verified":
      return "✅ C'est fait ! Le numéro WhatsApp de ta boutique Jaarle est vérifié. Tu peux revenir sur jaarle.com.";
    case "expired":
      return "⏱️ Ce code a expiré. Retourne sur jaarle.com et appuie à nouveau sur « Vérifier sur WhatsApp ».";
    case "mismatch":
      return "❌ Ce message ne vient pas du numéro enregistré pour la boutique. Envoie le code depuis le WhatsApp de la boutique.";
    case "number_changed":
      return "❌ Le numéro de la boutique a changé entre-temps. Demande un nouveau code sur jaarle.com.";
    case "phone_hidden":
      return "🔒 WhatsApp ne nous a pas transmis ton numéro (nom d'utilisateur actif). Partage ton numéro dans cette discussion ou envoie le code depuis un compte sans nom d'utilisateur, puis réessaie.";
    case "taken":
      return "❌ Ce numéro est déjà vérifié pour une autre boutique Jaarle. Contacte le support si c'est une erreur.";
    default:
      return null;
  }
}
