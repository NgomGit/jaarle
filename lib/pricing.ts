export type Tier = "basic" | "medium" | "premium";

export interface TierConfig {
  key: Tier;
  labelFr: string;
  price: number;
  maxRegenerations: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  basic: { key: "basic", labelFr: "Basique", price: 100, maxRegenerations: 0 },
  medium: { key: "medium", labelFr: "Medium", price: 250, maxRegenerations: 0 },
  premium: { key: "premium", labelFr: "Premium", price: 350, maxRegenerations: 3 },
};

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier as Tier] ?? TIERS.basic;
}
