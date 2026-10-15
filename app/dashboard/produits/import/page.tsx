import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { getEntitlements } from "@/lib/billing/entitlements";
import { bulkUploadLimits } from "@/lib/billing/features";
import { isBulkTester, isBulkUploadOpen } from "@/lib/products/bulk-flags";
import { loadImport, publicImport } from "@/lib/products/bulk-server";
import { BULK_IMPORTS_PER_DAY } from "@/lib/products/bulk-import";
import { BulkImport } from "@/components/products/bulk/bulk-import";

export const dynamic = "force-dynamic";

export default async function BulkImportPage({ searchParams }: { searchParams: { id?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const shop = await getMyShop(supabase, user.id);
  if (!shop || shop.status === "suspended") redirect("/dashboard/boutique");

  const entitlements = await getEntitlements();
  const limits = bulkUploadLimits(entitlements);
  // Phase pilote + formule (Pro / Business) : sinon retour à la liste (la carte y affiche « Bientôt » ou le cadenas).
  if (!isBulkUploadOpen(user) || !limits) redirect("/dashboard/produits");

  const row = searchParams.id ? await loadImport(supabase, searchParams.id) : null;
  if (searchParams.id && !row) redirect("/dashboard/produits/import");

  const { count: grouped } = await supabase
    .from("product_imports")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .not("grouped_at", "is", null);

  // Même calcul que le plafond appliqué par POST …/group (lots analysés sur 24 h glissantes).
  const { count: today } = await supabase
    .from("product_imports")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .gte("grouped_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  const creditsLeft = entitlements.remainingGenerations == null ? null : entitlements.remainingGenerations + entitlements.credits;

  return (
    <BulkImport
      key={row?.id ?? "new"}
      initial={row ? publicImport(row) : null}
      limits={limits}
      firstFree={(grouped ?? 0) === 0}
      creditsLeft={creditsLeft}
      analysesLeftToday={isBulkTester(user) ? undefined : Math.max(0, BULK_IMPORTS_PER_DAY - (today ?? 0))}
    />
  );
}
