// Formatages et calculs purs (client + serveur).
import type { Entitlements } from "@/lib/billing/types";

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Dakar" });
}

/** Peut-on dépenser `units` générations (quota du mois, puis crédits) ? */
export function canSpend(ent: Entitlements, units: number, sources: ("quota" | "credits")[] = ["quota", "credits"]): boolean {
  if (!ent.billingEnabled || units <= 0) return true;
  const quotaOk = sources.includes("quota") && (ent.remainingGenerations == null || ent.remainingGenerations >= units);
  const creditsOk = sources.includes("credits") && ent.credits >= units;
  return quotaOk || creditsOk;
}

export function canAddProduct(ent: Entitlements): boolean {
  return !ent.billingEnabled || ent.productsLimit == null || ent.productsCount < ent.productsLimit;
}

export const LIMIT_MESSAGES = {
  generations: "Tu as utilisé toutes tes générations de ce mois.",
  products: "Tu as atteint la limite de produits de l'offre gratuite.",
  analytics: "Les statistiques détaillées sont incluses dans Jaarle Pro.",
  feature: "Cette fonction est incluse dans Jaarle Pro.",
} as const;
