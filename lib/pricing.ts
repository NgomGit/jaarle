export type Tier = "basic" | "medium" | "premium" | "gold";

export interface TierConfig {
  key: Tier;
  labelFr: string;
  price: number;
  maxRegenerations: number;
  maxPhotos: number;
  variations: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  basic: { key: "basic", labelFr: "Basique", price: 600, maxRegenerations: 0, maxPhotos: 1, variations: 1 },
  medium: { key: "medium", labelFr: "Medium", price: 750, maxRegenerations: 0, maxPhotos: 1, variations: 1 },
  premium: { key: "premium", labelFr: "Premium", price: 2000, maxRegenerations: 0, maxPhotos: 1, variations: 1 },
  gold: { key: "gold", labelFr: "Gold", price: 5000, maxRegenerations: 0, maxPhotos: 3, variations: 2 },
};

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier as Tier] ?? TIERS.basic;
}
