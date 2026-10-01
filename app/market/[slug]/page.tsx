import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listingPath, loadListing, MarketListing } from "@/components/market/listing";
import { MarketShell } from "@/components/market/shell";
import { getMarketCategory } from "@/lib/market/categories";
import { getMarketCity } from "@/lib/market/cities";
import { getMarketCounts, isLandingIndexable, totalsFor } from "@/lib/market/queries";
import { listingDescription, listingTitle, parseListingParams } from "@/lib/market/seo";
import { absoluteUrl, SITE_LOCALE } from "@/lib/seo";

// /market/{slug} : une catégorie (mode, robes, thiouraye…) OU une ville (dakar, thies…).
// Les deux listes sont fermées et leurs slugs ne se chevauchent pas (voir lib/market/categories.ts).
export const revalidate = 300;

type Props = { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> };

function resolve(slug: string) {
  const category = getMarketCategory(slug);
  const city = category ? null : getMarketCity(slug);
  return { category, city };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category, city } = resolve(params.slug);
  if (!category && !city) return { title: "Page introuvable", robots: { index: false } };
  const lp = parseListingParams(searchParams);
  const totals = totalsFor(await getMarketCounts(), category, city?.slug ?? null);
  const path = listingPath(category, city);
  const title = listingTitle(category, city, totals);
  const description = listingDescription(category, city, totals);
  const canonical = absoluteUrl(!lp.filtered && lp.page > 1 ? `${path}?page=${lp.page}` : path);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: !lp.filtered && isLandingIndexable(totals, category ? "category" : "local") ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: canonical, siteName: "Jaarle Market", locale: SITE_LOCALE, type: "website" },
  };
}

export default async function MarketSlugPage({ params, searchParams }: Props) {
  const { category, city } = resolve(params.slug);
  if (!category && !city) notFound();
  const lp = parseListingParams(searchParams);
  const data = await loadListing(category, city, lp);
  return (
    <MarketShell city={city?.slug ?? null}>
      <MarketListing category={category} city={city} params={lp} items={data.items} total={data.total} totals={data.totals} />
    </MarketShell>
  );
}
