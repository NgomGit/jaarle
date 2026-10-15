import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { listShopProducts } from "@/lib/shops/products";
import { ProductList } from "@/components/products/product-list";
import { ImportCreations, type ImportableCreation } from "@/components/products/import-creations";
import { canUseBulkUpload, getEntitlements } from "@/lib/billing/entitlements";
import { isBulkUploadOpen } from "@/lib/products/bulk-flags";

export default async function ProductsPage({ searchParams }: { searchParams: { saved?: string; imported?: string; published?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shop = await getMyShop(supabase, user.id);
  if (!shop) redirect("/dashboard/boutique"); // les produits vivent dans une boutique

  const [products, { data: creations }, entitlements] = await Promise.all([
    listShopProducts(supabase, shop.id),
    supabase
      .from("creations")
      .select("id, product_name, price")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(24),
    getEntitlements(),
  ]);

  // Affiches existantes pas encore ajoutées à la boutique (phase 7).
  const imported = new Set(products.map((p) => p.source_creation_id).filter(Boolean));
  const importable: ImportableCreation[] = ((creations ?? []) as { id: string; product_name: string; price: number | null }[])
    .filter((c) => !imported.has(c.id))
    .slice(0, 8)
    .map((c) => ({ id: c.id, name: c.product_name, price: c.price }));

  // Import en lot : lot en cours à reprendre (phase pilote, table créée par 0048 — absente = aucun).
  const bulkIncluded = canUseBulkUpload(entitlements);
  const bulkOpen = bulkIncluded && isBulkUploadOpen(user);
  let bulkResumeId: string | null = null;
  if (bulkOpen) {
    const { data: open } = await supabase
      .from("product_imports")
      .select("id")
      .eq("owner_id", user.id)
      .in("status", ["analyzing", "review"])
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    bulkResumeId = (open?.id as string | undefined) ?? null;
  }

  return (
    <>
      <ProductList
        products={products}
        justSaved={searchParams.saved === "1"}
        imported={Math.max(0, Number(searchParams.imported) || 0)}
        importedPublished={searchParams.published === "1"}
        bulkIncluded={bulkIncluded}
        bulkOpen={bulkOpen}
        bulkResumeId={bulkResumeId}
      />
      <div className="mx-auto w-full max-w-3xl pb-24 sm:pb-6">
        <ImportCreations creations={importable} />
      </div>
    </>
  );
}
