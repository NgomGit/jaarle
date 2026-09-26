import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, ProductImage } from "@/lib/shops/types";

export type ProductImageLite = Pick<ProductImage, "id" | "path" | "position" | "width" | "height">;
export type ProductWithImages = Product & { product_images: ProductImageLite[] };

const SELECT = "*, product_images(id, path, position, width, height)";

function sortImages<T extends { product_images: ProductImageLite[] }>(p: T): T {
  return { ...p, product_images: [...(p.product_images ?? [])].sort((a, b) => a.position - b.position) };
}

/** Produits d'une boutique (RLS : propriétaire → tous ; public → actifs/épuisés d'une boutique publiée). */
export async function listShopProducts(supabase: SupabaseClient, shopId: string): Promise<ProductWithImages[]> {
  const { data, error } = await supabase
    .from("products")
    .select(SELECT)
    .eq("shop_id", shopId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as ProductWithImages[]).map(sortImages);
}

export async function getProductById(supabase: SupabaseClient, id: string): Promise<ProductWithImages | null> {
  const { data, error } = await supabase.from("products").select(SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return sortImages(data as ProductWithImages);
}

export async function getProductBySlug(
  supabase: SupabaseClient,
  shopId: string,
  slug: string
): Promise<ProductWithImages | null> {
  const { data, error } = await supabase.from("products").select(SELECT).eq("shop_id", shopId).eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return sortImages(data as ProductWithImages);
}

export async function countShopProducts(supabase: SupabaseClient, shopId: string) {
  const { data } = await supabase.from("products").select("status").eq("shop_id", shopId);
  const rows = (data ?? []) as { status: string }[];
  return {
    total: rows.length,
    visible: rows.filter((r) => r.status === "active" || r.status === "sold_out").length,
  };
}
