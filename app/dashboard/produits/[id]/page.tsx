import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProductById } from "@/lib/shops/products";
import { ProductForm } from "@/components/products/product-form";
import { canUseProductVideo, getEntitlements } from "@/lib/billing/entitlements";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { imported?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [product, entitlements] = await Promise.all([getProductById(supabase, params.id), getEntitlements()]);
  if (!product || product.owner_id !== user.id) notFound();

  return (
    <ProductForm product={product} importedNote={searchParams.imported === "1"} videoAllowed={canUseProductVideo(entitlements)} />
  );
}
