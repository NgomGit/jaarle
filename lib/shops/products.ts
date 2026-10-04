import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, ProductImage, ProductVideo } from "@/lib/shops/types";

export type ProductImageLite = Pick<ProductImage, "id" | "path" | "position" | "width" | "height">;
export type ProductVideoLite = Pick<ProductVideo, "id" | "path" | "poster_path" | "duration_ms" | "file_size" | "width" | "height" | "created_at">;
/** Produit + photos triées + vidéo (null si aucune, ou si la migration 0035 n'est pas appliquée). */
export type ProductWithImages = Product & { product_images: ProductImageLite[]; product_video?: ProductVideoLite | null };

const SELECT_BASE = "*, product_images(id, path, position, width, height)";
// product_videos.product_id est UNIQUE : PostgREST renvoie un objet (ou null), parfois un tableau
// selon la version — normalisé par sortImages.
const SELECT = `${SELECT_BASE}, product_videos(id, path, poster_path, duration_ms, file_size, width, height, created_at)`;

type Row = ProductWithImages & { product_videos?: ProductVideoLite | ProductVideoLite[] | null };

function sortImages<T extends { product_images: ProductImageLite[] }>(p: T): T {
  const { product_videos, ...rest } = p as T & { product_videos?: ProductVideoLite | ProductVideoLite[] | null };
  const video = Array.isArray(product_videos) ? product_videos[0] ?? null : product_videos ?? null;
  return {
    ...(rest as unknown as T),
    product_images: [...(p.product_images ?? [])].sort((a, b) => a.position - b.position),
    product_video: video,
  };
}

/**
 * Lecture avec la vidéo ; si la relation product_videos n'existe pas encore (migration 0035 non
 * appliquée), on relit sans elle : la boutique continue de fonctionner à l'identique.
 */
async function selectProducts<T>(run: (select: string) => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>) {
  const first = await run(SELECT);
  if (first.error && /product_videos|relationship|PGRST200/i.test(`${first.error.code ?? ""} ${first.error.message ?? ""}`)) {
    return run(SELECT_BASE);
  }
  return first;
}

/** Produits d'une boutique (RLS : propriétaire → tous ; public → actifs/épuisés d'une boutique publiée). */
export async function listShopProducts(supabase: SupabaseClient, shopId: string): Promise<ProductWithImages[]> {
  const { data, error } = await selectProducts((select) =>
    supabase.from("products").select(select).eq("shop_id", shopId).order("position", { ascending: true }).order("created_at", { ascending: false })
  );
  if (error || !data) return [];
  return (data as unknown as Row[]).map(sortImages);
}

export async function getProductById(supabase: SupabaseClient, id: string): Promise<ProductWithImages | null> {
  const { data, error } = await selectProducts((select) => supabase.from("products").select(select).eq("id", id).maybeSingle());
  if (error || !data) return null;
  return sortImages(data as unknown as Row);
}

export async function getProductBySlug(
  supabase: SupabaseClient,
  shopId: string,
  slug: string
): Promise<ProductWithImages | null> {
  const { data, error } = await selectProducts((select) =>
    supabase.from("products").select(select).eq("shop_id", shopId).eq("slug", slug).maybeSingle()
  );
  if (error || !data) return null;
  return sortImages(data as unknown as Row);
}

export async function countShopProducts(supabase: SupabaseClient, shopId: string) {
  const { data } = await supabase.from("products").select("status").eq("shop_id", shopId);
  const rows = (data ?? []) as { status: string }[];
  return {
    total: rows.length,
    visible: rows.filter((r) => r.status === "active" || r.status === "sold_out").length,
  };
}
