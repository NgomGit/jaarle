import type { StorefrontTheme } from "@/lib/storefront/theme";
import type { ProductOption } from "@/lib/shops/types";

// Contrat commun à tous les templates de vitrine. Les pages /boutique/... préparent ces données
// (sérialisables, déjà formatées) puis délèguent l'affichage au template choisi par la boutique.
// Ajouter un template = implémenter ShopView + ProductView et l'enregistrer dans ./index.ts.

export interface StorefrontShop {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categoryLabel: string | null;
  city: string | null;
  location: string | null;
  whatsappDisplay: string;
  whatsappHref: string; // /r/wa/{slug} — compte le clic puis ouvre WhatsApp
  phoneHref: string; // tel:+221… (téléphone de la boutique, sinon son WhatsApp)
  logoUrl: string | null;
  bannerUrl: string | null;
  url: string;
  onlineSince: string | null; // ex. « septembre 2026 »
  productCount: number;
  socials: { instagram?: string; facebook?: string; tiktok?: string };
  jaarleBadge: boolean; // mention « Boutique propulsée par Jaarle » (offre gratuite)
  referralCode: string | null; // code de parrainage du commerçant (lien « Crée ta boutique »)
}

export interface StorefrontProductCard {
  id: string;
  slug: string;
  name: string;
  priceLabel: string;
  hasPrice: boolean;
  /** Prix numérique (panier). */
  price?: number | null;
  category: string | null;
  soldOut: boolean;
  isNew: boolean;
  /** Service (prestation) : affiché avec son affiche, prix « À partir de », bouton « Réserver ». */
  isService?: boolean;
  thumbUrl: string | null;
  fullUrl: string | null;
  url: string; // lien public du produit (partage)
  /** Le produit a une vidéo (petit badge ▶ sur la carte, migration 0035). */
  hasVideo?: boolean;
}

/** Vidéo d'une fiche produit (30 s max, MP4) — chargée seulement au clic sur lecture. */
export interface StorefrontProductVideo {
  url: string;
  posterUrl: string | null;
  durationMs: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
}

export interface StorefrontProductDetail extends StorefrontProductCard {
  description: string | null;
  images: string[];
  options: ProductOption[];
  video: StorefrontProductVideo | null;
}

export interface ShopViewProps {
  shop: StorefrontShop;
  products: StorefrontProductCard[];
  theme: StorefrontTheme;
}

export interface ProductViewProps {
  shop: StorefrontShop;
  product: StorefrontProductDetail;
  related: StorefrontProductCard[];
  theme: StorefrontTheme;
  /** Catégorie Jaarle Market du produit (fil d'Ariane quand le visiteur vient du Market). */
  marketCategory?: { slug: string; label: string } | null;
}

export interface StorefrontTemplate {
  key: string;
  label: string;
  description: string;
  ShopView: (props: ShopViewProps) => JSX.Element;
  ProductView: (props: ProductViewProps) => JSX.Element;
}
