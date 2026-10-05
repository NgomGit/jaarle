"use server";

import { revalidatePath } from "next/cache";
import { logAdminAction, requireAdmin } from "@/lib/admin/guard";

/** Trace « boutique relancée sur WhatsApp » (journal admin_actions) : évite les doubles relances. */
export async function markShopContacted(shopId: string): Promise<{ ok: boolean }> {
  const { userId } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(shopId)) return { ok: false };
  await logAdminAction(userId, "shop.contacted", "shop", shopId, { reason: "draft_with_products" });
  revalidatePath("/dashboard/admin/relances");
  return { ok: true };
}
