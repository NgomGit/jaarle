import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DIRECTORY_PAGE_SIZE, ShopDirectory } from "@/components/market/directory";
import { MarketShell } from "@/components/market/shell";
import { getMarketCity } from "@/lib/market/cities";
import { getShopDirectory } from "@/lib/market/queries";
import { absoluteUrl, SITE_LOCALE, SITE_NAME } from "@/lib/seo";

export const revalidate = 3600;

type Props = { params: { ville: string }; searchParams: { page?: string } };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const city = getMarketCity(params.ville);
  if (!city) return { title: "Page introuvable", robots: { index: false } };
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { total } = await getShopDirectory({ city: city.slug, page: 1, limit: 1 });
  const title = `Boutiques en ligne à ${city.name}${total > 0 ? ` — ${total} commerçant${total > 1 ? "s" : ""}` : ""} | ${SITE_NAME}`;
  const description = `Les boutiques de ${city.name} sur Jaarle : catalogues, prix en FCFA et commande directe sur WhatsApp.`;
  const canonical = absoluteUrl(`/boutiques/${city.slug}${page > 1 ? `?page=${page}` : ""}`);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    // Une ville avec moins de 2 boutiques n'a pas assez de contenu propre pour être indexée.
    robots: total >= 2 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: canonical, siteName: SITE_NAME, locale: SITE_LOCALE, type: "website" },
  };
}

export default async function CityShopsPage({ params, searchParams }: Props) {
  const city = getMarketCity(params.ville);
  if (!city) notFound();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { items, total } = await getShopDirectory({ city: city.slug, page, limit: DIRECTORY_PAGE_SIZE });
  return (
    <MarketShell city={city.slug}>
      <ShopDirectory city={city} shops={items} total={total} page={page} />
    </MarketShell>
  );
}
