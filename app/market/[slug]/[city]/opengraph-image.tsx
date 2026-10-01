import { getMarketCategory } from "@/lib/market/categories";
import { getMarketCity } from "@/lib/market/cities";
import { getMarketCounts, getMarketProducts, totalsFor } from "@/lib/market/queries";
import { marketOgImage, OG_SIZE } from "@/lib/market/og";
import { listingH1 } from "@/lib/market/seo";
import { formatPrice } from "@/lib/shops/format";

export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Jaarle Market";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

export default async function Image({ params }: { params: { slug: string; city: string } }) {
  const category = getMarketCategory(params.slug);
  const city = getMarketCity(params.city);
  const [counts, { items }] = await Promise.all([
    getMarketCounts(),
    getMarketProducts({ category, city: city?.slug ?? null, limit: 3 }),
  ]);
  const t = totalsFor(counts, category, city?.slug ?? null);
  return marketOgImage({
    eyebrow: city ? `Jaarle Market · ${city.name}` : "Jaarle Market",
    title: listingH1(category, city),
    subtitle: t.products > 0 ? `${t.products} produit${t.products > 1 ? "s" : ""}${t.minPrice != null ? ` dès ${formatPrice(t.minPrice)}` : ""}` : "Prix en FCFA, commande sur WhatsApp.",
    products: items,
  });
}
