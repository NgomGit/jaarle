import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { listShopProducts } from "@/lib/shops/products";
import { ProductList } from "@/components/products/product-list";
import { ImportCreations, type ImportableCreation } from "@/components/products/import-creations";

export default async function ProductsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shop = await getMyShop(supabase, user.id);
  if (!shop) redirect("/dashboard/boutique"); // les produits vivent dans une boutique

  const [products, { data: creations }] = await Promise.all([
    listShopProducts(supabase, shop.id),
    supabase
      .from("creations")
      .select("id, product_name, price")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  // Affiches existantes pas encore ajoutées à la boutique (phase 7).
  const imported = new Set(products.map((p) => p.source_creation_id).filter(Boolean));
  const importable: ImportableCreation[] = ((creations ?? []) as { id: string; product_name: string; price: number | null }[])
    .filter((c) => !imported.has(c.id))
    .slice(0, 8)
    .map((c) => ({ id: c.id, name: c.product_name, price: c.price }));

  return (
    <>
      <ProductList products={products} justSaved={searchParams.saved === "1"} />
      <div className="mx-auto w-full max-w-3xl pb-24 sm:pb-6">
        <ImportCreations creations={importable} />
      </div>
    </>
  );
}
