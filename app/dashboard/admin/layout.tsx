import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminNav } from "@/components/admin/admin-nav";

// Espace admin : vérification unique + onglets (Vue d'ensemble · Signalements · Market).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  // Pastille « à traiter » sur l'onglet Signalements (0 si la table n'existe pas encore).
  const { count } = await createAdminClient()
    .from("shop_reports")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "reviewing"]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <AdminNav openReports={count ?? 0} />
      {children}
    </div>
  );
}
