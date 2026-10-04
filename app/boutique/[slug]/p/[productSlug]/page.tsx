import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefrontTemplate } from "@/components/storefront/templates";
import { getMarketCategory } from "@/lib/market/categories";
import { formatPrice, shopPublicUrl } from "@/lib/shops/format";
import { absoluteUrl, breadcrumbLd, jsonLdString, productDescription, productLd, SITE_LOCALE, SITE_NAME } from "@/lib/seo";
import { shopMediaUrl } from "@/lib/shops/media";
import { getPublicProduct, getPublicProducts, getPublicShop, getServicePosters, getShopPublicMeta, productPublicUrl } from "@/lib/shops/public";
import { resolveTheme, toProductCard, toProductDetail, toStorefrontShop } from "@/lib/storefront/view-models";
import { isoDuration } from "@/lib/shops/video";
import type { StorefrontProductDetail } from "@/components/storefront/templates/types";

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
  if (!data) return { title: "Produit introuvable", robots: { index: false } };
  const { shop, product } = data;
  const title = `${product.name} — ${formatPrice(product.price)} | ${shop.name}`;
  const description = productDescription(shop, product);
  const url = productPublicUrl(shop.slug, product.slug);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    icons: shop.logo_path ? { icon: shopMediaUrl(shop.logo_path) ?? undefined } : undefined,
    openGraph: { title, description, url, siteName: SITE_NAME, locale: SITE_LOCALE, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Vidéo produit pour Google (VideoObject) — seulement si une image d'aperçu existe (exigée). */
function videoLd(detail: StorefrontProductDetail) {
  const video = detail.video;
  const thumbnail = video?.posterUrl ?? detail.images[0];
  if (!video || !thumbnail) return null;
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: detail.name,
    description: detail.description || detail.name,
    thumbnailUrl: [thumbnail],
    uploadDate: video.uploadedAt,
    duration: isoDuration(video.durationMs),
    contentUrl: video.url,
  };
}

export default async function ProductPage({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  const { shop, product } = data;
  const [allProducts, theme, meta, posters] = await Promise.all([
    getPublicProducts(shop.id),
    resolveTheme(shop),
    getShopPublicMeta(shop.id),
    getServicePosters(shop.id),
  ]);
  const detail = toProductDetail(shop.slug, product, posters.get(product.id));

  const shopUrl = shopPublicUrl(shop.slug);
  const jsonLd = [
    productLd({ shop, shopUrl, product, url: detail.url, images: detail.images }), // null : produit sans prix
    breadcrumbLd([
      { name: "Jaarle", url: absoluteUrl("/") },
      { name: shop.name, url: shopUrl },
      { name: product.name, url: detail.url },
    ]),
    videoLd(detail),
  ].filter(Boolean);

  const marketCat = getMarketCategory(product.market_category);
  const { ProductView } = getStorefrontTemplate(shop.brand?.template);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <ProductView
        shop={toStorefrontShop(shop, allProducts.length, meta)}
        product={detail}
        related={allProducts.filter((p) => p.id !== product.id).slice(0, 4).map((p) => toProductCard(shop.slug, p, posters.get(p.id)))}
        theme={theme}
        marketCategory={marketCat ? { slug: marketCat.slug, label: marketCat.label } : null}
      />
    </>
  );
}
