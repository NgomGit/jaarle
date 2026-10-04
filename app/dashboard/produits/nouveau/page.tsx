import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { ProductForm } from "@/components/products/product-form";
import { canUseProductVideo, getEntitlements } from "@/lib/billing/entitlements";
import { canAddProduct } from "@/lib/billing/format";
import { LimitPage } from "@/components/billing/limit-page";

export default async function NewProductPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shop = await getMyShop(supabase, user.id);
  if (!shop || shop.status === "suspended") redirect("/dashboard/boutique");

  // Limite de produits du plan (aussi appliquée en base par un trigger).
  const entitlements = await getEntitlements();
  if (!canAddProduct(entitlements)) {
    return <LimitPage reason="products" limit={entitlements.productsLimit} backHref="/dashboard/produits" backLabelKey="dashboard.nav_products" />;
  }

  return <ProductForm videoAllowed={canUseProductVideo(entitlements)} />;
}
