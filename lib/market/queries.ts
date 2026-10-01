import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { shopMediaThumbUrl, shopMediaUrl } from "@/lib/shops/media";
import { productPublicUrl } from "@/lib/shops/public";
import { cityFromText } from "@/lib/market/cities";
import { itemPriceLabel, posterUrl } from "@/lib/shops/posters";
import type { MarketCategory } from "@/lib/market/categories";

// Lectures publiques du Market : uniquement via les fonctions SQL de la migration 0020
// (security definer) — les tables d'abonnement et de comptes ne sont jamais lues d'ici.

export const MARKET_PAGE_SIZE = 24;
/**
 * Seuils d'indexation (pas de pages pauvres) :
 *  - catégorie seule (/market/robes) : 8 produits, 1 boutique suffit (phase de lancement) ;
 *  - ville ou catégorie × ville : 6 produits de 2 boutiques (sinon doublon de la page boutique).
 */
export const MIN_LANDING_PRODUCTS = 6;
export const MIN_LANDING_SHOPS = 2;
export const MIN_CATEGORY_PRODUCTS = 8;

export type MarketSort = "relevance" | "new" | "price_asc" | "price_desc";
export type MarketItemType = "product" | "service";

export interface MarketProduct {
  id: string;
  slug: string;
  name: string;
  price: number | null;
  priceLabel: string;
  soldOut: boolean;
  isNew: boolean;
  /** Service : affiché avec son affiche, prix « À partir de », bouton « Réserver ». */
  isService: boolean;
  url: string;
  thumbUrl: string | null;
  fullUrl: string | null;
  shop: { id: string; slug: string; name: string; city: string | null; area: string | null; logoUrl: string | null; phoneHref: string };
  waHref: string;
}

export interface MarketShop {
  id: string;
  slug: string;
  name: string;
  categoryLabel: string | null;
  city: string | null;
  area: string | null;
  logoUrl: string | null;
  productCount: number;
  thumbs: string[];
  url: string;
  /** Présente sur le Market (boutique Pro éligible) → badge PRO. */
  listed: boolean;
}

type ProductRow = {
  id: string; slug: string; name: string; price: number | null; status: string; market_category: string | null;
  subject_type?: string | null; poster_key?: string | null;
  created_at: string; image_path: string | null; shop_id: string; shop_slug: string; shop_name: string;
  shop_city: string | null; shop_district: string | null; shop_logo_path: string | null;
  shop_whatsapp?: string | null; shop_phone?: string | null; total_count: number;
};

type ShopRow = {
  id: string; slug: string; name: string; category_label: string | null; city: string | null; district: string | null;
  logo_path: string | null; product_count: number; thumbs: string[] | null; total_count: number; listed?: boolean;
};

const NEW_DAYS = 21;

function area(district: string | null, city: string | null): string | null {
  return [district, city].filter(Boolean).join(", ") || null;
}

function toProduct(r: ProductRow): MarketProduct {
  const isService = r.subject_type === "service";
  // Service : affiche OU photo selon le choix du vendeur (la base renvoie l'une ou l'autre).
  const poster = posterUrl(r.poster_key);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    price: r.price,
    priceLabel: itemPriceLabel(r.price, isService),
    soldOut: r.status === "sold_out",
    isNew: Date.now() - new Date(r.created_at).getTime() < NEW_DAYS * 86_400_000,
    isService,
    url: productPublicUrl(r.shop_slug, r.slug),
    thumbUrl: poster ?? shopMediaThumbUrl(r.image_path),
    fullUrl: poster ?? shopMediaUrl(r.image_path),
    shop: {
      id: r.shop_id, slug: r.shop_slug, name: r.shop_name, city: r.shop_city,
      area: area(r.shop_district, r.shop_city), logoUrl: shopMediaUrl(r.shop_logo_path),
      // Avant la migration 0022 : pas de numéro → le bouton Appeler mène à la boutique.
      phoneHref: r.shop_phone || r.shop_whatsapp ? `tel:${(r.shop_phone || r.shop_whatsapp || "").replace(/[^\d+]/g, "")}` : `/boutique/${r.shop_slug}`,
    },
    waHref: `/r/wa/${r.shop_slug}?${new URLSearchParams({ p: r.slug, src: "market" }).toString()}`,
  };
}

function toShop(r: ShopRow): MarketShop {
  return {
    id: r.id, slug: r.slug, name: r.name, categoryLabel: r.category_label, city: r.city,
    area: area(r.district, r.city), logoUrl: shopMediaUrl(r.logo_path), productCount: Number(r.product_count) || 0,
    // « poster:<clé> » = affiche d'un service ; sinon chemin de photo produit.
    thumbs: (r.thumbs ?? [])
      .map((p) => (p.startsWith("poster:") ? posterUrl(p.slice(7)) : shopMediaThumbUrl(p)))
      .filter((u): u is string => !!u),
    url: `/boutique/${r.slug}`,
    listed: r.listed ?? true,
  };
}

export interface ProductQuery {
  category?: MarketCategory | null;
  city?: string | null;
  shopId?: string | null;
  q?: string | null;
  min?: number | null;
  max?: number | null;
  sort?: MarketSort;
  type?: MarketItemType | null;
  page?: number;
  limit?: number;
}

export async function getMarketProducts(query: ProductQuery): Promise<{ items: MarketProduct[]; total: number }> {
  const limit = query.limit ?? MARKET_PAGE_SIZE;
  const page = Math.max(1, query.page ?? 1);
  try {
    const { data, error } = await createPublicClient().rpc("market_products", {
      p_categories: query.category ? query.category.leafKeys : null,
      p_city: query.city ?? null,
      p_shop: query.shopId ?? null,
      p_q: query.q?.trim().slice(0, 80) || null,
      p_min: query.min ?? null,
      p_max: query.max ?? null,
      p_sort: query.sort ?? "relevance",
      p_limit: limit,
      p_offset: (page - 1) * limit,
      p_type: query.type ?? null,
    });
    if (error || !data) return { items: [], total: 0 };
    const rows = data as ProductRow[];
    return { items: rows.map(toProduct), total: rows.length ? Number(rows[0].total_count) : 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function getMarketShops(opts: { city?: string | null; page?: number; limit?: number } = {}): Promise<{ items: MarketShop[]; total: number }> {
  const limit = opts.limit ?? 24;
  const page = Math.max(1, opts.page ?? 1);
  try {
    const { data, error } = await createPublicClient().rpc("market_shops", {
      p_city: opts.city ?? null,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    });
    if (error || !data) return { items: [], total: 0 };
    const rows = data as ShopRow[];
    return { items: rows.map(toShop), total: rows.length ? Number(rows[0].total_count) : 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

/** Annuaire /boutiques : toutes les boutiques publiées avec au moins 3 produits (Pro en premier). */
export async function getShopDirectory(opts: { city?: string | null; page?: number; limit?: number } = {}): Promise<{ items: MarketShop[]; total: number }> {
  const limit = opts.limit ?? 24;
  const page = Math.max(1, opts.page ?? 1);
  try {
    const { data, error } = await createPublicClient().rpc("shop_directory", {
      p_city: opts.city ?? null,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    });
    if (error || !data) return { items: [], total: 0 };
    const rows = data as ShopRow[];
    return { items: rows.map(toShop), total: rows.length ? Number(rows[0].total_count) : 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

export interface CountRow {
  category: string | null;
  city: string | null;
  products: number;
  shopIds: string[];
  minPrice: number | null;
}

/** Comptages catégorie × ville (1 appel, mis en cache pour la requête). */
export const getMarketCounts = cache(async (): Promise<CountRow[]> => {
  try {
    const { data, error } = await createPublicClient().rpc("market_counts");
    if (error || !data) return [];
    return (data as { market_category: string | null; city: string | null; products: number; shop_ids: string[] | null; min_price: number | null }[]).map(
      (r) => ({ category: r.market_category, city: r.city, products: Number(r.products) || 0, shopIds: r.shop_ids ?? [], minPrice: r.min_price })
    );
  } catch {
    return [];
  }
});

export interface Totals {
  products: number;
  shops: number;
  minPrice: number | null;
}

/** Totaux pour une catégorie (ou tout le Market) et une ville (ou tout le pays). */
export function totalsFor(rows: CountRow[], category: MarketCategory | null, city: string | null): Totals {
  const leaves = category ? new Set(category.leafKeys) : null;
  let products = 0;
  const shops = new Set<string>();
  let minPrice: number | null = null;
  for (const r of rows) {
    if (leaves && (!r.category || !leaves.has(r.category))) continue;
    if (city && r.city !== city) continue;
    products += r.products;
    for (const id of r.shopIds) shops.add(id);
    if (r.minPrice != null && (minPrice == null || r.minPrice < minPrice)) minPrice = r.minPrice;
  }
  return { products, shops: shops.size, minPrice };
}

export function isLandingIndexable(t: Totals, kind: "category" | "local" = "local"): boolean {
  if (kind === "category") return t.products >= MIN_CATEGORY_PRODUCTS && t.shops >= 1;
  return t.products >= MIN_LANDING_PRODUCTS && t.shops >= MIN_LANDING_SHOPS;
}

/** Villes présentes dans le Market (pour une catégorie donnée), triées par nombre de produits. */
export function citiesWithProducts(rows: CountRow[], category: MarketCategory | null): { slug: string; products: number }[] {
  const leaves = category ? new Set(category.leafKeys) : null;
  const acc = new Map<string, number>();
  for (const r of rows) {
    if (!r.city || (leaves && (!r.category || !leaves.has(r.category)))) continue;
    if (!cityFromText(r.city)) continue;
    acc.set(r.city, (acc.get(r.city) ?? 0) + r.products);
  }
  return [...acc.entries()].map(([slug, products]) => ({ slug, products })).sort((a, b) => b.products - a.products);
}
