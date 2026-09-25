// URLs publiques du bucket `shop-media` (bucket public : aucune signature nécessaire).
// Utilisable côté client et serveur.
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";

export function shopMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${SHOP_MEDIA_BUCKET}/${path}`;
}

/** Initiales pour le monogramme affiché quand la boutique n'a pas de logo. */
export function shopInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "J").slice(0, 2);
  return letters.toUpperCase();
}
