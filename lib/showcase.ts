import { createAdminClient } from "@/lib/supabase/admin";

// Affiches choisies par l'admin pour le site public (table showcase_creations, migration 0037).
// Images servies par /vitrine/{id} (app/vitrine/[id]/route.ts).

export interface ShowcaseItem {
  id: string;
  src: string;
  alt: string;
}

/** Les affiches de la vitrine, ordre choisi (sort) puis plus récentes d'abord. [] si indisponible. */
export async function getShowcaseCreations(limit = 6): Promise<ShowcaseItem[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const { data, error } = await createAdminClient()
      .from("showcase_creations")
      .select("creation_id, sort, created_at, creations!inner(product_name, poster_path, regenerations_used)")
      .not("creations.poster_path", "is", null)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => {
      const c = (Array.isArray(row.creations) ? row.creations[0] : row.creations) as {
        product_name: string;
        regenerations_used: number | null;
      };
      return {
        id: row.creation_id as string,
        // `v` change à chaque régénération : l'image en cache est remplacée.
        src: `/vitrine/${row.creation_id}.jpg?v=${c.regenerations_used ?? 0}`,
        alt: `Affiche créée avec Jaarle : ${c.product_name}`,
      };
    });
  } catch {
    return [];
  }
}
