import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalyticsLevel, Entitlements, PlanKey } from "@/lib/billing/types";

// Point d'entrée UNIQUE des droits d'un utilisateur. Tout le reste du code (limites, filigrane,
// statistiques, Studio…) lit l'objet renvoyé ici, jamais le nom du plan directement.

type Raw = {
  plan_key: string;
  plan_name: string;
  price_fcfa: number;
  limits: { products?: number | null; monthly_generations?: number | null };
  features: Record<string, unknown>;
  subscription: { starts_at: string; ends_at: string; active_until: string; source: string } | null;
  period_start: string;
  period_end: string;
  used_generations: number;
  credits: number;
  products_count: number;
  is_founding: boolean;
  is_admin: boolean;
  referral_code: string | null;
};

/** Droits « historiques » si la migration 0019 n'est pas encore appliquée : rien n'est bloqué. */
export const LEGACY_ENTITLEMENTS: Entitlements = {
  billingEnabled: false,
  plan: "free",
  planName: "Gratuit",
  priceFcfa: 0,
  productsLimit: null,
  productsCount: 0,
  monthlyGenerations: null,
  usedGenerations: 0,
  remainingGenerations: null,
  credits: 0,
  watermark: true,
  brandingBadge: false,
  analyticsLevel: "advanced",
  marketingFeatures: { studio: true, contentCalendar: false, reports: false },
  posterUnlockIncluded: false,
  prioritySupport: false,
  subscription: null,
  periodStart: null,
  periodEnd: null,
  isFounding: false,
  isAdmin: false,
  referralCode: null,
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function toEntitlements(raw: Raw): Entitlements {
  const f = raw.features ?? {};
  const monthly = num(raw.limits?.monthly_generations);
  const used = Number(raw.used_generations) || 0;
  return {
    billingEnabled: true,
    plan: (["free", "pro", "business"].includes(raw.plan_key) ? raw.plan_key : "free") as PlanKey,
    planName: raw.plan_name,
    priceFcfa: raw.price_fcfa,
    productsLimit: num(raw.limits?.products),
    productsCount: Number(raw.products_count) || 0,
    monthlyGenerations: monthly,
    usedGenerations: used,
    remainingGenerations: monthly == null ? null : Math.max(monthly - used, 0),
    credits: Number(raw.credits) || 0,
    watermark: bool(f.watermark, true),
    brandingBadge: bool(f.branding_badge, true),
    analyticsLevel: (f.analytics === "advanced" ? "advanced" : "basic") as AnalyticsLevel,
    marketingFeatures: {
      studio: bool(f.studio, true),
      contentCalendar: bool(f.content_calendar, false),
      reports: bool(f.reports, false),
    },
    posterUnlockIncluded: bool(f.poster_unlock_included, false),
    prioritySupport: bool(f.priority_support, false),
    subscription: raw.subscription
      ? {
          startsAt: raw.subscription.starts_at,
          endsAt: raw.subscription.ends_at,
          activeUntil: raw.subscription.active_until ?? raw.subscription.ends_at,
          source: raw.subscription.source,
        }
      : null,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    isFounding: !!raw.is_founding,
    isAdmin: !!raw.is_admin,
    referralCode: raw.referral_code,
  };
}

async function fetchEntitlements(supabase: SupabaseClient): Promise<Entitlements> {
  const { data, error } = await supabase.rpc("get_my_entitlements");
  if (error || !data) {
    if (error && !/get_my_entitlements|function|schema cache/i.test(error.message)) {
      console.error("[billing] get_my_entitlements failed:", error.message);
    }
    return LEGACY_ENTITLEMENTS;
  }
  return toEntitlements(data as Raw);
}

/** Droits de l'utilisateur connecté (mis en cache pour la durée de la requête). */
export const getEntitlements = cache(async (): Promise<Entitlements> => fetchEntitlements(createClient()));

/** Droits d'un utilisateur quelconque (serveur uniquement : webhooks, admin). */
export async function getEntitlementsFor(userId: string): Promise<Entitlements> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return LEGACY_ENTITLEMENTS;
  const { data, error } = await createAdminClient().rpc("billing_entitlements", { p_user: userId });
  if (error || !data) return LEGACY_ENTITLEMENTS;
  return toEntitlements(data as Raw);
}

/**
 * Affiche multi-photos (2-3 photos du produit : références pour le décor + vraies vignettes) :
 * réservée aux offres payantes. Sans facturation active (migration absente), rien n'est bloqué.
 */
export function canUseMultiPhoto(e: Entitlements): boolean {
  return !e.billingEnabled || e.plan !== "free";
}
