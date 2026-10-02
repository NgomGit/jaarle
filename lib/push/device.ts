import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Abonnement push de l'appareil courant (cookie posé par savePushSubscription).

export const PUSH_COOKIE = "jaarle_push";

/** Appelée par logout() : l'appareil courant ne reçoit plus les notifications du compte. */
export async function forgetDevicePushSubscription(userId: string): Promise<void> {
  const id = cookies().get(PUSH_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await createAdminClient().from("push_subscriptions").delete().eq("id", id).eq("user_id", userId);
  } catch {
    /* rien de bloquant à la déconnexion */
  }
  cookies().delete(PUSH_COOKIE);
}
