import { randomUUID } from "crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { thumbPath } from "@/lib/shops/media";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";

/**
 * Normalise une photo produit (orientation, 1200 px max, WebP) + miniature 400 px, et l'enregistre
 * dans le bucket public shop-media. Mêmes réglages que /api/shop-media/upload (kind = product).
 */
export async function storeProductImage(
  supabase: SupabaseClient,
  userId: string,
  input: Buffer
): Promise<{ path: string; width: number; height: number } | null> {
  try {
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const path = `${userId}/products/${randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from(SHOP_MEDIA_BUCKET)
      .upload(path, data, { contentType: "image/webp", cacheControl: "31536000" });
    if (error) return null;
    const thumb = await sharp(data).resize({ width: 400, height: 400, fit: "inside" }).webp({ quality: 75 }).toBuffer();
    await supabase.storage
      .from(SHOP_MEDIA_BUCKET)
      .upload(thumbPath(path), thumb, { contentType: "image/webp", cacheControl: "31536000" })
      .then(undefined, () => undefined);
    return { path, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
