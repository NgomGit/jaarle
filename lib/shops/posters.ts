import { formatPrice, siteUrl } from "@/lib/shops/format";

// Services : ils s'affichent avec leur AFFICHE (bucket privé « creations », servie par /affiche/{clé}),
// jamais avec la photo envoyée. La clé vient des fonctions SQL (migration 0023) : id de la dernière
// version de la dernière affiche débloquée liée à la fiche.

/** URL publique (absolue : aussi utilisée par les images d'aperçu et le JSON-LD) d'une affiche. */
export function posterUrl(key: string | null | undefined): string | null {
  return key ? `${siteUrl()}/affiche/${key}` : null;
}

/** Prix affiché : « À partir de … » pour un service, « Sur devis » s'il n'a pas de prix. */
export function itemPriceLabel(price: number | null | undefined, isService: boolean): string {
  if (!isService) return formatPrice(price);
  return price != null ? `À partir de ${formatPrice(price)}` : "Sur devis";
}
