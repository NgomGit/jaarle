import { formatPrice, siteUrl } from "@/lib/shops/format";
import type { ProductWithImages } from "@/lib/shops/products";
import type { Shop } from "@/lib/shops/types";

// SEO centralisé : URLs absolues, règles d'indexation, textes de description et données
// structurées (JSON-LD schema.org). Tout ce qui touche au référencement passe par ici.

export const SITE_NAME = "Jaarle";
export const SITE_LOCALE = "fr_SN";

/** Une boutique n'est indexée qu'à partir de ce nombre de produits visibles (pas de pages pauvres). */
export const MIN_PRODUCTS_TO_INDEX = 3;

export function absoluteUrl(path = "/"): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** JSON-LD sûr à injecter dans <script> : neutralise « </script> » et les commentaires HTML. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** Texte brut court pour une meta description (≈ 155 caractères, coupé sur un mot). */
export function metaDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trim()}…`;
}

export function shopLocation(shop: Pick<Shop, "district" | "city">): string {
  return [shop.district, shop.city].filter(Boolean).join(", ");
}

export function isShopIndexable(productCount: number): boolean {
  return productCount >= MIN_PRODUCTS_TO_INDEX;
}

/** Titre de page d'une boutique : « Awa Couture — Mode à Dakar ». */
export function shopTitle(shop: Shop): string {
  const place = shop.city ? ` à ${shop.city}` : "";
  return shop.category_label ? `${shop.name} — ${shop.category_label}${place}` : `${shop.name}${place ? ` — Boutique${place}` : ""}`;
}

/** Description d'une boutique : la sienne, sinon construite à partir de ses vrais produits. */
export function shopDescription(shop: Shop, products: Pick<ProductWithImages, "name">[]): string {
  if (shop.description?.trim()) return metaDescription(shop.description);
  const loc = shopLocation(shop);
  const names = products.slice(0, 3).map((p) => p.name);
  const list = names.length ? ` Découvrez ${names.join(", ")}${products.length > 3 ? "…" : "."}` : "";
  return metaDescription(
    `${shop.category_label ?? "Boutique en ligne"}${loc ? ` à ${loc}` : ""}.${list} Prix en FCFA, commande directe sur WhatsApp.`
  );
}

export function productDescription(shop: Shop, product: ProductWithImages): string {
  if (product.description?.trim()) return metaDescription(product.description);
  const loc = shop.city ? ` à ${shop.city}` : "";
  return metaDescription(`${product.name} chez ${shop.name}${loc} — ${formatPrice(product.price)}. Commandez directement sur WhatsApp.`);
}

// ─── Données structurées ────────────────────────────────────────────────────

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/images/logo-icon.png"),
    areaServed: { "@type": "Country", name: "Sénégal" },
    address: { "@type": "PostalAddress", addressLocality: "Dakar", addressCountry: "SN" },
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    name: SITE_NAME,
    url: absoluteUrl("/"),
    inLanguage: "fr-SN",
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}

export function softwareApplicationLd(plans: { name: string; price_fcfa: number; is_purchasable: boolean }[]) {
  const offers = plans
    .filter((p) => p.is_purchasable)
    .map((p) => ({ "@type": "Offer", name: `Jaarle ${p.name}`, price: p.price_fcfa, priceCurrency: "XOF" }));
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    url: absoluteUrl("/"),
    description:
      "Boutique en ligne gratuite, affiches créées par l'IA et publications prêtes pour Instagram, Facebook, TikTok et WhatsApp, pour les commerçants du Sénégal.",
    inLanguage: "fr-SN",
    publisher: { "@id": absoluteUrl("/#organization") },
    ...(offers.length ? { offers } : {}),
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

function productOffer(p: ProductWithImages, url: string, sellerName: string) {
  if (p.price == null) return undefined;
  return {
    "@type": "Offer",
    price: p.price,
    priceCurrency: "XOF",
    availability: p.status === "sold_out" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    url,
    seller: { "@type": "Organization", name: sellerName },
  };
}

/** Boutique : Store + catalogue (ItemList de ses produits). */
export function storeLd(opts: {
  shop: Shop;
  url: string;
  logo: string | null;
  products: { product: ProductWithImages; url: string; image: string | null }[];
}) {
  const { shop, url, logo } = opts;
  const socials = Object.values(shop.socials ?? {}).filter((s): s is string => !!s && /^https?:\/\//.test(s));
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${url}#store`,
    name: shop.name,
    description: shop.description ?? undefined,
    url,
    image: logo ?? undefined,
    logo: logo ?? undefined,
    telephone: shop.whatsapp,
    currenciesAccepted: "XOF",
    sameAs: socials.length ? socials : undefined,
    address: shop.city
      ? { "@type": "PostalAddress", addressLocality: shop.city, streetAddress: shop.district ?? undefined, addressCountry: "SN" }
      : { "@type": "PostalAddress", addressCountry: "SN" },
    hasOfferCatalog: opts.products.length
      ? {
          "@type": "OfferCatalog",
          name: `Produits de ${shop.name}`,
          itemListElement: opts.products.slice(0, 30).map(({ product, url: purl, image }) => ({
            "@type": "Offer",
            ...(product.price != null ? { price: product.price, priceCurrency: "XOF" } : {}),
            url: purl,
            itemOffered: { "@type": "Product", name: product.name, url: purl, image: image ?? undefined },
          })),
        }
      : undefined,
  };
}

export function productLd(opts: { shop: Shop; shopUrl: string; product: ProductWithImages; url: string; images: string[] }) {
  const { shop, product, url } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    description: product.description ?? undefined,
    image: opts.images.length ? opts.images : undefined,
    category: product.category ?? undefined,
    url,
    brand: { "@type": "Brand", name: shop.name },
    offers: productOffer(product, url, shop.name),
  };
}
