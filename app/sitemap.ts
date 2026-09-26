import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";

// Pages fixes + boutiques publiées (Jaarle 2.0). Régénéré au plus toutes les heures.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: "https://jaarle.com", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://jaarle.com/register", lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: "https://jaarle.com/login", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const { data } = await createPublicClient()
      .from("shops")
      .select("slug, updated_at")
      .eq("status", "published")
      .limit(5000);
    const shops = (data ?? []).map((s: { slug: string; updated_at: string }) => ({
      url: `https://jaarle.com/boutique/${s.slug}`,
      lastModified: new Date(s.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
    return [...staticPages, ...shops];
  } catch {
    return staticPages;
  }
}
