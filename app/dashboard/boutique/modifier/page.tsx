import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { shopMediaUrl } from "@/lib/shops/media";
import { ShopEditForm } from "@/components/shop/shop-edit-form";

export default async function EditShopPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shop = await getMyShop(supabase, user.id);
  if (!shop || shop.status === "suspended") redirect("/dashboard/boutique");

  return <ShopEditForm shop={shop} logoUrl={shopMediaUrl(shop.logo_path)} />;
}
