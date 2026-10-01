// Motifs de signalement — garder synchronisé avec shop_reports_reason_check (migration 0020).
export const REPORT_REASONS = [
  { key: "scam", label: "Arnaque ou tentative de fraude" },
  { key: "unreachable", label: "Commande non honorée ou vendeur injoignable" },
  { key: "counterfeit", label: "Contrefaçon" },
  { key: "misleading", label: "Photos, description ou prix trompeurs" },
  { key: "prohibited", label: "Produit interdit ou dangereux" },
  { key: "offensive", label: "Contenu choquant ou inapproprié" },
  { key: "other", label: "Autre raison" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["key"];
