// Suivi des crédits (admin) : calculs purs à partir de credit_ledger + usage_events.
// Aucune migration : tout est lu avec la clé service_role puis agrégé ici.

export type LedgerKind = "purchase" | "generation" | "bonus" | "refund" | "promotion" | "expiration" | "admin";

export interface LedgerRow {
  id: string;
  user_id: string;
  delta: number;
  kind: string;
  usage_event_id: string | null;
  order_id: string | null;
  note: string | null;
  created_at: string;
}

export interface UsageRow {
  id: string;
  action: string;
  units: number;
  creation_id: string | null;
  refund_of: string | null;
}

export interface CreditPack {
  key: string;
  name: string;
  credits: number;
  price_fcfa: number;
}

export interface UserCredits {
  userId: string;
  bought: number; // achats
  offered: number; // admin (+), bonus, promo
  used: number; // générations (valeur positive)
  refunded: number; // générations échouées remboursées
  expired: number; // expirations (valeur positive)
  removed: number; // retraits admin (valeur positive)
  balance: number;
  postersViaCredits: number; // affiches payées en crédits (hors remboursées)
  lastAt: string;
}

export const KIND_LABELS: Record<string, string> = {
  purchase: "Achat",
  generation: "Génération",
  bonus: "Bonus",
  refund: "Remboursement",
  promotion: "Promo",
  expiration: "Expiration",
  admin: "Admin",
};

export const ACTION_LABELS: Record<string, string> = {
  poster_generate: "Nouvelle affiche",
  poster_unlock: "Déblocage d'affiche",
  poster_regenerate: "Nouvelle version",
  poster_declination: "Déclinaison",
  studio_pack: "Pack Studio",
  studio_regenerate: "Régénération Studio",
  product_autofill: "Fiche produit IA",
};

/** Ce qu'un pack permet réellement : nombre d'affiches et crédits restants inutilisables pour une affiche. */
export function packYield(credits: number, posterCost: number): { posters: number; leftover: number } {
  if (posterCost <= 0) return { posters: credits, leftover: 0 };
  return { posters: Math.floor(credits / posterCost), leftover: credits % posterCost };
}

/** Solde > 0 mais insuffisant pour une affiche : le client croit avoir des crédits qu'il ne peut pas utiliser. */
export function isStuckBalance(balance: number, posterCost: number): boolean {
  return balance > 0 && balance < posterCost;
}

/** Agrège le grand livre par client (toutes périodes : les soldes doivent être complets). */
export function aggregateByUser(ledger: LedgerRow[], events: Map<string, UsageRow>): UserCredits[] {
  const byUser = new Map<string, UserCredits>();
  // Événements de consommation remboursés (le remboursement est un usage_event avec refund_of).
  const refundedEvents = new Set<string>();
  events.forEach((e) => {
    if (e.refund_of) refundedEvents.add(e.refund_of);
  });

  for (const r of ledger) {
    let u = byUser.get(r.user_id);
    if (!u) {
      u = { userId: r.user_id, bought: 0, offered: 0, used: 0, refunded: 0, expired: 0, removed: 0, balance: 0, postersViaCredits: 0, lastAt: r.created_at };
      byUser.set(r.user_id, u);
    }
    u.balance += r.delta;
    if (r.created_at > u.lastAt) u.lastAt = r.created_at;
    switch (r.kind) {
      case "purchase":
        u.bought += r.delta;
        break;
      case "bonus":
      case "promotion":
        u.offered += r.delta;
        break;
      case "admin":
        if (r.delta > 0) u.offered += r.delta;
        else u.removed += -r.delta;
        break;
      case "generation": {
        u.used += -r.delta;
        const ev = r.usage_event_id ? events.get(r.usage_event_id) : undefined;
        if (ev && (ev.action === "poster_generate" || ev.action === "poster_unlock") && !refundedEvents.has(ev.id)) u.postersViaCredits += 1;
        break;
      }
      case "refund":
        u.refunded += r.delta;
        break;
      case "expiration":
        u.expired += -r.delta;
        break;
    }
  }
  return Array.from(byUser.values());
}

export interface PeriodTotals {
  bought: number;
  offered: number;
  used: number;
  refunded: number;
  expired: number;
  removed: number;
  buyers: number;
}

/** Totaux des mouvements depuis `sinceIso` (null = depuis le début). */
export function periodTotals(ledger: LedgerRow[], sinceIso: string | null): PeriodTotals {
  const t: PeriodTotals = { bought: 0, offered: 0, used: 0, refunded: 0, expired: 0, removed: 0, buyers: 0 };
  const buyers = new Set<string>();
  for (const r of ledger) {
    if (sinceIso && r.created_at < sinceIso) continue;
    if (r.kind === "purchase") {
      t.bought += r.delta;
      buyers.add(r.user_id);
    } else if (r.kind === "bonus" || r.kind === "promotion" || (r.kind === "admin" && r.delta > 0)) t.offered += r.delta;
    else if (r.kind === "admin") t.removed += -r.delta;
    else if (r.kind === "generation") t.used += -r.delta;
    else if (r.kind === "refund") t.refunded += r.delta;
    else if (r.kind === "expiration") t.expired += -r.delta;
  }
  t.buyers = buyers.size;
  return t;
}
