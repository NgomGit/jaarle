export type Tier = "basic" | "medium" | "premium";

export interface TierConfig {
  key: Tier;
  labelFr: string;
  price: number;
  maxRegenerations: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  basic: { key: "basic", labelFr: "Basique", price: 750, maxRegenerations: 0 },
  medium: { key: "medium", labelFr: "Medium", price: 2000, maxRegenerations: 0 },
  premium: { key: "premium", labelFr: "Premium", price: 3000, maxRegenerations: 1 },
};

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier as Tier] ?? TIERS.basic;
}
