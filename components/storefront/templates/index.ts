import { ModerneProductView } from "@/components/storefront/templates/moderne/product-view";
import { ModerneShopView } from "@/components/storefront/templates/moderne/shop-view";
import type { StorefrontTemplate } from "@/components/storefront/templates/types";

// Registre des templates de vitrine. La boutique choisit via shops.brand.template ;
// une clé inconnue ou absente retombe sur le template par défaut.
// Pour en ajouter un : créer un dossier (ex. ./elegant) avec ShopView + ProductView, puis l'ajouter ici.

export const STOREFRONT_TEMPLATES: Record<string, StorefrontTemplate> = {
  moderne: {
    key: "moderne",
    label: "Moderne",
    description: "Clair et épuré, aux couleurs de ton logo. Idéal pour tous les commerces.",
    ShopView: ModerneShopView,
    ProductView: ModerneProductView,
  },
};

export const DEFAULT_TEMPLATE = "moderne";

export function getStorefrontTemplate(key: string | null | undefined): StorefrontTemplate {
  return STOREFRONT_TEMPLATES[key ?? ""] ?? STOREFRONT_TEMPLATES[DEFAULT_TEMPLATE];
}
