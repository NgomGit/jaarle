import type { MarketCategory } from "@/lib/market/categories";
import type { MarketCity } from "@/lib/market/cities";
import type { MarketItemType, MarketSort, Totals } from "@/lib/market/queries";

// Textes SEO du Market, calculés à partir des VRAIES données de la page (nombre de produits,
// de boutiques, prix minimum) : deux pages ne partagent jamais la même description.

export interface ListingParams {
  page: number;
  sort: MarketSort;
  min: number | null;
  max: number | null;
  /** Filtre « Produits » / « Services » (?type=produits|services). */
  type: MarketItemType | null;
  /** Seulement les annonces disponibles (?dispo=1). */
  available: boolean;
  /** Seulement les produits en promo (?promo=1, migration 0046). */
  promo: boolean;
  /** Tri, filtre de prix ou de type actif : la page n'est pas indexée (canonique vers la version sans filtre). */
  filtered: boolean;
}

const SORTS: MarketSort[] = ["relevance", "new", "price_asc", "price_desc", "promo"];

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
  const rawType = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const type: MarketItemType | null = rawType === "services" ? "service" : rawType === "produits" ? "product" : null;
  const available = (Array.isArray(sp.dispo) ? sp.dispo[0] : sp.dispo) === "1";
  const promo = (Array.isArray(sp.promo) ? sp.promo[0] : sp.promo) === "1";
  return { page, sort, min, max, type, available, promo, filtered: sort !== "relevance" || min != null || max != null || type != null || available || promo };
}

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

/**
 * Ce que montre une page de liste, pour en choisir le vocabulaire : des produits (par défaut), des
 * prestations (secteurs Services et Événementiel) ou des annonces (Immobilier). Le filtre ?type=
 * l'emporte quand il est posé. Restauration : plats et boissons → vocabulaire « produits ».
 */
export type ListingKind = "produit" | "prestation" | "annonce";

const SERVICE_SECTORS = new Set(["services", "evenementiel"]);
const CLASSIFIED_SECTORS = new Set(["immobilier"]);

export function listingKind(category: MarketCategory | null, type: MarketItemType | null = null): ListingKind {
  if (type) return type === "service" ? "prestation" : "produit";
  if (category && SERVICE_SECTORS.has(category.industrySlug)) return "prestation";
  if (category && CLASSIFIED_SECTORS.has(category.industrySlug)) return "annonce";
  return "produit";
}

const VOCAB: Record<
  ListingKind,
  { one: string; many: string; none: string; offered: string; seller: [string, string]; tail: string; emptyTail: string; all: string; place: (city: string) => string; country: string }
> = {
  produit: {
    one: "produit", many: "produits", none: "Aucun produit", offered: "proposés", seller: ["boutique", "boutiques"],
    tail: "Prix en FCFA et commande directe sur WhatsApp.", emptyTail: "Les boutiques ajoutent régulièrement de nouveaux articles.",
    all: "Tous les produits", place: (c) => `Acheter à ${c}`, country: "Produits des boutiques du Sénégal",
  },
  prestation: {
    one: "prestation", many: "prestations", none: "Aucune prestation", offered: "proposées", seller: ["prestataire", "prestataires"],
    tail: "Tarifs en FCFA et réservation directe sur WhatsApp.", emptyTail: "Les prestataires ajoutent régulièrement de nouvelles prestations.",
    all: "Tous les services", place: (c) => `Services à ${c}`, country: "Services au Sénégal",
  },
  annonce: {
    one: "annonce", many: "annonces", none: "Aucune annonce", offered: "publiées", seller: ["annonceur", "annonceurs"],
    tail: "Prix en FCFA et contact direct sur WhatsApp.", emptyTail: "De nouvelles annonces sont publiées régulièrement.",
    all: "Toutes les annonces", place: (c) => `Annonces à ${c}`, country: "Annonces au Sénégal",
  },
};

export function listingH1(category: MarketCategory | null, city: MarketCity | null, type: MarketItemType | null = null): string {
  const v = VOCAB[listingKind(category, type)];
  if (category && city) return `${category.label} à ${city.name}`;
  if (category) return category.label;
  if (city) return v.place(city.name);
  return v.all;
}

export function listingTitle(category: MarketCategory | null, city: MarketCity | null, t: Totals, type: MarketItemType | null = null): string {
  const kind = listingKind(category, type);
  const v = VOCAB[kind];
  const place = city ? `à ${city.name}` : "au Sénégal";
  const cityBase = kind === "produit" ? `Boutiques et produits à ${city?.name}` : v.place(city?.name ?? "");
  const base = category ? `${category.label} ${place}` : city ? cityBase : v.country;
  const detail = t.products >= 2 ? ` — ${plural(t.products, v.one, v.many)}${t.minPrice != null ? ` dès ${fcfa(t.minPrice)}` : ""}` : "";
  return `${base}${detail} | Jaarle Market`;
}

export function listingIntro(category: MarketCategory | null, city: MarketCity | null, t: Totals, type: MarketItemType | null = null): string {
  const v = VOCAB[listingKind(category, type)];
  if (t.products === 0) {
    return `${v.none} pour le moment${category ? ` dans « ${category.label} »` : ""}${city ? ` à ${city.name}` : ""}. ${v.emptyTail}`;
  }
  const what = category ? ` dans la catégorie « ${category.label} »` : "";
  const where = city ? ` à ${city.name}` : " au Sénégal";
  const price = t.minPrice != null ? `, à partir de ${fcfa(t.minPrice)}` : "";
  return `${plural(t.products, v.one, v.many)}${what} ${v.offered} par ${plural(t.shops, v.seller[0], v.seller[1])}${where}${price}. ${v.tail}`;
}

export function listingDescription(category: MarketCategory | null, city: MarketCity | null, t: Totals, type: MarketItemType | null = null): string {
  return listingIntro(category, city, t, type).slice(0, 158);
}

/** Titre de la section de texte sous la liste (« Acheter : robes à Dakar »…). */
export function listingSectionTitle(category: MarketCategory | null, city: MarketCity | null, type: MarketItemType | null = null): string {
  const kind = listingKind(category, type);
  const label = category?.label.toLowerCase();
  const inCity = city ? ` à ${city.name}` : "";
  if (kind === "prestation") return label ? `Réserver : ${label}${inCity}` : `Réserver ${city ? `à ${city.name}` : "partout au Sénégal"}`;
  if (kind === "annonce") return label ? `Annonces : ${label}${inCity}` : `Annonces ${city ? `à ${city.name}` : "au Sénégal"}`;
  return label ? `Acheter : ${label}${inCity}` : `Commander à ${city?.name ?? "travers le Sénégal"}`;
}

/** Liste vide : avec des filtres actifs, ou sélection encore vide. */
export function listingEmptyText(category: MarketCategory | null, filtered: boolean, type: MarketItemType | null = null): string {
  const kind = listingKind(category, type);
  if (kind === "prestation") return filtered ? "Aucune prestation ne correspond à ces filtres." : "Les prestataires n’ont pas encore de prestation dans cette sélection.";
  if (kind === "annonce") return filtered ? "Aucune annonce ne correspond à ces filtres." : "Aucune annonce n’est encore publiée dans cette sélection.";
  return filtered ? "Aucun produit ne correspond à ces filtres." : "Les boutiques n’ont pas encore de produit dans cette sélection.";
}

export function listingFaq(category: MarketCategory | null, city: MarketCity | null, type: MarketItemType | null = null): { q: string; a: string }[] {
  const kind = listingKind(category, type);
  if (kind === "prestation") {
    return [
      {
        q: `Comment réserver ${category ? `une prestation dans « ${category.label} »` : "une prestation"} sur Jaarle Market ?`,
        a: "Ouvrez la fiche de la prestation puis touchez « Réserver sur WhatsApp » : un message prêt à envoyer part vers le prestataire, avec la prestation et son lien. Vous convenez ensemble de la date et du tarif.",
      },
      {
        q: "Le paiement se fait-il sur le site ?",
        a: "Non. Jaarle Market n'encaisse rien : le tarif, le rendez-vous et le paiement se conviennent directement avec le prestataire.",
      },
      {
        q: `Où se trouvent les prestataires${city ? ` à ${city.name}` : ""} ?`,
        a: `Chaque fiche indique la ville et le quartier du prestataire. Demandez-lui s'il se déplace${city ? ` à ${city.name}` : ""} ou s'il vous reçoit sur place.`,
      },
      {
        q: "Qui peut proposer ses services sur Jaarle Market ?",
        a: "Les prestataires inscrits sur Jaarle qui ont assez d’annonces avec photo ou affiche ; les comptes Pro portent le badge PRO et passent en tête. Jaarle ne contrôle pas chaque prestation : en cas de problème, utilisez le bouton « Signaler ».",
      },
    ];
  }
  if (kind === "annonce") {
    return [
      {
        q: `Comment contacter l'annonceur ${category ? `d'une annonce « ${category.label} »` : "d'une annonce"} sur Jaarle Market ?`,
        a: "Ouvrez l'annonce puis touchez le bouton WhatsApp : un message prêt à envoyer part vers l'annonceur, avec l'annonce et son lien.",
      },
      {
        q: "Le paiement se fait-il sur le site ?",
        a: "Non. Jaarle Market n'encaisse rien et n'organise pas de visite : visitez le bien et vérifiez les documents avant tout versement.",
      },
      {
        q: `Où se trouvent les biens${city ? ` à ${city.name}` : ""} ?`,
        a: "Chaque annonce indique la ville et le quartier de l'annonceur. Demandez-lui l'adresse exacte du bien et ses disponibilités pour une visite.",
      },
      {
        q: "Qui peut publier sur Jaarle Market ?",
        a: "Les comptes Jaarle qui ont assez d’annonces avec photo ; les comptes Pro portent le badge PRO et passent en tête. Jaarle ne contrôle pas chaque annonce : en cas de problème, utilisez le bouton « Signaler ».",
      },
    ];
  }
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
      a: "Les boutiques Jaarle qui ont assez d’annonces avec photo ; les boutiques Pro portent le badge PRO et passent en tête. Jaarle ne contrôle pas chaque produit : en cas de problème, utilisez le bouton « Signaler » de la boutique.",
    },
  ];
}

export function sortLabel(s: MarketSort): string {
  return { relevance: "Pertinence", new: "Nouveautés", price_asc: "Prix croissant", price_desc: "Prix décroissant", promo: "Meilleures remises" }[s];
}
