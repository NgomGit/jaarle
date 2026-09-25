import type { SupabaseClient } from "@supabase/supabase-js";
import type { Shop } from "@/lib/shops/types";

/** Boutique du commerçant connecté (MVP : une seule par compte), ou null. */
export async function getMyShop(supabase: SupabaseClient, userId: string): Promise<Shop | null> {
  const { data, error } = await supabase.from("shops").select("*").eq("owner_id", userId).maybeSingle();
  if (error || !data) return null;
  return data as Shop;
}
