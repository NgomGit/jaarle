// Types des entités Jaarle 2.0 (voir supabase/migrations/0015_shops_products.sql).
// Les noms de champs suivent exactement les colonnes SQL (snake_case), comme pour `Creation`.

export type ShopStatus = "draft" | "published" | "suspended";
export type ProductStatus = "draft" | "active" | "sold_out" | "hidden";
export type SubjectType = "product" | "service";
export type DisplayMedia = "poster" | "photos";

export interface ShopBrand {
  /** Template de vitrine (voir components/storefront/templates). Défaut : "moderne". */
  template?: string;
  accentFrom?: string;
  accentTo?: string;
  tone?: string;
  language?: "fr" | "wo";
}

export interface ShopSocials {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
}

export interface Shop {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string | null;
  category_label: string | null;
  city: string | null;
  district: string | null;
  whatsapp: string;
  phone: string | null;
  logo_path: string | null;
  banner_path: string | null;
  socials: ShopSocials;
  hours: string | null;
  brand: ShopBrand;
  status: ShopStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface Product {
  id: string;
  shop_id: string;
  owner_id: string;
  slug: string;
  subject_type: SubjectType;
  name: string;
  description: string | null;
  price: number | null; // null = « Prix sur demande »
  compare_at_price: number | null;
  category: string | null;
  /** Catégorie Jaarle Market (clé de feuille), migration 0020. */
  market_category?: string | null;
  /** Service : image affichée (migration 0024) — l'affiche ou les photos. */
  display_media?: DisplayMedia;
  /** Affiche choisie (version ou affiche) pour les services réglés sur « l'affiche » (migration 0031). */
  poster_key?: string | null;
  options: ProductOption[];
  status: ProductStatus;
  /** Masqué par l'admin (migration 0044) : raison, et demande de vérification du vendeur. */
  moderated_at?: string | null;
  moderated_reason?: string | null;
  review_requested_at?: string | null;
  position: number;
  ai_suggestions: Record<string, unknown> | null;
  source_creation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  owner_id: string;
  path: string;
  position: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

/** Vidéo d'un produit (migration 0035) : une au maximum, 30 s, MP4 dans le bucket product-videos. */
export interface ProductVideo {
  id: string;
  product_id: string;
  owner_id: string;
  path: string;
  poster_path: string | null;
  duration_ms: number;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
}

export type ShopEventType =
  | "shop_view"
  | "product_view"
  | "whatsapp_click"
  | "share_click"
  | "qr_scan"
  | "order_click"
  | "call_click"
  | "product_video_play";

/** Bucket public des images de boutique (≠ bucket privé `creations` du générateur). */
export const SHOP_MEDIA_BUCKET = "shop-media";

/** Nombre maximal de photos par produit (garanti aussi par un trigger SQL). */
export const MAX_PRODUCT_IMAGES = 4;
