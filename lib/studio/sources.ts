import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFacts, buildFactsFromCreation, type StudioFacts } from "@/lib/studio/facts";
import { loadOwnedCreation, loadOwnedProduct } from "@/lib/studio/load";
import type { StudioObjective } from "@/lib/studio/objectives";
import type { PostPackInfo } from "@/lib/studio/queries";

/** Reconstruit la fiche de faits d'un pack existant (affiche ou produit), en revérifiant la propriété. */
export async function factsForPack(
  supabase: SupabaseClient,
  userId: string,
  pack: PostPackInfo
): Promise<{ facts: StudioFacts; locked: boolean } | { error: string; status: number }> {
  const objective = pack.objective as StudioObjective;
  if (pack.creation_id) {
    const loaded = await loadOwnedCreation(supabase, userId, pack.creation_id);
    if ("error" in loaded) return loaded;
    return {
      facts: buildFactsFromCreation(loaded.creation, loaded.shop, loaded.product, objective, pack.promo_detail, pack.extra_facts),
      locked: !loaded.creation.unlocked, // affiche non payée : visuels signés « Créé avec Jaarle »
    };
  }
  if (!pack.product_id) return { error: "Contenu introuvable.", status: 404 };
  const loaded = await loadOwnedProduct(supabase, userId, pack.product_id);
  if ("error" in loaded) return loaded;
  return { facts: buildFacts(loaded.shop, loaded.product, objective, pack.promo_detail, pack.extra_facts), locked: false };
}
