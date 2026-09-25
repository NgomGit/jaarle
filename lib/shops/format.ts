// Petits formatages partagés (client + serveur) pour la boutique.

/** 25000 → « 25 000 FCFA » ; null → « Prix sur demande ». */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "Prix sur demande";
  return `${price.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

/** Numéro local sénégalais (9 chiffres) → E.164 (+221…). Déjà en E.164 → inchangé. */
export function toE164Senegal(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("221") && digits.length === 12) return `+${digits}`;
  return `+221${digits}`;
}

/** +221771234567 → 771234567 (pour le champ PhoneInput existant, qui ajoute lui-même +221). */
export function toLocalSenegal(e164: string | null | undefined): string {
  return (e164 ?? "").replace(/^\+?221/, "");
}

/** +221771234567 → « 77 123 45 67 » (affichage). */
export function formatSenegalPhone(e164: string): string {
  const local = toLocalSenegal(e164);
  if (local.length !== 9) return e164;
  return `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
}

/** URL publique du site (liens, QR). Configurable via NEXT_PUBLIC_SITE_URL. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://jaarle.com").replace(/\/+$/, "");
}

export function shopPublicUrl(slug: string): string {
  return `${siteUrl()}/boutique/${slug}`;
}

/** Affichage sans protocole : « jaarle.com/boutique/awa-couture ». */
export function shopDisplayUrl(slug: string): string {
  return shopPublicUrl(slug).replace(/^https?:\/\//, "");
}
