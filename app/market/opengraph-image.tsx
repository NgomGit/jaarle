import { getMarketProducts } from "@/lib/market/queries";
import { marketOgImage, OG_SIZE } from "@/lib/market/og";

export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Jaarle Market — les boutiques du Sénégal";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

export default async function Image() {
  const { items } = await getMarketProducts({ limit: 3 });
  return marketOgImage({
    eyebrow: "Le marché des boutiques Pro",
    title: "Les boutiques du Sénégal, au même endroit",
    subtitle: "Prix en FCFA, commande directe sur WhatsApp.",
    products: items,
  });
}
