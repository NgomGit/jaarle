// Outils partagés des pages admin « Signalements » et « Market & mises en avant » (migration 0026).

export const REPORT_STATUS_LABELS: Record<string, string> = {
  open: "Nouveau",
  reviewing: "En cours",
  dismissed: "Sans suite",
  actioned: "Traité",
};

export const BOOST_PLACEMENTS = [
  { key: "banner", label: "Bannière promotionnelle", hint: "Grand encart en haut du Market (et des pages ciblées)." },
  { key: "spotlight", label: "À la une dans les listes", hint: "L'annonce (ou toute la boutique) passe en tête des listes, marquée « À la une »." },
] as const;

export type BoostPlacement = (typeof BOOST_PLACEMENTS)[number]["key"];

const TZ = "Africa/Dakar";

/** « 30 nov. 2026 » */
export function frDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(new Date(iso));
}

/** « 30 nov. 2026, 14:05 » */
export function frDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

/** Date AAAA-MM-JJ (champ <input type="date">) → début de ce jour (Dakar = UTC). */
export function dayStartIso(day: string): string {
  return `${day}T00:00:00Z`;
}

/** Date AAAA-MM-JJ « jusqu'au … inclus » → début du jour suivant. */
export function dayEndExclusiveIso(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** Inverse de dayEndExclusiveIso : borne exclusive → dernier jour inclus (AAAA-MM-JJ). */
export function inclusiveDayFromExclusive(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export type BoostState = "live" | "scheduled" | "expired" | "paused" | "not_pro";

export const BOOST_STATE_LABELS: Record<BoostState, { label: string; variant: "success" | "accent" | "neutral" | "warning" }> = {
  live: { label: "En ligne", variant: "success" },
  scheduled: { label: "Programmée", variant: "accent" },
  expired: { label: "Terminée", variant: "neutral" },
  paused: { label: "Désactivée", variant: "neutral" },
  not_pro: { label: "Invisible : boutique pas Pro ou hors Market", variant: "warning" },
};

export function boostState(b: { active: boolean; starts_at: string; ends_at: string }, shopIsListedPro: boolean, now = Date.now()): BoostState {
  if (!b.active) return "paused";
  if (new Date(b.ends_at).getTime() <= now) return "expired";
  if (new Date(b.starts_at).getTime() > now) return "scheduled";
  return shopIsListedPro ? "live" : "not_pro";
}

// ── Annonces sans catégorie Market (page admin, étape 3) ──────────────────────

/** Nombre d'annonces affichées dans la liste « à classer » (le total exact est affiché à côté). */
export const UNCATEGORIZED_LIST_LIMIT = 40;

/**
 * Total exact des annonces visibles sur le Market sans catégorie, à partir de market_counts()
 * (mêmes règles que le Market : boutiques présentes + annonces choisies à l'unité, image affichable).
 */
export function uncategorizedTotal(rows: { market_category: string | null; products: number | string }[] | null | undefined): number {
  return (rows ?? []).filter((r) => !r.market_category).reduce((n, r) => n + (Number(r.products) || 0), 0);
}

/**
 * Filtre PostgREST des annonces concernées : boutiques présentes sur le Market OU annonces choisies
 * à l'unité (market_pick_ids). null = aucune annonce possible.
 */
export function marketScopeFilter(listedShopIds: string[], pickedProductIds: string[]): string | null {
  const parts = [
    listedShopIds.length ? `shop_id.in.(${listedShopIds.join(",")})` : null,
    pickedProductIds.length ? `id.in.(${pickedProductIds.join(",")})` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(",") : null;
}

/** Visible sur le Market : un produit avec photo, ou un service (affiche ou photo, vérifiée par le compteur). */
export function isListableOnMarket(p: { subject_type?: string | null; product_images?: unknown[] | null }): boolean {
  return (p.product_images?.length ?? 0) > 0 || p.subject_type === "service";
}

/** Titre de la section : « (N) », ou « (40 affichées sur N) » quand la liste est tronquée. */
export function uncategorizedTitle(total: number, shown: number): string {
  return `Annonces sans catégorie Market (${shown < total ? `${shown} affichées sur ${total}` : total})`;
}
