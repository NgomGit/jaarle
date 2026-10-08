import { formatPrice } from "@/lib/shops/format";

// Promo produit (migration 0046) : `price` = prix payé aujourd'hui, `compare_at_price` = ancien prix
// barré, `promo_ends_at` = fin facultative. Réservée au Pro (vérifié en base). Fichier sans
// dépendance navigateur ni serveur : utilisé partout où un prix s'affiche.

export const PROMO_MAX_PERCENT = 90;
export const PROMO_PRO_MESSAGE = "La promo est réservée à Jaarle Pro. Passe au Pro pour afficher un prix barré et apparaître dans les Promos du Market.";

export interface ActivePromo {
  oldPrice: number;
  oldPriceLabel: string;
  /** Remise arrondie, ex. 20 pour « -20 % ». */
  percent: number;
  endsAt: string | null;
}

/** Promo visible maintenant, ou null (pas de promo, incohérente ou terminée). */
export function activePromo(
  price: number | null | undefined,
  compareAtPrice: number | null | undefined,
  endsAt?: string | null,
  now: number = Date.now()
): ActivePromo | null {
  if (price == null || compareAtPrice == null || !(compareAtPrice > price) || price < 0) return null;
  if (endsAt && new Date(endsAt).getTime() <= now) return null;
  const percent = Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  if (percent < 1) return null;
  return { oldPrice: compareAtPrice, oldPriceLabel: formatPrice(compareAtPrice), percent, endsAt: endsAt ?? null };
}

/** « jusqu'au 12 oct. » (fuseau de Dakar = UTC). */
export function promoEndLabel(endsAt: string | null | undefined): string | null {
  if (!endsAt) return null;
  const d = new Date(endsAt);
  if (Number.isNaN(d.getTime())) return null;
  return `jusqu'au ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(d)}`;
}

/** Date du formulaire (AAAA-MM-JJ) → fin de ce jour à Dakar (UTC), en ISO. */
export function promoEndFromDay(day: string | null | undefined): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T23:59:59.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → AAAA-MM-JJ pour <input type="date">. */
export function promoEndToDay(endsAt: string | null | undefined): string {
  return endsAt ? endsAt.slice(0, 10) : "";
}

/** Erreur de saisie (nouveau prix, ancien prix), ou null si la promo est valide. */
export function promoInputError(price: number | null, oldPrice: number | null): string | null {
  if (oldPrice == null) return null;
  if (price == null) return "Indique le prix promo.";
  if (oldPrice <= price) return "L'ancien prix doit être plus élevé que le prix promo.";
  if (price * 10 < oldPrice) return `Remise trop forte : ${PROMO_MAX_PERCENT} % maximum.`;
  return null;
}
