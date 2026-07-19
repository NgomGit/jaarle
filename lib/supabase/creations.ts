import type { SupabaseClient } from "@supabase/supabase-js";

export interface Creation {
  id: string;
  product_name: string;
  price: number;
  style: string;
  photo_path: string;
  poster_path: string | null;
  industry: string | null;
  language: string;
  generated_copy: string | null;
  generated_hashtags: string[] | null;
  unlocked: boolean;
  created_at: string;
  photoUrl: string | null;
}

export async function listCreations(supabase: SupabaseClient, limit?: number): Promise<Creation[]> {
  let query = supabase.from("creations").select("*").order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({ ...row, photoUrl: `/api/creations/${row.id}/preview` }) as Creation);
}

export async function countCreationsSince(supabase: SupabaseClient, since: Date): Promise<number> {
  const { count } = await supabase
    .from("creations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  return count ?? 0;
}
