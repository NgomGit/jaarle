import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefrontTemplate } from "@/components/storefront/templates";
import { shopPublicUrl } from "@/lib/shops/format";
import { shopMediaUrl } from "@/lib/shops/media";
import { getPublicProducts, getPublicShop, getShopPublicMeta } from "@/lib/shops/public";
import { resolveTheme, toProductCard, toStorefrontShop } from "@/lib/storefront/view-models";

// Page publique d'une boutique : les données sont préparées ici, l'affichage est délégué au
// template choisi par la boutique (brand.template). Rendue côté serveur puis mise en cache (ISR),
// rafraîchie à chaque modification (revalidatePath) et au plus tard toutes les 5 minutes.
export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getPublicShop(params.slug);
  if (!shop) return { title: "Boutique introuvable — Jaarle", robots: { index: false } };
  const products = await getPublicProducts(shop.id);
  const location = [shop.district, shop.city].filter(Boolean).join(", ");
  const description =
    shop.description ||
    `${shop.category_label ?? "Boutique"}${location ? ` à ${location}` : ""} — commandez directement sur WhatsApp.`;
  const url = shopPublicUrl(shop.slug);
  return {
    title: `${shop.name}${shop.category_label ? ` — ${shop.category_label}` : ""}`,
    description,
    alternates: { canonical: url },
    icons: shop.logo_path ? { icon: shopMediaUrl(shop.logo_path) ?? undefined } : undefined,
    // Pas d'indexation tant que la boutique est quasi vide (évite les pages pauvres).
    robots: products.length >= 3 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: shop.name, description, url, siteName: "Jaarle", locale: "fr_SN", type: "website" },
    twitter: { card: "summary_large_image", title: shop.name, description },
  };
}

export default async function ShopPage({ params }: Props) {
  const shop = await getPublicShop(params.slug);
  if (!shop) notFound();
  const [products, theme, meta] = await Promise.all([getPublicProducts(shop.id), resolveTheme(shop), getShopPublicMeta(shop.id)]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: shop.name,
    description: shop.description ?? undefined,
    url: shopPublicUrl(shop.slug),
    image: shopMediaUrl(shop.logo_path) ?? undefined,
    telephone: shop.whatsapp,
    address: shop.city
      ? { "@type": "PostalAddress", addressLocality: shop.city, streetAddress: shop.district ?? undefined, addressCountry: "SN" }
      : undefined,
  };

  const { ShopView } = getStorefrontTemplate(shop.brand?.template);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ShopView shop={toStorefrontShop(shop, products.length, meta)} products={products.map((p) => toProductCard(shop.slug, p))} theme={theme} />
    </>
  );
}
