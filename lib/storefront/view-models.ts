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
 * Image principale d'une fiche (même règle que product_media en SQL, migration 0024) :
 * produit → sa 1re photo ; service → l'affiche ou les photos selon le choix du vendeur,
 * et l'autre en attendant si l'image choisie n'existe pas encore.
 */
function mainMedia(p: ProductWithImages, posterKey?: string | null): { poster: string | null; photo: string | null } {
  const photo = p.product_images[0]?.path ?? null;
  if (p.subject_type !== "service") return { poster: null, photo };
  const poster = posterUrl(posterKey);
  if (p.display_media === "photos") return photo ? { poster: null, photo } : { poster, photo: null };
  return poster ? { poster, photo: null } : { poster: null, photo };
}

/** Carte produit / service (voir mainMedia pour l'image). */
export function toProductCard(shopSlug: string, p: ProductWithImages, posterKey?: string | null): StorefrontProductCard {
  const isService = p.subject_type === "service";
  const { poster, photo: main } = mainMedia(p, posterKey);
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
  const { poster } = mainMedia(p, posterKey);
  const extraPoster = card.isService && !poster ? posterUrl(posterKey) : null;
  return {
    ...card,
    description: p.description,
    // Service « affiche » : l'affiche seule (la photo, souvent celle du vendeur, ne sert qu'à la créer).
    // Service « photos » : les photos, puis l'affiche si elle existe.
    images: poster ? [poster] : extraPoster ? [...photos, extraPoster] : photos,
    options: p.options ?? [],
  };
}

/** Thème de la vitrine : couleur choisie par le commerçant, sinon extraite du logo, sinon sobre. */
export async function resolveTheme(shop: Shop): Promise<StorefrontTheme> {
  const chosen = typeof shop.brand?.accentFrom === "string" ? shop.brand.accentFrom : null;
  return themeFromAccent(chosen ?? (await accentFromLogoUrl(shopMediaUrl(shop.logo_path))));
}
