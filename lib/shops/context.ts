// Contexte de marque pour les futurs prompts IA (affiches, statuts WhatsApp, captions, promos…).
// C'est la brique qui permettra à Jaarle de « connaître la boutique » : identité, activité,
// localisation, ton, produit. Fonction pure, non encore branchée sur le générateur existant —
// elle viendra compléter (pas remplacer) buildCulturalContext de lib/knowledge/context.ts.

import { getIndustry } from "@/lib/knowledge/industries";
import { formatPrice } from "@/lib/shops/format";
import type { Product, Shop } from "@/lib/shops/types";

export function buildShopContext(
  shop: Pick<Shop, "name" | "industry" | "category_label" | "city" | "district" | "description" | "brand">,
  product?: Pick<Product, "name" | "description" | "price" | "options" | "subject_type"> | null
): string {
  const industry = getIndustry(shop.industry ?? undefined);
  const lines: string[] = [];

  lines.push(`Boutique : « ${shop.name} ».`);
  if (industry || shop.category_label) {
    lines.push(`Activité : ${[industry?.labelFr, shop.category_label].filter(Boolean).join(" — ")}.`);
  }
  const location = [shop.district, shop.city].filter(Boolean).join(", ");
  if (location) lines.push(`Localisation : ${location} (Sénégal).`);
  if (shop.description) lines.push(`Présentation par le commerçant : ${shop.description}`);
  if (shop.brand?.tone) lines.push(`Ton de marque souhaité : ${shop.brand.tone}.`);
  else if (industry) lines.push(`Ton conseillé pour le secteur : ${industry.toneHint}`);

  if (product) {
    const kind = product.subject_type === "service" ? "Service" : "Produit";
    lines.push(`${kind} : « ${product.name} », ${formatPrice(product.price)}.`);
    if (product.description) lines.push(`Description : ${product.description}`);
    for (const opt of product.options ?? []) {
      if (opt.values.length) lines.push(`${opt.name} disponibles : ${opt.values.join(", ")}.`);
    }
  }

  return lines.join("\n");
}
