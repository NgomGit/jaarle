import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { getProductBySlug, listShopProducts, type ProductWithImages } from "@/lib/shops/products";
import { formatPrice, shopPublicUrl } from "@/lib/shops/format";
import type { Shop } from "@/lib/shops/types";
import { activePromo } from "@/lib/shops/promo";

// Lectures des pages publiques, dédupliquées par requête (metadata + page + image OG).

export const getPublicShop = cache(async (slug: string): Promise<Shop | null> => {
  const supabase = createPublicClient();
  const { data } = await supabase.from("shops").select("*").eq("slug", slug.toLowerCase()).eq("status", "published").maybeSingle();
  return (data as Shop) ?? null;
});

export const getPublicProducts = cache(async (shopId: string): Promise<ProductWithImages[]> => {
  return listShopProducts(createPublicClient(), shopId);
});

/** Affiches des services d'une boutique publiée (migration 0023) : id de fiche → clé d'affiche. */
export const getServicePosters = cache(async (shopId: string): Promise<Map<string, string>> => {
  try {
    const { data, error } = await createPublicClient().rpc("shop_service_posters", { p_shop: shopId });
    if (error || !data) return new Map();
    return new Map((data as { product_id: string; poster_key: string }[]).map((r) => [r.product_id, r.poster_key]));
  } catch {
    return new Map();
  }
});

export const getPublicProduct = cache(async (shopId: string, productSlug: string): Promise<ProductWithImages | null> => {
  return getProductBySlug(createPublicClient(), shopId, productSlug);
});

/**
 * Infos publiques liées à l'offre du commerçant : mention « propulsée par Jaarle » (retirée en Pro)
 * et son code de parrainage (le lien « Crée ta boutique » du pied de page parraine le visiteur).
 */
export const getShopPublicMeta = cache(async (shopId: string): Promise<{ brandingBadge: boolean; referralCode: string | null }> => {
  const { data, error } = await createPublicClient().rpc("shop_public_meta", { p_shop: shopId });
  if (error || !data) return { brandingBadge: true, referralCode: null };
  const d = data as { branding_badge?: boolean; referral_code?: string | null };
  return { brandingBadge: d.branding_badge !== false, referralCode: d.referral_code ?? null };
});

export function productPublicUrl(shopSlug: string, productSlug: string): string {
  return `${shopPublicUrl(shopSlug)}/p/${productSlug}`;
}

/** Message WhatsApp pré-rempli (construit côté serveur, jamais depuis un texte libre du visiteur). */
export function whatsappMessage(
  shop: Pick<Shop, "name" | "slug">,
  product?:
    | (Pick<ProductWithImages, "name" | "price" | "slug" | "status"> & {
        subject_type?: string | null;
        compare_at_price?: number | null;
        promo_ends_at?: string | null;
      })
    | null,
  optionsLabel?: string | null,
  /** Visiteur venu de Jaarle Market : le message le dit (le vendeur sait d'où vient le client). */
  fromMarket = false
): string {
  // Promo en cours (0046) : le prix promo et l'ancien prix sont rappelés au vendeur.
  const promo = product ? activePromo(product.price, product.compare_at_price, product.promo_ends_at) : null;
  const promoText = promo && product?.price != null ? ` en promo à ${formatPrice(product.price)} (au lieu de ${promo.oldPriceLabel})` : "";
  if (product && fromMarket) {
    const url = productPublicUrl(shop.slug, product.slug);
    const opts = optionsLabel ? ` (${optionsLabel})` : "";
    if (product.subject_type === "service") {
      return `Bonjour, je suis intéressé(e) par votre prestation « ${product.name} »${opts} vue sur Jaarle Market. Quelles sont vos disponibilités ? ${url}`;
    }
    if (product.status === "sold_out") {
      return `Bonjour, je suis intéressé(e) par « ${product.name} »${opts} vu sur Jaarle Market. Est-il de nouveau disponible ? ${url}`;
    }
    return `Bonjour, je suis intéressé(e) par « ${product.name} »${opts}${promoText} vu sur Jaarle Market. Est-il toujours disponible ? ${url}`;
  }
  if (!product) {
    return `Bonjour ${shop.name}, je viens de voir votre boutique sur Jaarle (${shopPublicUrl(shop.slug)}) et j'aimerais avoir plus d'informations.`;
  }
  const priceText = promoText || (product.price != null ? ` à ${formatPrice(product.price)}` : "");
  const options = optionsLabel ? ` (${optionsLabel})` : "";
  if (product.subject_type === "service") {
    return `Bonjour, je suis intéressé(e) par votre prestation « ${product.name} »${options}. Pouvez-vous me donner vos disponibilités et le tarif ? Je viens de voir votre annonce sur Jaarle : ${productPublicUrl(shop.slug, product.slug)}`;
  }
  const intro =
    product.status === "sold_out"
      ? `Bonjour, le produit « ${product.name} »${priceText}${options} est-il de nouveau disponible ?`
      : `Bonjour, je suis intéressé(e) par le produit « ${product.name} »${priceText}${options}.`;
  return `${intro} Je viens de voir votre boutique sur Jaarle : ${productPublicUrl(shop.slug, product.slug)}`;
}

export function whatsappUrl(e164: string, message: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
