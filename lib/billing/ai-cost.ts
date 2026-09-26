import { createAdminClient } from "@/lib/supabase/admin";
import { tokenCostUsd } from "@/lib/billing/usage";

// Journal des coûts IA (table ai_calls, écrite par le serveur uniquement). Jamais bloquant.
// Permet de calculer : coût IA / utilisateur, / boutique, / génération, / mois.

export async function logAiCall(entry: {
  userId?: string | null;
  feature: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  images?: number | null;
  estCostUsd?: number | null;
  usageEventId?: string | null;
  shopId?: string | null;
  creationId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const cost =
    entry.estCostUsd ??
    (entry.model && (entry.inputTokens || entry.outputTokens) ? tokenCostUsd(entry.model, entry.inputTokens ?? 0, entry.outputTokens ?? 0) : 0);
  try {
    await createAdminClient()
      .from("ai_calls")
      .insert({
        user_id: entry.userId ?? null,
        feature: entry.feature,
        model: entry.model ?? null,
        input_tokens: entry.inputTokens ?? null,
        output_tokens: entry.outputTokens ?? null,
        images: entry.images ?? null,
        est_cost_usd: Math.round(cost * 100000) / 100000,
        usage_event_id: entry.usageEventId ?? null,
        shop_id: entry.shopId ?? null,
        creation_id: entry.creationId ?? null,
        meta: entry.meta ?? null,
      });
  } catch {
    // la mesure ne doit jamais faire échouer une génération
  }
}
