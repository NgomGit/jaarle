// Coûts IA (admin) : calculs purs à partir de ai_calls + subscriptions + plans.
// Aucune migration : la page lit ces tables avec la clé service_role puis agrège ici.
// Chaque appel est rattaché à la formule ACTIVE AU MOMENT de l'appel (même règle que
// billing_entitlements, migration 0039 : formule la plus haute, puis la plus longue).

/** Taux de conversion utilisé pour l'affichage en FCFA (modifiable via AI_COST_FCFA_PER_USD). */
export const DEFAULT_FCFA_PER_USD = 600;

export function fcfaPerUsd(): number {
  const v = Number(process.env.AI_COST_FCFA_PER_USD);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_FCFA_PER_USD;
}

export interface AiCallRow {
  user_id: string | null;
  feature: string;
  model: string | null;
  est_cost_usd: number | string;
  created_at: string;
}

export interface SubRow {
  user_id: string;
  plan_key: string;
  status: string;
  starts_at: string;
  ends_at: string;
}

export interface PlanRow {
  key: string;
  name: string;
  price_fcfa: number;
  sort: number;
}

export const FEATURE_LABELS: Record<string, string> = {
  poster_generate: "Nouvelle affiche",
  poster_regenerate: "Nouvelle version d'affiche",
  poster_declination: "Déclinaison d'affiche",
  poster_unlock: "Déblocage d'affiche",
  studio_pack: "Pack Studio",
  studio_regenerate: "Studio : nouvelle variante",
  product_autofill: "Fiche produit (photo → texte)",
  bulk_group: "Import en lot : regroupement",
  bulk_suggest: "Import en lot : fiches produit",
  bulk_verify: "Import en lot : 2e vérification",
};

/** Formule active pour un utilisateur à une date (formule la plus haute, puis la plus longue). */
export function planAt(subs: SubRow[] | undefined, plans: Map<string, PlanRow>, at: string): string {
  let best: { key: string; sort: number; ends: string } | null = null;
  for (const s of subs ?? []) {
    if (s.status !== "active" || s.starts_at > at || s.ends_at <= at) continue;
    const sort = plans.get(s.plan_key)?.sort ?? 0;
    if (!best || sort > best.sort || (sort === best.sort && s.ends_at > best.ends)) best = { key: s.plan_key, sort, ends: s.ends_at };
  }
  return best?.key ?? "free";
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export interface UserCost {
  userId: string;
  /** Formule de la majorité du coût sur la période. */
  plan: string;
  calls: number;
  costUsd: number;
  topFeature: string;
  lastAt: string;
}

export interface PlanCost {
  plan: string;
  /** Vendeurs ayant au moins un appel IA sur la période, sous cette formule. */
  activeUsers: number;
  calls: number;
  totalUsd: number;
  avgUsd: number;
  medianUsd: number;
  p90Usd: number;
  maxUsd: number;
}

export interface FeatureCost {
  feature: string;
  calls: number;
  totalUsd: number;
  avgPerCallUsd: number;
}

export interface AiCostSummary {
  totalUsd: number;
  calls: number;
  usersWithCalls: number;
  /** Appels sans utilisateur (tâches système, comptes supprimés). */
  anonymousUsd: number;
  byPlan: PlanCost[];
  byUser: UserCost[];
  byFeature: FeatureCost[];
}

const num = (v: number | string) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function aggregateAiCosts(calls: AiCallRow[], subsByUser: Map<string, SubRow[]>, plans: Map<string, PlanRow>): AiCostSummary {
  // (plan, user) → coût ; user → détail.
  const perPlanUser = new Map<string, Map<string, { calls: number; cost: number }>>();
  const users = new Map<string, { calls: number; cost: number; byPlan: Map<string, number>; byFeature: Map<string, number>; lastAt: string }>();
  const features = new Map<string, { calls: number; cost: number }>();
  let totalUsd = 0;
  let anonymousUsd = 0;

  for (const c of calls) {
    const cost = num(c.est_cost_usd);
    totalUsd += cost;
    const f = features.get(c.feature) ?? { calls: 0, cost: 0 };
    f.calls++;
    f.cost += cost;
    features.set(c.feature, f);
    if (!c.user_id) {
      anonymousUsd += cost;
      continue;
    }
    const plan = planAt(subsByUser.get(c.user_id), plans, c.created_at);
    const byUser = perPlanUser.get(plan) ?? new Map();
    const pu = byUser.get(c.user_id) ?? { calls: 0, cost: 0 };
    pu.calls++;
    pu.cost += cost;
    byUser.set(c.user_id, pu);
    perPlanUser.set(plan, byUser);

    const u = users.get(c.user_id) ?? { calls: 0, cost: 0, byPlan: new Map(), byFeature: new Map(), lastAt: c.created_at };
    u.calls++;
    u.cost += cost;
    u.byPlan.set(plan, (u.byPlan.get(plan) ?? 0) + cost);
    u.byFeature.set(c.feature, (u.byFeature.get(c.feature) ?? 0) + cost);
    if (c.created_at > u.lastAt) u.lastAt = c.created_at;
    users.set(c.user_id, u);
  }

  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";

  const byPlan: PlanCost[] = [...perPlanUser.entries()]
    .map(([plan, m]) => {
      const costs = [...m.values()].map((v) => v.cost).sort((a, b) => a - b);
      const total = costs.reduce((a, b) => a + b, 0);
      return {
        plan,
        activeUsers: costs.length,
        calls: [...m.values()].reduce((a, v) => a + v.calls, 0),
        totalUsd: total,
        avgUsd: costs.length ? total / costs.length : 0,
        medianUsd: percentile(costs, 50),
        p90Usd: percentile(costs, 90),
        maxUsd: costs[costs.length - 1] ?? 0,
      };
    })
    .sort((a, b) => (plans.get(b.plan)?.sort ?? 0) - (plans.get(a.plan)?.sort ?? 0));

  const byUser: UserCost[] = [...users.entries()]
    .map(([userId, u]) => ({ userId, plan: top(u.byPlan), calls: u.calls, costUsd: u.cost, topFeature: top(u.byFeature), lastAt: u.lastAt }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const byFeature: FeatureCost[] = [...features.entries()]
    .map(([feature, f]) => ({ feature, calls: f.calls, totalUsd: f.cost, avgPerCallUsd: f.calls ? f.cost / f.calls : 0 }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return { totalUsd, calls: calls.length, usersWithCalls: users.size, anonymousUsd, byPlan, byUser, byFeature };
}

/** Coût ramené à 30 jours (pour comparer au prix mensuel d'une formule). */
export function per30Days(usd: number, days: number): number {
  return days > 0 ? (usd * 30) / days : usd;
}

/** Part du prix de la formule consommée en coût IA (null si formule gratuite). */
export function shareOfPrice(usdPer30Days: number, priceFcfa: number, rate = DEFAULT_FCFA_PER_USD): number | null {
  if (!priceFcfa) return null;
  return (usdPer30Days * rate) / priceFcfa;
}

/** Niveau d'alerte d'une part du prix : < 50 % ok, 50-100 % attention, ≥ 100 % perte. */
export function shareLevel(share: number | null): "ok" | "warn" | "loss" | "none" {
  if (share == null) return "none";
  if (share >= 1) return "loss";
  if (share >= 0.5) return "warn";
  return "ok";
}
