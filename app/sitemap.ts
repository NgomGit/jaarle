import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { absoluteUrl, isShopIndexable } from "@/lib/seo";

// Plan du site : pages publiques + boutiques indexables (au moins 3 produits, comme la règle
// robots de la page boutique) et leurs fiches produit. Régénéré au plus toutes les heures.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/tarifs"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/boutiques"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/register"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];

  try {
    const pub = createPublicClient();
    const [{ data: shops }, { data: products }] = await Promise.all([
      pub.from("shops").select("id, slug, updated_at").eq("status", "published").limit(5000),
      pub.from("products").select("shop_id, slug, updated_at").limit(50000),
    ]);
    const byShop = new Map<string, { slug: string; updated_at: string }[]>();
    for (const p of (products ?? []) as { shop_id: string; slug: string; updated_at: string }[]) {
      byShop.set(p.shop_id, [...(byShop.get(p.shop_id) ?? []), p]);
    }

    const entries: MetadataRoute.Sitemap = [];
    for (const s of (shops ?? []) as { id: string; slug: string; updated_at: string }[]) {
      const list = byShop.get(s.id) ?? [];
      if (!isShopIndexable(list.length)) continue;
      const shopUrl = absoluteUrl(`/boutique/${s.slug}`);
      const latest = list.reduce((max, p) => (p.updated_at > max ? p.updated_at : max), s.updated_at);
      entries.push({ url: shopUrl, lastModified: new Date(latest), changeFrequency: "daily", priority: 0.7 });
      for (const p of list) {
        entries.push({ url: `${shopUrl}/p/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "weekly", priority: 0.6 });
      }
    }
    return [...staticPages, ...entries];
  } catch {
    return staticPages;
  }
}
