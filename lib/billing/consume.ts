import { createAdminClient } from "@/lib/supabase/admin";
import { LIMIT_MESSAGES } from "@/lib/billing/format";
import type { LimitReachedPayload, UsageAction, UsageSource } from "@/lib/billing/types";

// Consommation des générations (quota du mois, puis crédits) — exécutée côté serveur avec la clé
// service_role : le navigateur ne peut ni consommer pour un autre, ni se rembourser, ni s'offrir
// des crédits. Si la migration 0019 n'est pas appliquée, tout est autorisé (« legacy »).

export type ConsumeResult =
  | { ok: true; eventId: string | null; source: UsageSource }
  | { ok: false; reason: "limit" }
  | { ok: false; reason: "error"; message: string };

function isMissingFunction(message: string): boolean {
  return /could not find the function|does not exist|schema cache/i.test(message);
}

export async function consumeUsage(params: {
  userId: string;
  action: UsageAction;
  units: number;
  sources?: ("quota" | "credits")[];
  creationId?: string | null;
  packId?: string | null;
  shopId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<ConsumeResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: true, eventId: null, source: "legacy" };
  const { data, error } = await createAdminClient().rpc("consume_usage", {
    p_user: params.userId,
    p_action: params.action,
    p_units: params.units,
    p_sources: params.sources ?? ["quota", "credits"],
    p_creation: params.creationId ?? null,
    p_pack: params.packId ?? null,
    p_shop: params.shopId ?? null,
    p_meta: params.meta ?? null,
  });
  if (error) {
    if (error.message.includes("LIMIT_REACHED")) return { ok: false, reason: "limit" };
    if (isMissingFunction(error.message)) return { ok: true, eventId: null, source: "legacy" };
    console.error("[billing] consume_usage failed:", error.message);
    return { ok: false, reason: "error", message: error.message };
  }
  const row = data as { event_id: string; source: UsageSource };
  return { ok: true, eventId: row.event_id, source: row.source };
}

/** Rembourse une consommation (génération échouée). Sans effet si déjà remboursée. */
export async function refundUsage(eventId: string | null | undefined): Promise<void> {
  if (!eventId || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { error } = await createAdminClient().rpc("refund_usage", { p_event: eventId });
  if (error) console.error("[billing] refund_usage failed:", error.message);
}

/** Rattache après coup la consommation à la ressource créée (affiche, pack). */
export async function attachUsage(eventId: string | null | undefined, ref: { creationId?: string; packId?: string }): Promise<void> {
  if (!eventId || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  await createAdminClient()
    .from("usage_events")
    .update({ ...(ref.creationId ? { creation_id: ref.creationId } : {}), ...(ref.packId ? { pack_id: ref.packId } : {}) })
    .eq("id", eventId)
    .then(undefined, () => undefined);
}

export function limitPayload(limit: LimitReachedPayload["limit"]): LimitReachedPayload {
  return { error: "limit_reached", limit, message: LIMIT_MESSAGES[limit] };
}
