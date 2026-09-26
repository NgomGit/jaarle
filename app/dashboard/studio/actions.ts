"use server";

import { createClient } from "@/lib/supabase/server";

/** Mémorise la variante choisie pour une plateforme (celle qui sera téléchargée / publiée). */
export async function selectVariant(postId: string, index: number): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !Number.isInteger(index) || index < 0 || index > 9) return { ok: false };
  const { error } = await supabase
    .from("marketing_posts")
    .update({ selected_variant: index })
    .eq("id", postId)
    .eq("owner_id", user.id);
  return { ok: !error };
}

/** Compte une copie de texte (mesure d'usage du Studio). Jamais bloquant. */
export async function trackCopy(postId: string): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("marketing_post_track", { p_post_id: postId, p_action: "copy" }).then(undefined, () => undefined);
}

/** Change la version d'affiche utilisée pour les visuels d'un pack (sans relancer l'IA). */
export async function setPackVersion(packId: string, versionId: string | null): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  // Le trigger marketing_packs_check_owner vérifie que la version appartient bien à l'affiche du pack.
  const { error } = await supabase
    .from("marketing_packs")
    .update({ creation_version_id: versionId })
    .eq("id", packId)
    .eq("owner_id", user.id)
    .not("creation_id", "is", null);
  return { ok: !error };
}
