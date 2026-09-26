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
  category: string | null;
  soldOut: boolean;
  isNew: boolean;
  thumbUrl: string | null;
  fullUrl: string | null;
  url: string; // lien public du produit (partage)
}

export interface StorefrontProductDetail extends StorefrontProductCard {
  description: string | null;
  images: string[];
  options: ProductOption[];
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
}

export interface StorefrontTemplate {
  key: string;
  label: string;
  description: string;
  ShopView: (props: ShopViewProps) => JSX.Element;
  ProductView: (props: ProductViewProps) => JSX.Element;
}
