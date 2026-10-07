export type Tier = "premium" | "gold";

export interface TierConfig {
  key: Tier;
  labelFr: string;
  price: number;
  maxRegenerations: number;
  maxPhotos: number;
  variations: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  premium: { key: "premium", labelFr: "Standard", price: 750, maxRegenerations: 1, maxPhotos: 1, variations: 1 },
  gold: { key: "gold", labelFr: "Premium", price: 1500, maxRegenerations: 1, maxPhotos: 3, variations: 1 },
};

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier as Tier] ?? TIERS.premium;
}

/**
 * Toutes les nouvelles affiches sont créées au niveau premium (clé technique « gold », 2 générations).
 * Le palier « premium » (ancien Standard) ne reste que pour les affiches déjà existantes.
 */
export const DEFAULT_TIER: Tier = "gold";

/** Nombre max de photos par affiche : 1 principale + 2 secondaires en vignettes (design le plus net). */
export const MAX_POSTER_PHOTOS = 3;

/**
 * Affiches multi-photos (2-3 photos du produit) : MASQUÉES le 2026-10-07, le rendu n'est pas au
 * niveau attendu (voir claude/jaarle-multi-photos-process.md dans le projet). Remettre à `true`
 * pour les réactiver : formulaire, génération, « Nouvelle version » et upsell Pro suivent ce drapeau.
 */
export const MULTI_PHOTO_POSTERS_ENABLED = false;
