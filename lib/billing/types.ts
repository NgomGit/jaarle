// Types partagés (client + serveur) de la monétisation.

export type PlanKey = "free" | "pro" | "business";
export type AnalyticsLevel = "basic" | "advanced";

export type UsageAction =
  | "poster_generate"
  | "poster_regenerate"
  | "poster_declination"
  | "poster_unlock"
  | "studio_pack"
  | "studio_regenerate"
  | "product_autofill";

export type UsageSource = "quota" | "credits" | "included" | "legacy";

/**
 * Droits de l'utilisateur à un instant donné. Calculés en UN seul endroit (SQL
 * `billing_entitlements` + `lib/billing/entitlements.ts`) : le reste du code lit ces champs au lieu
 * de tester le nom du plan.
 */
export interface Entitlements {
  /** false tant que la migration 0019 n'est pas appliquée : aucun blocage (comportement historique). */
  billingEnabled: boolean;
  plan: PlanKey;
  planName: string;
  priceFcfa: number;
  productsLimit: number | null; // null = illimité
  productsCount: number;
  monthlyGenerations: number | null; // null = illimité
  usedGenerations: number;
  remainingGenerations: number | null;
  credits: number;
  watermark: boolean; // affiches filigranées tant qu'elles ne sont pas débloquées
  brandingBadge: boolean; // mention « Créé avec Jaarle » (boutique, visuels du Studio)
  analyticsLevel: AnalyticsLevel;
  marketingFeatures: { studio: boolean; contentCalendar: boolean; reports: boolean };
  posterUnlockIncluded: boolean; // affiches débloquées sans paiement à l'unité
  prioritySupport: boolean;
  subscription: { startsAt: string; endsAt: string; activeUntil: string; source: string } | null;
  periodStart: string | null;
  periodEnd: string | null;
  isFounding: boolean;
  isAdmin: boolean;
  referralCode: string | null;
}

/** Réponse standard d'une API quand une limite du plan est atteinte (affiche l'offre Pro). */
export interface LimitReachedPayload {
  error: "limit_reached";
  limit: "generations" | "products" | "analytics" | "feature";
  message: string;
}

export interface PlanRow {
  key: PlanKey;
  name: string;
  tagline: string | null;
  price_fcfa: number;
  period_days: number;
  sort: number;
  is_public: boolean;
  is_purchasable: boolean;
  limits: { products?: number | null; monthly_generations?: number | null };
  features: Record<string, unknown>;
  highlights: string[];
}

export interface CreditPackRow {
  key: string;
  name: string;
  credits: number;
  price_fcfa: number;
  expires_days: number | null;
  sort: number;
}

export interface PublicPromotion {
  name: string;
  description: string | null;
  plan_key: PlanKey;
  promo_price_fcfa: number;
  duration_periods: number;
  ends_at: string | null;
  spots_left: number | null;
  code: string | null;
}
