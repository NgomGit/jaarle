"use server";

import { revalidatePath } from "next/cache";
import { logAdminAction, requireAdmin } from "@/lib/admin/guard";
import type { RelanceReason } from "./segments";

/**
 * Trace d'une relance WhatsApp (journal admin_actions) : évite les doubles relances.
 * Boutique (shop.contacted) ou, pour un compte sans boutique, utilisateur (user.contacted).
 */
export async function markContacted(targetId: string, reason: RelanceReason): Promise<{ ok: boolean }> {
  const { userId } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(targetId)) return { ok: false };
  if (reason === "no_shop") {
    await logAdminAction(userId, "user.contacted", "user", targetId, { reason });
  } else {
    const r = reason === "no_products" || reason === "wa_unverified" ? reason : "draft_with_products";
    await logAdminAction(userId, "shop.contacted", "shop", targetId, { reason: r });
  }
  revalidatePath("/dashboard/admin/relances");
  return { ok: true };
}
