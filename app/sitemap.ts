import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { absoluteUrl, isShopIndexable } from "@/lib/seo";
import { allMarketCategories } from "@/lib/market/categories";
import { MARKET_CITIES } from "@/lib/market/cities";
import { getMarketCounts, isLandingIndexable, totalsFor } from "@/lib/market/queries";

// Plan du site : pages publiques + boutiques indexables (au moins 3 produits, comme la règle
// robots de la page boutique) et leurs fiches produit. Régénéré au plus toutes les heures.
export const revalidate = 3600;

// Supabase plafonne chaque requête à 1000 lignes (max_rows) : on lit par pages pour ne perdre
// aucune boutique ni aucun produit. Plafond de sécurité : 50 000 URLs par sitemap (limite Google).
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/tarifs"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/boutiques"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/market"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/register"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];

  try {
    const pub = createPublicClient();
    const [shops, products] = await Promise.all([
      fetchAll<{ id: string; slug: string; updated_at: string }>((from, to) =>
        pub.from("shops").select("id, slug, updated_at").eq("status", "published").order("id").range(from, to)
      ),
      // La RLS publique ne renvoie que les produits active / sold_out des boutiques publiées.
      fetchAll<{ shop_id: string; slug: string; updated_at: string }>((from, to) =>
        pub.from("products").select("id, shop_id, slug, updated_at").order("id").range(from, to)
      ),
    ]);
    const byShop = new Map<string, { slug: string; updated_at: string }[]>();
    for (const p of products) {
      byShop.set(p.shop_id, [...(byShop.get(p.shop_id) ?? []), p]);
    }

    const entries: MetadataRoute.Sitemap = [];
    for (const s of shops) {
      const list = byShop.get(s.id) ?? [];
      if (!isShopIndexable(list.length)) continue;
      const shopUrl = absoluteUrl(`/boutique/${s.slug}`);
      const latest = list.reduce((max, p) => (p.updated_at > max ? p.updated_at : max), s.updated_at);
      entries.push({ url: shopUrl, lastModified: new Date(latest), changeFrequency: "daily", priority: 0.7 });
      for (const p of list) {
        entries.push({ url: `${shopUrl}/p/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "weekly", priority: 0.6 });
      }
    }
    return [...staticPages, ...(await marketEntries(now)), ...entries];
  } catch {
    return staticPages;
  }
}

/**
 * Pages du Market qui passent le seuil d'indexation (voir isLandingIndexable) : catégories,
 * villes et catégorie × ville. Même règle que le robots des pages.
 */
async function marketEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  const counts = await getMarketCounts();
  if (counts.length === 0) return [];
  const out: MetadataRoute.Sitemap = [];
  for (const city of MARKET_CITIES) {
    if (isLandingIndexable(totalsFor(counts, null, city.slug))) {
      out.push({ url: absoluteUrl(`/market/${city.slug}`), lastModified: now, changeFrequency: "daily", priority: 0.6 });
    }
  }
  for (const cat of allMarketCategories()) {
    if (!isLandingIndexable(totalsFor(counts, cat, null), "category")) continue;
    out.push({ url: absoluteUrl(`/market/${cat.slug}`), lastModified: now, changeFrequency: "daily", priority: cat.level === 1 ? 0.8 : 0.7 });
    for (const city of MARKET_CITIES) {
      if (isLandingIndexable(totalsFor(counts, cat, city.slug))) {
        out.push({ url: absoluteUrl(`/market/${cat.slug}/${city.slug}`), lastModified: now, changeFrequency: "daily", priority: 0.7 });
      }
    }
  }
  return out;
}
