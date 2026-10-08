import { notFound, redirect } from "next/navigation";
import { activePromo, promoEndLabel } from "@/lib/shops/promo";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/shops/format";
import { shopMediaThumbUrl, shopMediaUrl } from "@/lib/shops/media";
import { loadOwnedProduct } from "@/lib/studio/load";
import { getLatestPack } from "@/lib/studio/queries";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export default async function StudioProductPage({ params }: { params: { productId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const loaded = await loadOwnedProduct(supabase, user.id, params.productId);
  if ("error" in loaded) {
    if (loaded.status === 400) redirect("/dashboard/boutique");
    notFound();
  }
  const { shop, product } = loaded;
  const pack = await getLatestPack(supabase, product.id);

  return (
    <StudioWorkspace
      initialPack={pack}
      product={{
        id: product.id,
        name: product.name,
        priceLabel: formatPrice(product.price),
        thumbUrl: shopMediaThumbUrl(product.product_images[0]?.path),
        hasPhoto: product.product_images.length > 0,
        promoDetail: studioPromoDetail(product),
      }}
      shop={{ name: shop.name, handle: shop.slug, logoUrl: shopMediaUrl(shop.logo_path), city: shop.city }}
    />
  );
}

/** « Prix promo : 12 000 FCFA au lieu de 15 000 FCFA (-20 %), jusqu'au 12 oct. » — repris mot pour mot par l'IA. */
function studioPromoDetail(p: { price: number | null; compare_at_price: number | null; promo_ends_at?: string | null }): string | null {
  const promo = activePromo(p.price, p.compare_at_price, p.promo_ends_at);
  if (!promo || p.price == null) return null;
  const end = promoEndLabel(promo.endsAt);
  return `Prix promo : ${formatPrice(p.price)} au lieu de ${promo.oldPriceLabel} (-${promo.percent} %)${end ? `, ${end}` : ""}.`;
}

