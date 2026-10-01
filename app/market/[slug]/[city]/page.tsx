import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listingPath, loadListing, MarketListing } from "@/components/market/listing";
import { MarketShell } from "@/components/market/shell";
import { getMarketCategory } from "@/lib/market/categories";
import { getMarketCity } from "@/lib/market/cities";
import { getMarketCounts, isLandingIndexable, totalsFor } from "@/lib/market/queries";
import { listingDescription, listingTitle, parseListingParams } from "@/lib/market/seo";
import { absoluteUrl, SITE_LOCALE } from "@/lib/seo";

// /market/{catégorie}/{ville} : la page qui capte la recherche locale (« robe wax Dakar »).
// Indexée seulement au-dessus du seuil (6 produits, 2 boutiques), sans filtre actif.
export const revalidate = 300;

type Props = { params: { slug: string; city: string }; searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const category = getMarketCategory(params.slug);
  const city = getMarketCity(params.city);
  if (!category || !city) return { title: "Page introuvable", robots: { index: false } };
  const lp = parseListingParams(searchParams);
  const totals = totalsFor(await getMarketCounts(), category, city.slug);
  const path = listingPath(category, city);
  const title = listingTitle(category, city, totals);
  const description = listingDescription(category, city, totals);
  const canonical = absoluteUrl(!lp.filtered && lp.page > 1 ? `${path}?page=${lp.page}` : path);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: !lp.filtered && isLandingIndexable(totals) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: canonical, siteName: "Jaarle Market", locale: SITE_LOCALE, type: "website" },
  };
}

export default async function MarketCategoryCityPage({ params, searchParams }: Props) {
  const category = getMarketCategory(params.slug);
  const city = getMarketCity(params.city);
  if (!category || !city) notFound();
  const lp = parseListingParams(searchParams);
  const data = await loadListing(category, city, lp);
  return (
    <MarketShell city={city.slug}>
      <MarketListing category={category} city={city} params={lp} items={data.items} total={data.total} totals={data.totals} />
    </MarketShell>
  );
}
