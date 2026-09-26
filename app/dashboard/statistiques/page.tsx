import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { listShopProducts } from "@/lib/shops/products";
import { getShopStats } from "@/lib/shops/stats";
import { shopMediaThumbUrl } from "@/lib/shops/media";
import { ShopStatsView } from "@/components/stats/shop-stats-view";
import { getEntitlements } from "@/lib/billing/entitlements";

export default async function StatsPage({ searchParams }: { searchParams: { jours?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shop = await getMyShop(supabase, user.id);
  if (!shop) redirect("/dashboard/boutique");

  // Statistiques détaillées (30 jours, sources) selon l'offre ; 7 jours pour tous.
  const entitlements = await getEntitlements();
  const advanced = entitlements.analyticsLevel === "advanced";
  const days = advanced && searchParams.jours === "30" ? 30 : 7;
  const [stats, products] = await Promise.all([getShopStats(supabase, shop.id, days), listShopProducts(supabase, shop.id)]);
  const productInfo = Object.fromEntries(
    products.map((p) => [p.id, { name: p.name, thumbUrl: shopMediaThumbUrl(p.product_images[0]?.path) }])
  );

  return <ShopStatsView stats={stats} productInfo={productInfo} published={shop.status === "published"} shopSlug={shop.slug} advanced={advanced} />;
}
