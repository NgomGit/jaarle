import { formatSenegalPhone, shopPublicUrl } from "@/lib/shops/format";
import { shopMediaThumbUrl, shopMediaUrl } from "@/lib/shops/media";
import { productPublicUrl } from "@/lib/shops/public";
import { itemPriceLabel, posterUrl } from "@/lib/shops/posters";
import type { ProductWithImages } from "@/lib/shops/products";
import type { Shop } from "@/lib/shops/types";
import { accentFromLogoUrl, themeFromAccent, type StorefrontTheme } from "@/lib/storefront/theme";
import type {
  StorefrontProductCard,
  StorefrontProductDetail,
  StorefrontShop,
} from "@/components/storefront/templates/types";

const NEW_DAYS = 14;

export function toStorefrontShop(
  shop: Shop,
  productCount: number,
  meta: { brandingBadge: boolean; referralCode: string | null } = { brandingBadge: true, referralCode: null }
): StorefrontShop {
  const since = shop.published_at || shop.created_at;
  return {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    description: shop.description,
    categoryLabel: shop.category_label,
    city: shop.city,
    location: [shop.district, shop.city].filter(Boolean).join(", ") || null,
    whatsappDisplay: formatSenegalPhone(shop.whatsapp),
    whatsappHref: `/r/wa/${shop.slug}`,
    phoneHref: `tel:${(shop.phone || shop.whatsapp).replace(/[^\d+]/g, "")}`,
    logoUrl: shopMediaUrl(shop.logo_path),
    bannerUrl: shopMediaUrl(shop.banner_path),
    url: shopPublicUrl(shop.slug),
    onlineSince: since
      ? new Date(since).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
      : null,
    productCount,
    socials: shop.socials ?? {},
    jaarleBadge: meta.brandingBadge,
    referralCode: meta.referralCode,
  };
}

/**
 * Carte produit / service. Un service s'affiche avec son affiche (`posterKey`, voir
 * lib/shops/posters.ts) ; sans affiche (pas encore créée), on garde sa photo dans la vitrine.
 */
export function toProductCard(shopSlug: string, p: ProductWithImages, posterKey?: string | null): StorefrontProductCard {
  const main = p.product_images[0]?.path;
  const isService = p.subject_type === "service";
  const poster = isService ? posterUrl(posterKey) : null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    priceLabel: itemPriceLabel(p.price, isService),
    hasPrice: p.price != null,
    price: p.price,
    category: p.category,
    soldOut: p.status === "sold_out",
    isNew: Date.now() - new Date(p.created_at).getTime() < NEW_DAYS * 86_400_000,
    isService,
    thumbUrl: poster ?? shopMediaThumbUrl(main),
    fullUrl: poster ?? shopMediaUrl(main),
    url: productPublicUrl(shopSlug, p.slug),
  };
}

export function toProductDetail(shopSlug: string, p: ProductWithImages, posterKey?: string | null): StorefrontProductDetail {
  const card = toProductCard(shopSlug, p, posterKey);
  const photos = p.product_images.map((img) => shopMediaUrl(img.path)).filter((u): u is string => !!u);
  const poster = card.isService ? posterUrl(posterKey) : null;
  return {
    ...card,
    description: p.description,
    // Service avec affiche : l'affiche seule (la photo envoyée ne sert qu'à créer l'affiche).
    images: poster ? [poster] : photos,
    options: p.options ?? [],
  };
}

/** Thème de la vitrine : couleur choisie par le commerçant, sinon extraite du logo, sinon sobre. */
export async function resolveTheme(shop: Shop): Promise<StorefrontTheme> {
  const chosen = typeof shop.brand?.accentFrom === "string" ? shop.brand.accentFrom : null;
  return themeFromAccent(chosen ?? (await accentFromLogoUrl(shopMediaUrl(shop.logo_path))));
}
