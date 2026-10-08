import { siteUrl } from "@/lib/shops/format";

// Modération (admin) : messages WhatsApp préremplis envoyés au vendeur depuis le numéro Jaarle.
// Pas d'envoi automatique : l'admin ouvre WhatsApp, relit, envoie (comme les relances).

export type NoticeKind = "product_hidden" | "product_restored" | "shop_suspended" | "shop_reactivated";

/** Raisons proposées dans les formulaires (texte libre possible). */
export const MODERATION_REASONS = [
  "Photo ou contenu inapproprié",
  "Produit interdit à la vente",
  "Annonce trompeuse ou suspicion d'arnaque",
  "Contrefaçon ou nom de marque",
  "Photo floue ou sans rapport avec le produit",
  "Annonce en double",
] as const;

/** Lien wa.me vers un numéro E.164 (+221…), avec le message prérempli. */
export function whatsappLink(phoneE164: string | null | undefined, text: string): string | null {
  const digits = (phoneE164 ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function noticeMessage(
  kind: NoticeKind,
  p: { shopName: string; productName?: string | null; productId?: string | null; reason?: string | null }
): string {
  const hello = `Bonjour ${p.shopName}, c'est l'équipe Jaarle.`;
  const reason = p.reason ? `\nRaison : ${p.reason}.` : "";
  const productLink = p.productId ? `${siteUrl()}/dashboard/produits/${p.productId}` : `${siteUrl()}/dashboard/produits`;
  switch (kind) {
    case "product_hidden":
      return (
        `${hello}\n\nNous avons masqué votre produit « ${p.productName ?? ""} » : il n'est plus visible sur votre boutique ni sur Jaarle Market.${reason}\n\n` +
        `Vous pouvez le corriger ici : ${productLink}\nPuis appuyez sur « J'ai corrigé, demander une vérification ». Nous le remettrons en ligne après vérification.\n\nMerci de votre compréhension.`
      );
    case "product_restored":
      return `${hello}\n\nBonne nouvelle : votre produit « ${p.productName ?? ""} » est de nouveau visible sur votre boutique et sur Jaarle Market. Merci !`;
    case "shop_suspended":
      return (
        `${hello}\n\nVotre boutique est suspendue : elle n'est plus visible en ligne ni sur Jaarle Market.${reason}\n\n` +
        `Répondez à ce message pour en parler avec nous.`
      );
    case "shop_reactivated":
      return `${hello}\n\nBonne nouvelle : votre boutique est de nouveau en ligne sur Jaarle et sur Jaarle Market. Merci !`;
  }
}
