"use server";

import { getMarketCategory } from "@/lib/market/categories";
import { getMarketProducts, MARKET_PAGE_SIZE, type MarketItemType, type MarketProduct, type MarketSort } from "@/lib/market/queries";

// Défilement infini du Market : charge la page suivante d'une liste (catégorie, ville, recherche)
// avec EXACTEMENT les mêmes critères que la page affichée. Action publique : tout est revalidé ici.

export interface MarketMoreQuery {
  categorySlug?: string | null;
  city?: string | null;
  q?: string | null;
  min?: number | null;
  max?: number | null;
  sort?: MarketSort;
  type?: MarketItemType | null;
  available?: boolean;
  promo?: boolean;
  qCategories?: string[] | null;
  qGroups?: string[] | null;
}

const SORTS = new Set<MarketSort>(["relevance", "new", "price_asc", "price_desc", "promo"]);
const MAX_PAGE = 200;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 40).map((x) => x.slice(0, 80)) : null;

export async function loadMoreMarketProducts(query: MarketMoreQuery, page: number): Promise<{ items: MarketProduct[]; total: number }> {
  const p = Math.floor(Number(page));
  if (!Number.isFinite(p) || p < 2 || p > MAX_PAGE || !query || typeof query !== "object") return { items: [], total: 0 };
  const sort = SORTS.has(query.sort as MarketSort) ? (query.sort as MarketSort) : "relevance";
  const type = query.type === "product" || query.type === "service" ? query.type : null;
  return getMarketProducts({
    category: getMarketCategory(str(query.categorySlug, 80)),
    city: str(query.city, 60),
    q: str(query.q, 80),
    min: num(query.min),
    max: num(query.max),
    sort,
    type,
    available: query.available === true,
    promo: query.promo === true,
    qCategories: list(query.qCategories),
    qGroups: list(query.qGroups),
    page: p,
    limit: MARKET_PAGE_SIZE,
  });
}
