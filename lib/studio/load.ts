import type { SupabaseClient } from "@supabase/supabase-js";
import { getMyShop } from "@/lib/shops/queries";
import { getProductById, type ProductWithImages } from "@/lib/shops/products";
import type { Shop } from "@/lib/shops/types";
import type { StudioCreation } from "@/lib/studio/facts";

/** Boutique + produit du commerçant connecté (vérifie la propriété). */
export async function loadOwnedProduct(
  supabase: SupabaseClient,
  userId: string,
  productId: string
): Promise<{ shop: Shop; product: ProductWithImages } | { error: string; status: number }> {
  const shop = await getMyShop(supabase, userId);
  if (!shop) return { error: "Crée d'abord ta boutique.", status: 400 };
  const product = await getProductById(supabase, productId);
  if (!product || product.owner_id !== userId || product.shop_id !== shop.id) {
    return { error: "Produit introuvable.", status: 404 };
  }
  return { shop, product };
}

const CREATION_FIELDS =
  "id, product_name, price, industry, generated_copy, business_name, contact_phone, subject_type, service_description, service_items, unlocked, tier, format, shop_id, product_id";

export interface OwnedCreation {
  creation: StudioCreation;
  shop: Shop | null; // boutique du commerçant (facultative)
  product: ProductWithImages | null; // produit lié à l'affiche, s'il appartient bien à la boutique
}

/** Affiche du commerçant connecté + boutique / produit liés (tous facultatifs). */
export async function loadOwnedCreation(
  supabase: SupabaseClient,
  userId: string,
  creationId: string
): Promise<OwnedCreation | { error: string; status: number }> {
  const { data } = await supabase.from("creations").select(CREATION_FIELDS).eq("id", creationId).eq("user_id", userId).maybeSingle();
  if (!data) return { error: "Affiche introuvable.", status: 404 };
  const creation = data as unknown as StudioCreation;
  const shop = await getMyShop(supabase, userId);
  let product: ProductWithImages | null = null;
  if (shop && creation.product_id) {
    const p = await getProductById(supabase, creation.product_id);
    if (p && p.shop_id === shop.id && p.owner_id === userId) product = p;
  }
  return { creation, shop, product };
}

/** Chemin de stockage (bucket privé `creations`) de la version d'affiche demandée, sinon l'affiche courante. */
export async function creationPosterPath(
  supabase: SupabaseClient,
  userId: string,
  creationId: string,
  versionId: string | null
): Promise<string | null> {
  if (versionId) {
    const { data } = await supabase
      .from("creation_versions")
      .select("poster_path")
      .eq("id", versionId)
      .eq("creation_id", creationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.poster_path) return data.poster_path as string;
  }
  const { data } = await supabase.from("creations").select("poster_path").eq("id", creationId).eq("user_id", userId).maybeSingle();
  return (data?.poster_path as string | null) ?? null;
}
