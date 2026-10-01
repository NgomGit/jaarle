import type { MarketCategory } from "@/lib/market/categories";
import type { MarketCity } from "@/lib/market/cities";
import type { MarketSort, Totals } from "@/lib/market/queries";

// Textes SEO du Market, calculés à partir des VRAIES données de la page (nombre de produits,
// de boutiques, prix minimum) : deux pages ne partagent jamais la même description.

export interface ListingParams {
  page: number;
  sort: MarketSort;
  min: number | null;
  max: number | null;
  /** Tri ou filtre de prix actif : la page n'est pas indexée (canonique vers la version sans filtre). */
  filtered: boolean;
}

const SORTS: MarketSort[] = ["relevance", "new", "price_asc", "price_desc"];

function int(v: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function parseListingParams(sp: Record<string, string | string[] | undefined>): ListingParams {
  const rawSort = (Array.isArray(sp.tri) ? sp.tri[0] : sp.tri) as MarketSort | undefined;
  const sort = rawSort && SORTS.includes(rawSort) ? rawSort : "relevance";
  const min = int(sp.min);
  const max = int(sp.max);
  const page = Math.min(Math.max(int(sp.page) ?? 1, 1), 200);
  return { page, sort, min, max, filtered: sort !== "relevance" || min != null || max != null };
}

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

export function listingH1(category: MarketCategory | null, city: MarketCity | null): string {
  if (category && city) return `${category.label} à ${city.name}`;
  if (category) return category.label;
  if (city) return `Acheter à ${city.name}`;
  return "Tous les produits";
}

export function listingTitle(category: MarketCategory | null, city: MarketCity | null, t: Totals): string {
  const place = city ? `à ${city.name}` : "au Sénégal";
  const base = category ? `${category.label} ${place}` : city ? `Boutiques et produits à ${city.name}` : "Produits des boutiques du Sénégal";
  const detail = t.products >= 2 ? ` — ${plural(t.products, "produit", "produits")}${t.minPrice != null ? ` dès ${fcfa(t.minPrice)}` : ""}` : "";
  return `${base}${detail} | Jaarle Market`;
}

export function listingIntro(category: MarketCategory | null, city: MarketCity | null, t: Totals): string {
  if (t.products === 0) {
    return `Aucun produit pour le moment${category ? ` dans « ${category.label} »` : ""}${city ? ` à ${city.name}` : ""}. Les boutiques Pro ajoutent régulièrement de nouveaux articles.`;
  }
  const what = category ? ` dans la catégorie « ${category.label} »` : "";
  const where = city ? ` à ${city.name}` : " au Sénégal";
  const price = t.minPrice != null ? `, à partir de ${fcfa(t.minPrice)}` : "";
  return `${plural(t.products, "produit", "produits")}${what} proposés par ${plural(t.shops, "boutique Pro", "boutiques Pro")}${where}${price}. Prix en FCFA et commande directe sur WhatsApp.`;
}

export function listingDescription(category: MarketCategory | null, city: MarketCity | null, t: Totals): string {
  return listingIntro(category, city, t).slice(0, 158);
}

export function listingFaq(category: MarketCategory | null, city: MarketCity | null): { q: string; a: string }[] {
  const item = category ? category.label.toLowerCase() : "un produit";
  return [
    {
      q: `Comment commander ${category ? `dans « ${category.label} »` : "un produit"} sur Jaarle Market ?`,
      a: "Ouvrez la fiche du produit puis touchez « Commander sur WhatsApp » : un message prêt à envoyer part vers la boutique, avec le produit, son prix et son lien.",
    },
    {
      q: "Le paiement se fait-il sur le site ?",
      a: "Non. Jaarle Market n'encaisse rien : le paiement et la livraison se conviennent directement avec la boutique.",
    },
    {
      q: `Où se trouvent les boutiques${city ? ` à ${city.name}` : ""} ?`,
      a: `Chaque fiche indique la ville et le quartier de la boutique. Demandez-lui les possibilités de retrait ou de livraison${city ? ` à ${city.name}` : ""} pour ${item}.`,
    },
    {
      q: "Qui peut vendre sur Jaarle Market ?",
      a: "Les boutiques avec un abonnement Pro actif. Jaarle ne contrôle pas chaque produit : en cas de problème, utilisez le bouton « Signaler » de la boutique.",
    },
  ];
}

export function sortLabel(s: MarketSort): string {
  return { relevance: "Pertinence", new: "Nouveautés", price_asc: "Prix croissant", price_desc: "Prix décroissant" }[s];
}
