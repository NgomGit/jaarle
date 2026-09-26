import { createClient } from "@/lib/supabase/server";
import { listCreations } from "@/lib/supabase/creations";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { getMyShop } from "@/lib/shops/queries";
import { getShopStats } from "@/lib/shops/stats";
import { getEntitlements } from "@/lib/billing/entitlements";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.phone || "";

  const [recentCreations, shop, entitlements, postersCount, contentsCount] = await Promise.all([
    listCreations(supabase, 4),
    user ? getMyShop(supabase, user.id) : Promise.resolve(null),
    getEntitlements(),
    supabase.from("creations").select("id", { count: "exact", head: true }).then((r) => r.count ?? 0),
    supabase.from("marketing_packs").select("id", { count: "exact", head: true }).then((r) => r.count ?? 0),
  ]);

  // Valeur visible : ce que la boutique rapporte (7 derniers jours) et ce que Jaarle a produit.
  const [stats, everShared, everContacted] = shop
    ? await Promise.all([
        getShopStats(supabase, shop.id, 7),
        supabase.from("shop_events").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("type", "share_click").then((r) => (r.count ?? 0) > 0),
        supabase
          .from("shop_events")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shop.id)
          .in("type", ["whatsapp_click", "call_click"])
          .then((r) => (r.count ?? 0) > 0),
      ])
    : [null, false, false];

  const productsCount = entitlements.billingEnabled
    ? entitlements.productsCount
    : shop
      ? await supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).then((r) => r.count ?? 0)
      : 0;

  return (
    <DashboardHome
      displayName={displayName}
      recentCreations={recentCreations}
      shop={shop ? { name: shop.name, slug: shop.slug, status: shop.status } : null}
      value={{
        visitors7d: stats?.current.visitors ?? 0,
        whatsapp7d: stats?.current.whatsappClicks ?? 0,
        calls7d: stats?.current.calls ?? 0,
        products: productsCount,
        posters: postersCount,
        contents: contentsCount,
        remaining: entitlements.remainingGenerations,
        monthly: entitlements.monthlyGenerations,
        credits: entitlements.credits,
      }}
      journey={{
        shop: !!shop,
        products: productsCount > 0,
        poster: postersCount > 0,
        content: contentsCount > 0,
        shared: shop?.status === "published" && everShared,
        contact: everContacted,
      }}
      plan={entitlements.billingEnabled ? { isFree: entitlements.plan === "free", name: entitlements.planName } : null}
    />
  );
}
