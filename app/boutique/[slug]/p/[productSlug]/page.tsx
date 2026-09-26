import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefrontTemplate } from "@/components/storefront/templates";
import { formatPrice } from "@/lib/shops/format";
import { shopMediaUrl } from "@/lib/shops/media";
import { getPublicProduct, getPublicProducts, getPublicShop, getShopPublicMeta, productPublicUrl } from "@/lib/shops/public";
import { resolveTheme, toProductCard, toProductDetail, toStorefrontShop } from "@/lib/storefront/view-models";

export const revalidate = 300;

type Props = { params: { slug: string; productSlug: string } };

async function load(params: Props["params"]) {
  const shop = await getPublicShop(params.slug);
  if (!shop) return null;
  const product = await getPublicProduct(shop.id, params.productSlug);
  if (!product) return null;
  return { shop, product };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { title: "Produit introuvable — Jaarle", robots: { index: false } };
  const { shop, product } = data;
  const title = `${product.name} — ${formatPrice(product.price)} | ${shop.name}`;
  const description = product.description || `${product.name} chez ${shop.name}. Commandez directement sur WhatsApp.`;
  const url = productPublicUrl(shop.slug, product.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    icons: shop.logo_path ? { icon: shopMediaUrl(shop.logo_path) ?? undefined } : undefined,
    openGraph: { title, description, url, siteName: "Jaarle", locale: "fr_SN", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  const { shop, product } = data;
  const [allProducts, theme, meta] = await Promise.all([getPublicProducts(shop.id), resolveTheme(shop), getShopPublicMeta(shop.id)]);
  const detail = toProductDetail(shop.slug, product);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: detail.images,
    category: product.category ?? undefined,
    brand: { "@type": "Brand", name: shop.name },
    offers:
      product.price != null
        ? {
            "@type": "Offer",
            price: product.price,
            priceCurrency: "XOF",
            availability: detail.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            url: detail.url,
          }
        : undefined,
  };

  const { ProductView } = getStorefrontTemplate(shop.brand?.template);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductView
        shop={toStorefrontShop(shop, allProducts.length, meta)}
        product={detail}
        related={allProducts.filter((p) => p.id !== product.id).slice(0, 4).map((p) => toProductCard(shop.slug, p))}
        theme={theme}
      />
    </>
  );
}
