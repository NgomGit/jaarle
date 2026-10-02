import type { LucideIcon } from "lucide-react";
import { categoryTree } from "@/lib/knowledge/category-tree";
import { MARKET_CITIES } from "@/lib/market/cities";

// Catégories du Market, dérivées de l'arbre existant (lib/knowledge/category-tree.ts) :
//   niveau 1 = secteur (mode, beaute…), niveau 2 = sous-catégorie, niveau 3 = feuille.
// La valeur stockée sur un produit (products.market_category) est TOUJOURS une clé de feuille.
// Chaque niveau a sa page /market/{slug} ; les slugs sont uniques (collision = entrée ignorée).

/** Secteurs ouverts au Market — garder synchronisé avec market_shop_ids() (migrations 0029 / 0030). */
export const MARKET_INDUSTRIES: { industryKey: string; slug: string; label: string; tone: string }[] = [
  { industryKey: "fashion", slug: "mode", label: "Mode & tenues", tone: "#F1E4D6" },
  { industryKey: "beauty", slug: "beaute", label: "Beauté & parfums", tone: "#F3DEDF" },
  { industryKey: "grocery", slug: "epicerie", label: "Épicerie", tone: "#EFE6C9" },
  { industryKey: "agriculture", slug: "terroir", label: "Produits du terroir", tone: "#E1E8DE" },
  { industryKey: "poissonnerie", slug: "produits-de-la-mer", label: "Produits de la mer", tone: "#DDE6EE" },
  { industryKey: "furniture", slug: "maison-deco", label: "Maison & déco", tone: "#E9DDD2" },
  { industryKey: "electronics", slug: "electronique", label: "Électronique", tone: "#E7E2F3" },
  { industryKey: "artisanat", slug: "artisanat", label: "Artisanat", tone: "#F4E3D0" },
  // Véhicules, pièces & accessoires auto, location de voitures (migration 0030)
  { industryKey: "automotive", slug: "auto-moto", label: "Auto & moto", tone: "#E2E5EA" },
  // Services (affichés avec leur affiche)
  { industryKey: "services", slug: "services", label: "Services & artisans", tone: "#DDEBE3" },
  { industryKey: "events", slug: "evenementiel", label: "Événementiel", tone: "#EDE2F1" },
  { industryKey: "restaurant", slug: "restauration", label: "Restauration & traiteur", tone: "#F6E1D3" },
  { industryKey: "real-estate", slug: "immobilier", label: "Immobilier & locations", tone: "#E0E6EF" },
];

export interface MarketCategory {
  slug: string;
  label: string;
  level: 1 | 2 | 3;
  industrySlug: string;
  parentSlug: string | null;
  /** Clés de feuilles (products.market_category) couvertes par cette page. */
  leafKeys: string[];
  childSlugs: string[];
  icon: LucideIcon | null;
  tone: string;
}

const RESERVED = new Set(["recherche", ...MARKET_CITIES.map((c) => c.slug)]);

function build(): Map<string, MarketCategory> {
  const map = new Map<string, MarketCategory>();
  const add = (c: MarketCategory) => {
    if (map.has(c.slug) || RESERVED.has(c.slug)) return false;
    map.set(c.slug, c);
    return true;
  };
  for (const ind of MARKET_INDUSTRIES) {
    const node = categoryTree.find((n) => n.industryKey === ind.industryKey);
    if (!node) continue;
    const root: MarketCategory = {
      slug: ind.slug, label: ind.label, level: 1, industrySlug: ind.slug, parentSlug: null,
      leafKeys: [], childSlugs: [], icon: node.icon, tone: ind.tone,
    };
    if (!add(root)) continue;
    for (const sub of node.subCategories) {
      const subCat: MarketCategory = {
        slug: sub.key, label: sub.label, level: 2, industrySlug: ind.slug, parentSlug: ind.slug,
        leafKeys: [], childSlugs: [], icon: node.icon, tone: ind.tone,
      };
      const subAdded = add(subCat);
      if (subAdded) root.childSlugs.push(sub.key);
      for (const leaf of sub.leaves) {
        const leafCat: MarketCategory = {
          slug: leaf.key, label: leaf.label, level: 3, industrySlug: ind.slug, parentSlug: subAdded ? sub.key : ind.slug,
          leafKeys: [leaf.key], childSlugs: [], icon: node.icon, tone: ind.tone,
        };
        if (!add(leafCat)) continue;
        root.leafKeys.push(leaf.key);
        if (subAdded) {
          subCat.leafKeys.push(leaf.key);
          subCat.childSlugs.push(leaf.key);
        }
      }
    }
  }
  return map;
}

const CATEGORIES = build();

export function getMarketCategory(slug: string | null | undefined): MarketCategory | null {
  return (slug && CATEGORIES.get(slug)) || null;
}

export function marketRootCategories(): MarketCategory[] {
  return MARKET_INDUSTRIES.map((i) => CATEGORIES.get(i.slug)).filter((c): c is MarketCategory => !!c);
}

export function allMarketCategories(): MarketCategory[] {
  return [...CATEGORIES.values()];
}

/** Chemin de la racine à la catégorie (fil d'Ariane). */
export function categoryTrail(cat: MarketCategory): MarketCategory[] {
  const trail: MarketCategory[] = [];
  let cur: MarketCategory | null = cat;
  while (cur) {
    trail.unshift(cur);
    cur = getMarketCategory(cur.parentSlug);
  }
  return trail;
}

/** Feuilles proposées au vendeur pour classer un produit (groupées par secteur / sous-catégorie). */
export function marketLeafOptions(): { group: string; options: { key: string; label: string }[] }[] {
  const groups: { group: string; options: { key: string; label: string }[] }[] = [];
  for (const root of marketRootCategories()) {
    for (const subSlug of root.childSlugs) {
      const sub = getMarketCategory(subSlug);
      if (!sub) continue;
      groups.push({
        group: `${root.label} — ${sub.label}`,
        options: sub.leafKeys.map((k) => ({ key: k, label: getMarketCategory(k)?.label ?? k })),
      });
    }
  }
  return groups;
}

export function isMarketLeaf(key: string | null | undefined): boolean {
  const c = getMarketCategory(key);
  return !!c && c.level === 3;
}
