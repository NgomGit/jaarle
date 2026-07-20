export type Tier = "basic" | "medium" | "premium" | "gold";

export interface TierConfig {
  key: Tier;
  labelFr: string;
  price: number;
  maxRegenerations: number;
  maxPhotos: number;
  variations: number;
  /** false = plus proposé aux nouvelles créations (gardé pour les créations existantes en base). */
  offered: boolean;
}

// Basique et Medium ne sont plus proposés (gamme resserrée sur Standard/Advanced, les deux
// paliers qui donnent un rendu satisfaisant) — les entrées restent définies pour que les
// créations déjà existantes en base avec tier="basic"/"medium" continuent de fonctionner.
export const TIERS: Record<Tier, TierConfig> = {
  basic: { key: "basic", labelFr: "Basique", price: 200, maxRegenerations: 0, maxPhotos: 1, variations: 1, offered: false },
  medium: { key: "medium", labelFr: "Medium", price: 300, maxRegenerations: 0, maxPhotos: 1, variations: 1, offered: false },
  premium: { key: "premium", labelFr: "Standard", price: 750, maxRegenerations: 0, maxPhotos: 1, variations: 1, offered: true },
  gold: { key: "gold", labelFr: "Advanced", price: 1500, maxRegenerations: 0, maxPhotos: 3, variations: 2, offered: true },
};

export const OFFERED_TIERS: Tier[] = (Object.keys(TIERS) as Tier[]).filter((k) => TIERS[k].offered);

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier as Tier] ?? TIERS.basic;
}
