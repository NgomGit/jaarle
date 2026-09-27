import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefrontTemplate } from "@/components/storefront/templates";
import { shopPublicUrl } from "@/lib/shops/format";
import { shopMediaUrl } from "@/lib/shops/media";
import { getPublicProducts, getPublicShop, getShopPublicMeta, productPublicUrl } from "@/lib/shops/public";
import { absoluteUrl, breadcrumbLd, isShopIndexable, jsonLdString, shopDescription, shopTitle, SITE_LOCALE, SITE_NAME, storeLd } from "@/lib/seo";
import { resolveTheme, toProductCard, toStorefrontShop } from "@/lib/storefront/view-models";

// Page publique d'une boutique : les données sont préparées ici, l'affichage est délégué au
// template choisi par la boutique (brand.template). Rendue côté serveur puis mise en cache (ISR),
// rafraîchie à chaque modification (revalidatePath) et au plus tard toutes les 5 minutes.
export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getPublicShop(params.slug);
  if (!shop) return { title: "Boutique introuvable", robots: { index: false } };
  const products = await getPublicProducts(shop.id);
  const title = shopTitle(shop);
  const description = shopDescription(shop, products);
  const url = shopPublicUrl(shop.slug);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    icons: shop.logo_path ? { icon: shopMediaUrl(shop.logo_path) ?? undefined } : undefined,
    // Pas d'indexation tant que la boutique est quasi vide (évite les pages pauvres).
    robots: isShopIndexable(products.length) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url, siteName: SITE_NAME, locale: SITE_LOCALE, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShopPage({ params }: Props) {
  const shop = await getPublicShop(params.slug);
  if (!shop) notFound();
  const [products, theme, meta] = await Promise.all([getPublicProducts(shop.id), resolveTheme(shop), getShopPublicMeta(shop.id)]);

  const url = shopPublicUrl(shop.slug);
  const jsonLd = [
    storeLd({
      shop,
      url,
      logo: shopMediaUrl(shop.logo_path),
      products: products.map((p) => ({
        product: p,
        url: productPublicUrl(shop.slug, p.slug),
        image: shopMediaUrl(p.product_images[0]?.path),
      })),
    }),
    breadcrumbLd([
      { name: "Jaarle", url: absoluteUrl("/") },
      { name: "Boutiques", url: absoluteUrl("/boutiques") },
      { name: shop.name, url },
    ]),
  ];

  const { ShopView } = getStorefrontTemplate(shop.brand?.template);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <ShopView shop={toStorefrontShop(shop, products.length, meta)} products={products.map((p) => toProductCard(shop.slug, p))} theme={theme} />
    </>
  );
}
