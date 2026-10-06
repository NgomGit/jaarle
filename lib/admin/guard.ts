import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";

/** Vérifie que l'utilisateur connecté est admin (account_profiles.is_admin). 404 sinon. */
export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ent = await getEntitlements();
  if (!ent.isAdmin) notFound();
  return { userId: user.id };
}

/** Trace d'une action admin (table admin_actions, migration 0026). N'échoue jamais. */
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: "shop" | "report" | "boost" | "product" | "settings" | "user" | "creation",
  targetId: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await createAdminClient().from("admin_actions").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
  } catch {
    // Journal indisponible (migration 0026 non exécutée) : l'action principale reste faite.
  }
}
