"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Choix de l'affiche affichée pour une fiche (migration 0031 : products.poster_key).
// On ne propose que les affiches de CE produit (créées depuis la fiche ou liées à elle), avec leurs
// versions. Le vendeur peut en choisir une, ou la retirer (la photo s'affiche alors).

export const NO_POSTER = "00000000-0000-0000-0000-000000000000";

export interface PosterOption {
  /** Valeur enregistrée dans products.poster_key : id de version, ou id d'affiche sans versions. */
  key: string;
  creationId: string;
  versionId: string | null;
  label: string;
  thumbUrl: string;
  unlocked: boolean;
  createdAt: string;
}

export interface PosterChoices {
  options: PosterOption[];
  /** Ce qui s'affiche aujourd'hui (null : la photo). */
  currentKey: string | null;
  /** Choix enregistré : une clé, NO_POSTER (retirée) ou null (automatique : la plus récente). */
  chosenKey: string | null;
}

const KIND_LABEL: Record<string, string> = { principale: "Affiche", declinaison: "Déclinaison", regeneration: "Nouvelle version" };

async function ownedProduct(productId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: product } = await supabase
    .from("products")
    .select("id, owner_id, poster_key, shops(slug)")
    .eq("id", productId)
    .maybeSingle();
  if (!product || product.owner_id !== user.id) return null;
  return { supabase, user, product };
}

export async function listProductPosters(productId: string): Promise<PosterChoices> {
  const empty: PosterChoices = { options: [], currentKey: null, chosenKey: null };
  const ctx = await ownedProduct(productId);
  if (!ctx) return empty;
  const { supabase, user, product } = ctx;

  const { data } = await supabase
    .from("creations")
    .select("id, product_name, unlocked, created_at, creation_versions(id, kind, created_at)")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .not("poster_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  type Row = { id: string; product_name: string; unlocked: boolean; created_at: string; creation_versions: { id: string; kind: string; created_at: string }[] | null };
  const options: PosterOption[] = [];
  for (const c of (data ?? []) as Row[]) {
    const versions = [...(c.creation_versions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (versions.length === 0) {
      options.push({ key: c.id, creationId: c.id, versionId: null, label: "Affiche", thumbUrl: `/api/creations/${c.id}/preview`, unlocked: c.unlocked, createdAt: c.created_at });
    }
    for (const v of versions) {
      options.push({
        key: v.id,
        creationId: c.id,
        versionId: v.id,
        label: KIND_LABEL[v.kind] ?? "Version",
        thumbUrl: `/api/creations/${c.id}/preview?version=${v.id}`,
        unlocked: c.unlocked,
        createdAt: v.created_at,
      });
    }
  }

  // Même règle que product_poster_key (0031) : retirée → photo ; choix valable ; sinon la plus récente débloquée.
  const chosenKey = (product.poster_key as string | null) ?? null;
  let currentKey: string | null = null;
  if (chosenKey !== NO_POSTER) {
    // Les affiches non débloquées s'affichent aussi (signées Jaarle) ; les débloquées passent d'abord.
    const chosen = options.find((o) => o.key === chosenKey);
    currentKey = chosen?.key ?? options.find((o) => o.unlocked)?.key ?? options[0]?.key ?? null;
  }
  return { options: options.slice(0, 24), currentKey, chosenKey };
}

function revalidate(productId: string, shopSlug: string | undefined) {
  revalidatePath(`/dashboard/produits/${productId}`);
  if (shopSlug) revalidatePath(`/boutique/${shopSlug}`, "layout");
  revalidatePath("/market", "layout");
}

export async function chooseProductPoster(productId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownedProduct(productId);
  if (!ctx) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  const { supabase, user, product } = ctx;

  // La clé doit être une version (ou une affiche sans versions) d'une affiche de ce produit.
  const [{ data: version }, { data: creation }] = await Promise.all([
    supabase.from("creation_versions").select("id, creations!inner(product_id, user_id)").eq("id", key).maybeSingle(),
    supabase.from("creations").select("id, product_id").eq("id", key).eq("user_id", user.id).maybeSingle(),
  ]);
  const vOwner = (version?.creations as unknown as { product_id: string | null; user_id: string } | null) ?? null;
  const valid = (version && vOwner?.product_id === productId && vOwner.user_id === user.id) || (creation && creation.product_id === productId);
  if (!valid) return { ok: false, error: "Affiche introuvable pour ce produit." };

  const { error } = await supabase.from("products").update({ poster_key: key }).eq("id", productId).eq("owner_id", user.id);
  if (error) return { ok: false, error: "Enregistrement impossible (migration 0031 exécutée ?)." };
  revalidate(productId, (product.shops as unknown as { slug: string } | null)?.slug);
  return { ok: true };
}

/** Retirer l'affiche : la photo s'affiche à la place (dans la boutique et sur le Market). */
export async function removeProductPoster(productId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownedProduct(productId);
  if (!ctx) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  const { supabase, user, product } = ctx;
  const { error } = await supabase.from("products").update({ poster_key: NO_POSTER }).eq("id", productId).eq("owner_id", user.id);
  if (error) return { ok: false, error: "Enregistrement impossible (migration 0031 exécutée ?)." };
  revalidate(productId, (product.shops as unknown as { slug: string } | null)?.slug);
  return { ok: true };
}
