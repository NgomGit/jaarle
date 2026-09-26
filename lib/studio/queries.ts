import type { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORMS } from "@/lib/studio/platforms";
import type { MarketingPack, MarketingPost } from "@/lib/studio/types";

const ORDER = PLATFORMS.map((p) => p.key);

function sortPosts(pack: MarketingPack): MarketingPack {
  return {
    ...pack,
    marketing_posts: [...(pack.marketing_posts ?? [])].sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform)),
  };
}

/** Dernier pack généré pour un produit (hors packs créés depuis une affiche ; RLS : propriétaire). */
export async function getLatestPack(supabase: SupabaseClient, productId: string): Promise<MarketingPack | null> {
  const { data } = await supabase
    .from("marketing_packs")
    .select("*, marketing_posts(*)")
    .eq("product_id", productId)
    .is("creation_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? sortPosts(data as MarketingPack) : null;
}

/** Dernier pack généré pour une affiche. */
export async function getLatestCreationPack(supabase: SupabaseClient, creationId: string): Promise<MarketingPack | null> {
  const { data } = await supabase
    .from("marketing_packs")
    .select("*, marketing_posts(*)")
    .eq("creation_id", creationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? sortPosts(data as MarketingPack) : null;
}

/** Nombre de packs générés par le commerçant depuis `since` (plafond de coût IA). */
export async function countPacksSince(supabase: SupabaseClient, ownerId: string, since: Date): Promise<number> {
  const { count } = await supabase
    .from("marketing_packs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

export type PostPackInfo = {
  product_id: string | null;
  shop_id: string | null;
  creation_id: string | null;
  creation_version_id: string | null;
  objective: string;
  promo_detail: string | null;
  extra_facts: string | null;
};

export async function getPack(supabase: SupabaseClient, packId: string): Promise<MarketingPack | null> {
  const { data } = await supabase.from("marketing_packs").select("*, marketing_posts(*)").eq("id", packId).maybeSingle();
  return data ? sortPosts(data as MarketingPack) : null;
}

export async function getPost(
  supabase: SupabaseClient,
  postId: string
): Promise<(MarketingPost & { marketing_packs: PostPackInfo }) | null> {
  const { data } = await supabase
    .from("marketing_posts")
    .select("*, marketing_packs(product_id, shop_id, creation_id, creation_version_id, objective, promo_detail, extra_facts)")
    .eq("id", postId)
    .maybeSingle();
  return (data as never) ?? null;
}
