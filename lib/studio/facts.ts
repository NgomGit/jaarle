import { buildCulturalContext } from "@/lib/knowledge/context";
import { getIndustry } from "@/lib/knowledge/industries";
import { formatPrice, formatSenegalPhone, shopPublicUrl } from "@/lib/shops/format";
import type { ProductWithImages } from "@/lib/shops/products";
import type { Shop } from "@/lib/shops/types";
import type { StudioObjective } from "@/lib/studio/objectives";

// « Fiche de faits » : la SEULE source d'informations commerciales autorisée pour l'IA.
// On n'y met que ce qui existe réellement en base ou ce que le commerçant vient de saisir.

export interface StudioFacts {
  shopName: string;
  activity: string | null;
  location: string | null;
  whatsapp: string | null;
  shopUrl: string | null;
  productName: string;
  priceLabel: string; // « 25 000 FCFA » ou « Prix sur demande »
  hasPrice: boolean;
  description: string | null;
  category: string | null;
  options: string[];
  soldOut: boolean;
  subjectType: "product" | "service";
  objective: StudioObjective;
  promoDetail: string | null;
  extraFacts: string | null;
  industryKey: string | null;
  existingCopy: string | null; // texte de vente déjà rédigé pour l'affiche (contexte de ton)
}

export function buildFacts(
  shop: Shop,
  product: ProductWithImages,
  objective: StudioObjective,
  promoDetail: string | null,
  extraFacts: string | null
): StudioFacts {
  const industry = getIndustry(shop.industry ?? undefined);
  return {
    shopName: shop.name,
    activity: [industry?.labelFr, shop.category_label].filter(Boolean).join(" — ") || null,
    location: [shop.district, shop.city].filter(Boolean).join(", ") || null,
    whatsapp: formatSenegalPhone(shop.whatsapp),
    shopUrl: shopPublicUrl(shop.slug).replace(/^https?:\/\//, ""),
    productName: product.name,
    priceLabel: formatPrice(product.price),
    hasPrice: product.price != null,
    description: product.description,
    category: product.category,
    options: (product.options ?? []).map((o) => `${o.name} : ${o.values.join(", ")}`),
    soldOut: product.status === "sold_out",
    subjectType: product.subject_type,
    objective,
    promoDetail: promoDetail?.trim() || null,
    extraFacts: extraFacts?.trim() || null,
    industryKey: shop.industry,
    existingCopy: null,
  };
}

/** Champs d'une affiche (table creations) utiles au Studio. */
export interface StudioCreation {
  id: string;
  product_name: string;
  price: number | null;
  industry: string | null;
  generated_copy: string | null;
  business_name: string | null;
  contact_phone: string | null;
  subject_type: string | null;
  service_description: string | null;
  service_items: string[] | null;
  unlocked: boolean;
  tier: string;
  format: string | null;
  shop_id: string | null;
  product_id: string | null;
}

/**
 * Fiche de faits d'une AFFICHE : les infos saisies lors de la création de l'affiche, complétées par
 * la boutique et le produit liés s'ils existent. Le prix et le nom restent ceux de l'affiche : ce
 * sont eux qui figurent sur le visuel publié.
 */
export function buildFactsFromCreation(
  creation: StudioCreation,
  shop: Shop | null,
  product: ProductWithImages | null,
  objective: StudioObjective,
  promoDetail: string | null,
  extraFacts: string | null
): StudioFacts {
  const industryKey = creation.industry || shop?.industry || null;
  const industry = getIndustry(industryKey ?? undefined);
  const phone = creation.contact_phone || shop?.whatsapp || null;
  const isService = creation.subject_type === "service" || product?.subject_type === "service";
  const serviceItems = (creation.service_items ?? []).filter(Boolean);
  const description =
    [creation.service_description, product?.description, serviceItems.length ? `Prestations : ${serviceItems.join(", ")}` : null]
      .filter(Boolean)
      .join("\n") || null;
  return {
    shopName: creation.business_name?.trim() || shop?.name || creation.product_name,
    activity: [industry?.labelFr, shop?.category_label].filter(Boolean).join(" — ") || null,
    location: shop ? [shop.district, shop.city].filter(Boolean).join(", ") || null : null,
    whatsapp: phone ? formatSenegalPhone(phone) : null,
    shopUrl: shop?.status === "published" ? shopPublicUrl(shop.slug).replace(/^https?:\/\//, "") : null,
    productName: creation.product_name,
    priceLabel: formatPrice(creation.price),
    hasPrice: creation.price != null,
    description,
    category: product?.category ?? null,
    options: (product?.options ?? []).map((o) => `${o.name} : ${o.values.join(", ")}`),
    soldOut: product?.status === "sold_out",
    subjectType: isService ? "service" : "product",
    objective,
    promoDetail: promoDetail?.trim() || null,
    extraFacts: extraFacts?.trim() || null,
    industryKey,
    existingCopy: creation.generated_copy?.trim() || null,
  };
}

/** Texte de la fiche de faits envoyé à l'IA (uniquement les lignes renseignées). */
export function factsToPrompt(f: StudioFacts): string {
  const lines = [
    `Boutique : ${f.shopName}`,
    f.activity && `Activité : ${f.activity}`,
    f.location && `Localisation : ${f.location} (Sénégal)`,
    f.whatsapp ? `WhatsApp pour commander : ${f.whatsapp}` : "Contact : par message privé (aucun numéro fourni, n'en invente pas)",
    f.shopUrl ? `Lien de la boutique : ${f.shopUrl}` : "Lien de boutique : aucun (ne cite aucun site ni lien)",
    `${f.subjectType === "service" ? "Service" : "Produit"} : ${f.productName}`,
    `Prix : ${f.priceLabel}${f.hasPrice ? " (à reprendre EXACTEMENT sous cette forme)" : " (ne JAMAIS citer de montant)"}`,
    f.category && `Catégorie : ${f.category}`,
    f.description && `Description fournie par le commerçant : ${f.description}`,
    f.options.length > 0 && `Options disponibles : ${f.options.join(" ; ")}`,
    f.soldOut && "Disponibilité : actuellement épuisé (inviter à demander le prochain arrivage, pas à acheter maintenant)",
    f.promoDetail && `Offre (saisie par le commerçant, à reprendre fidèlement) : ${f.promoDetail}`,
    f.extraFacts && `Précisions du commerçant : ${f.extraFacts}`,
    f.existingCopy &&
      `Texte déjà utilisé avec l'affiche (inspiration de ton uniquement, ne pas en reprendre de chiffre ni de promesse absente des faits ci-dessus) : ${f.existingCopy}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function culturalContext(f: StudioFacts): string {
  return buildCulturalContext({ industryKey: f.industryKey ?? undefined });
}
