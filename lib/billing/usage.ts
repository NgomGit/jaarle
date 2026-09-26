import type { UsageAction } from "@/lib/billing/types";

// Coût, en « générations », de chaque action IA. Centralisé ici : modifier une valeur suffit.
// 0 = inclus (pas décompté du quota, mais le coût IA est tout de même mesuré dans ai_calls).
const UNITS: Record<UsageAction, number | Record<string, number>> = {
  poster_generate: { premium: 1, gold: 2 }, // une affiche Gold (4 photos, 2 déclinaisons) coûte plus cher
  poster_unlock: { premium: 1, gold: 2 }, // débloquer une ancienne affiche avec l'abonnement / des crédits
  poster_regenerate: 0, // retouches incluses dans l'affiche (limitées par palier)
  poster_declination: 0,
  studio_pack: 1, // un pack = 5 réseaux × 3 variantes
  studio_regenerate: 0, // plafonné par réseau (lib/studio/access.ts)
  product_autofill: 0,
};

export function usageUnits(action: UsageAction, tier?: string | null): number {
  const v = UNITS[action];
  if (typeof v === "number") return v;
  return v[tier ?? "premium"] ?? v.premium ?? 1;
}

// Estimations de coût IA en dollars (à ajuster avec les factures réelles). Les appels Anthropic du
// Studio et de la fiche produit sont mesurés au token près ; le pipeline d'affiche (image
// gpt-image-2 via OpenRouter + plusieurs appels Claude) est estimé forfaitairement.
export const AI_COST_ESTIMATES_USD = {
  poster_generate: { premium: 0.12, gold: 0.2 },
  poster_regenerate: 0.1,
  poster_declination: 0.1,
} as const;

/** Prix par million de tokens (entrée / sortie), en dollars. */
export const MODEL_PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
};

export function tokenCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES_PER_MTOK[model] ?? { input: 3, output: 15 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
