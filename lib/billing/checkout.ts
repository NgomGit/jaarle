import { createAdminClient } from "@/lib/supabase/admin";

// Calcul des prix côté serveur (jamais confiance au navigateur) : abonnement avec éventuelle offre
// promotionnelle, ou pack de crédits. Les montants viennent des tables plans / promotions / credit_packs.

export type PlanQuote = {
  ok: true;
  planKey: string;
  price: number;
  regularPrice: number;
  periodDays: number;
  promotionId: string | null;
  promotionName: string | null;
  periodsLeft: number | null;
  promoError: string | null;
};

export const PROMO_ERRORS: Record<string, string> = {
  promo_invalid: "Ce code n'existe pas ou ne s'applique pas à cette offre.",
  promo_expired: "Cette offre est terminée.",
  promo_full: "Toutes les places de cette offre ont été prises.",
  promo_founders_only: "Cette offre est réservée aux premiers commerçants Jaarle.",
  promo_used: "Tu as déjà profité de cette offre.",
};

export async function quotePlan(userId: string, planKey: string, code?: string | null): Promise<PlanQuote | { ok: false; error: string }> {
  const { data, error } = await createAdminClient().rpc("billing_quote_plan", { p_user: userId, p_plan: planKey, p_code: code ?? null });
  if (error || !data) return { ok: false, error: "Offre indisponible pour le moment." };
  const q = data as {
    ok: boolean;
    error?: string;
    plan_key: string;
    price: number;
    regular_price: number;
    period_days: number;
    promotion_id: string | null;
    promotion_name?: string | null;
    periods_left?: number | null;
    promo_error?: string | null;
  };
  if (!q.ok) return { ok: false, error: q.error === "plan_unavailable" ? "Cette offre n'est pas encore disponible." : "Offre indisponible." };
  return {
    ok: true,
    planKey: q.plan_key,
    price: q.price,
    regularPrice: q.regular_price,
    periodDays: q.period_days,
    promotionId: q.promotion_id,
    promotionName: q.promotion_name ?? null,
    periodsLeft: q.periods_left ?? null,
    promoError: q.promo_error ?? null,
  };
}
