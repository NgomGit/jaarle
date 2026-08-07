import type { SupabaseClient } from "@supabase/supabase-js";

export interface Creation {
  id: string;
  product_name: string;
  price: number | null;
  style: string;
  tier: string;
  photo_path: string | null;
  poster_path: string | null;
  poster_path_2: string | null;
  show_secondary_photos: boolean;
  regenerations_used: number;
  industry: string | null;
  language: string;
  generated_copy: string | null;
  generated_hashtags: string[] | null;
  unlocked: boolean;
  created_at: string;
  photoUrl: string | null;
  photoUrl2: string | null;
}

export async function listCreations(supabase: SupabaseClient, limit?: number): Promise<Creation[]> {
  let query = supabase.from("creations").select("*").order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(
    (row) =>
      ({
        ...row,
        // `v` change à chaque régénération (poster_path est réécrit) → force le navigateur à
        // recharger la nouvelle affiche au lieu de servir l'ancienne depuis le cache.
        photoUrl: `/api/creations/${row.id}/preview?v=${row.regenerations_used ?? 0}`,
        photoUrl2: row.poster_path_2 ? `/api/creations/${row.id}/preview?variant=2` : null,
      }) as Creation
  );
}

export async function getCreation(supabase: SupabaseClient, id: string, userId: string): Promise<Creation | null> {
  const { data, error } = await supabase.from("creations").select("*").eq("id", id).eq("user_id", userId).single();
  if (error || !data) return null;
  return {
    ...data,
    photoUrl: `/api/creations/${data.id}/preview?v=${data.regenerations_used ?? 0}`,
    photoUrl2: data.poster_path_2 ? `/api/creations/${data.id}/preview?variant=2` : null,
  } as Creation;
}

export async function countCreationsSince(supabase: SupabaseClient, since: Date): Promise<number> {
  const { count } = await supabase
    .from("creations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

/**
 * Créations générées mais jamais débloquées (payées) par cet utilisateur — sert de garde-fou
 * anti-abus : au-delà d'un certain nombre, on demande de payer au moins une création existante
 * avant d'en générer une nouvelle (voir MAX_UNPAID_CREATIONS dans generate-creation/route.ts).
 */
export interface CreationVersion {
  id: string;
  kind: string; // 'principale' | 'declinaison' | 'regeneration'
  createdAt: string;
  url: string;
}

/**
 * Historique des versions d'une affiche (variante principale, déclinaison, régénérations),
 * de la plus ancienne à la plus récente. RLS garantit qu'on ne lit que ses propres versions.
 */
export async function getCreationVersions(supabase: SupabaseClient, creationId: string): Promise<CreationVersion[]> {
  const { data, error } = await supabase
    .from("creation_versions")
    .select("id, kind, created_at")
    .eq("creation_id", creationId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((v) => ({
    id: v.id as string,
    kind: v.kind as string,
    createdAt: v.created_at as string,
    url: `/api/creations/${creationId}/preview?version=${v.id}`,
  }));
}

export async function countUnpaidCreations(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("creations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("unlocked", false);
  return count ?? 0;
}
