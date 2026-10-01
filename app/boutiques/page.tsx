import type { Metadata } from "next";
import { DIRECTORY_PAGE_SIZE, ShopDirectory } from "@/components/market/directory";
import { MarketShell } from "@/components/market/shell";
import { getShopDirectory } from "@/lib/market/queries";
import { absoluteUrl, SITE_LOCALE, SITE_NAME } from "@/lib/seo";

// Annuaire public des boutiques Jaarle (au moins 3 produits) : chemin vers chaque boutique pour
// Google (maillage interne) et moyen de découvrir les commerçants par ville.
export const revalidate = 3600;

const TITLE = "Boutiques en ligne au Sénégal — commander sur WhatsApp";
const DESCRIPTION =
  "Découvrez les boutiques des commerçants sénégalais sur Jaarle : mode, beauté, alimentation, électronique… Prix en FCFA et commande directe sur WhatsApp.";

type Props = { searchParams: { page?: string } };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const canonical = absoluteUrl(page > 1 ? `/boutiques?page=${page}` : "/boutiques");
  return {
    title: { absolute: `${TITLE}${page > 1 ? ` — page ${page}` : ""} | ${SITE_NAME}` },
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: { title: TITLE, description: DESCRIPTION, url: canonical, siteName: SITE_NAME, locale: SITE_LOCALE, type: "website" },
  };
}

export default async function ShopsDirectoryPage({ searchParams }: Props) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { items, total } = await getShopDirectory({ page, limit: DIRECTORY_PAGE_SIZE });
  return (
    <MarketShell>
      <ShopDirectory city={null} shops={items} total={total} page={page} />
    </MarketShell>
  );
}
