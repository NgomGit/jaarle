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
  premium: { key: "premium", labelFr: "Standard", price: 750, maxRegenerations: 0, maxPhotos: 1, variations: 1 },
  gold: { key: "gold", labelFr: "Advanced", price: 1500, maxRegenerations: 0, maxPhotos: 3, variations: 2 },
};

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier as Tier] ?? TIERS.premium;
}
