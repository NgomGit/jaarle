import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { shopMediaUrl } from "@/lib/shops/media";
import { toLocalSenegal } from "@/lib/shops/format";
import { countShopProducts } from "@/lib/shops/products";
import { shopQrSvg } from "@/lib/shops/qr";
import { ShopOnboarding } from "@/components/shop/shop-onboarding";
import { ShopOverview } from "@/components/shop/shop-overview";

export default async function ShopPage({ searchParams }: { searchParams: { created?: string; published?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shop = await getMyShop(supabase, user.id);

  if (!shop) {
    const accountWhatsapp = (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";
    return <ShopOnboarding defaultWhatsapp={toLocalSenegal(accountWhatsapp).replace(/\D/g, "").slice(0, 9)} />;
  }

  const [productCounts, qrSvg] = await Promise.all([countShopProducts(supabase, shop.id), shopQrSvg(shop.slug)]);
  return (
    <ShopOverview
      shop={shop}
      logoUrl={shopMediaUrl(shop.logo_path)}
      justCreated={searchParams.created === "1"}
      justPublished={searchParams.published === "1"}
      productCounts={productCounts}
      qrSvg={qrSvg}
    />
  );
}
