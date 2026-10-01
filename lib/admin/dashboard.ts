// Données du tableau de bord admin (fonction SQL admin_dashboard, migration 0025) + formatages.
// Utilisable côté client et serveur (aucun appel réseau ici).

export interface DayPoint {
  date: string; // AAAA-MM-JJ
  signups: number;
  shops_published: number;
  posters: number;
  contacts: number;
  visits: number;
  orders: number;
  orders_value: number;
  revenue: number;
}

export interface AdminDashboard {
  days: number;
  since: string;
  series: DayPoint[];
  previous: Record<"signups" | "shops_published" | "posters" | "contacts" | "visits" | "orders" | "revenue", number>;
  funnel: Record<"accounts" | "shop" | "published" | "stocked" | "contacted" | "paid", number>;
  sources: { source: string; count: number }[];
  top_shops: { id: string; name: string; slug: string; city: string | null; contacts: number; visits: number; orders: number }[];
  cities: { city: string; count: number }[];
  market: Record<"listed_shops" | "visible_items" | "visits" | "contacts", number>;
  orders: Record<"count" | "value" | "avg_value" | "avg_items" | "shops", number>;
}

export type MetricFormat = "int" | "fcfa";

const nf = new Intl.NumberFormat("fr-FR");
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

/** Espaces fines insécables → espaces normaux (rendu identique partout). */
const clean = (s: string) => s.replace(/[  ]/g, " ");

export function formatValue(n: number, format: MetricFormat = "int", short = false): string {
  const v = Math.round(Number(n) || 0);
  // Abrégé (12,9 k) au-delà de 10 000 ; les montants en FCFA restent entiers jusqu'au million.
  const num = short && Math.abs(v) >= (format === "fcfa" ? 1_000_000 : 10_000) ? compact.format(v) : nf.format(v);
  return clean(format === "fcfa" ? `${num} FCFA` : num);
}

export function sumOf(series: DayPoint[], key: keyof Omit<DayPoint, "date">): number {
  return series.reduce((n, d) => n + (Number(d[key]) || 0), 0);
}

/** Variation en % entre la période et la précédente ; null si rien à comparer. */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${d} ${months.at(m - 1)}`;
}

export const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct / inconnue",
  wa: "Lien partagé sur WhatsApp",
  qr: "QR code",
  ig: "Instagram",
  fb: "Facebook",
  tt: "TikTok",
  share: "Bouton partager",
  poster: "Affiche",
  card: "Carte de visite",
  market: "Jaarle Market",
  cart: "Panier",
};
