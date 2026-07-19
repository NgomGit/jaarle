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
        photoUrl: `/api/creations/${row.id}/preview`,
        photoUrl2: row.poster_path_2 ? `/api/creations/${row.id}/preview?variant=2` : null,
      }) as Creation
  );
}

export async function getCreation(supabase: SupabaseClient, id: string, userId: string): Promise<Creation | null> {
  const { data, error } = await supabase.from("creations").select("*").eq("id", id).eq("user_id", userId).single();
  if (error || !data) return null;
  return {
    ...data,
    photoUrl: `/api/creations/${data.id}/preview`,
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
