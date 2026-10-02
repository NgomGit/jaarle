"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Choix de l'affiche affichée pour une fiche (migration 0031 : products.poster_key).
// On propose les affiches déjà liées à la fiche (toutes leurs versions) et les autres affiches
// récentes du commerçant, non liées : en choisir une la lie à la fiche.

export interface PosterOption {
  /** Valeur enregistrée dans products.poster_key : id de version, ou id d'affiche sans versions. */
  key: string;
  creationId: string;
  versionId: string | null;
  label: string;
  thumbUrl: string;
  unlocked: boolean;
  linked: boolean;
  createdAt: string;
}

export interface PosterChoices {
  options: PosterOption[];
  /** Clé effectivement affichée aujourd'hui (choix valable, sinon la règle par défaut). */
  currentKey: string | null;
  chosenKey: string | null;
}

const KIND_LABEL: Record<string, string> = { principale: "Affiche", declinaison: "Déclinaison", regeneration: "Nouvelle version" };

export async function listProductPosters(productId: string): Promise<PosterChoices> {
  const empty: PosterChoices = { options: [], currentKey: null, chosenKey: null };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: product } = await supabase.from("products").select("id, name, owner_id, poster_key").eq("id", productId).maybeSingle();
  if (!product || product.owner_id !== user.id) return empty;

  const [linkedRes, otherRes] = await Promise.all([
    supabase
      .from("creations")
      .select("id, product_name, unlocked, poster_path, created_at, creation_versions(id, kind, created_at)")
      .eq("user_id", user.id)
      .eq("product_id", productId)
      .not("poster_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("creations")
      .select("id, product_name, unlocked, poster_path, created_at, creation_versions(id, kind, created_at)")
      .eq("user_id", user.id)
      .is("product_id", null)
      .not("poster_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  type Row = { id: string; product_name: string; unlocked: boolean; created_at: string; creation_versions: { id: string; kind: string; created_at: string }[] | null };
  const options: PosterOption[] = [];
  const add = (rows: Row[] | null, linked: boolean) => {
    for (const c of rows ?? []) {
      const versions = [...(c.creation_versions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
      // Affiche liée : toutes ses versions ; autres affiches : la dernière version seulement.
      const shown = linked ? versions : versions.slice(0, 1);
      if (shown.length === 0) {
        options.push({ key: c.id, creationId: c.id, versionId: null, label: c.product_name, thumbUrl: `/api/creations/${c.id}/preview`, unlocked: c.unlocked, linked, createdAt: c.created_at });
      }
      for (const v of shown) {
        options.push({
          key: v.id,
          creationId: c.id,
          versionId: v.id,
          label: linked && versions.length > 1 ? KIND_LABEL[v.kind] ?? "Version" : c.product_name,
          thumbUrl: `/api/creations/${c.id}/preview?version=${v.id}`,
          unlocked: c.unlocked,
          linked,
          createdAt: v.created_at,
        });
      }
    }
  };
  add(linkedRes.data as Row[] | null, true);
  add(otherRes.data as Row[] | null, false);

  // Ce qui s'affiche aujourd'hui : le choix s'il est valable (lié + débloqué), sinon la dernière
  // version de la dernière affiche liée et débloquée — même règle que product_poster_key (0031).
  const chosenKey = (product.poster_key as string | null) ?? null;
  const chosen = options.find((o) => o.key === chosenKey && o.linked && o.unlocked);
  const fallback = options.find((o) => o.linked && o.unlocked);
  return { options: options.slice(0, 30), currentKey: chosen?.key ?? fallback?.key ?? null, chosenKey };
}

export async function chooseProductPoster(productId: string, creationId: string, versionId: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };

  const [{ data: product }, { data: creation }] = await Promise.all([
    supabase.from("products").select("id, slug, owner_id, shop_id, shops(slug)").eq("id", productId).maybeSingle(),
    supabase.from("creations").select("id, user_id, product_id").eq("id", creationId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!product || product.owner_id !== user.id || !creation) return { ok: false, error: "Affiche introuvable." };
  if (creation.product_id && creation.product_id !== productId) return { ok: false, error: "Cette affiche est liée à un autre produit." };

  if (versionId) {
    const { data: v } = await supabase.from("creation_versions").select("id").eq("id", versionId).eq("creation_id", creationId).maybeSingle();
    if (!v) return { ok: false, error: "Version introuvable." };
  }

  // Lier l'affiche à la fiche (les créations ne sont pas modifiables par le navigateur : clé serveur,
  // après les vérifications de propriété ci-dessus).
  if (!creation.product_id) {
    const { error } = await createAdminClient().from("creations").update({ product_id: productId, shop_id: product.shop_id }).eq("id", creationId).eq("user_id", user.id);
    if (error) return { ok: false, error: "Impossible de lier cette affiche." };
  }

  const { error } = await supabase.from("products").update({ poster_key: versionId ?? creationId }).eq("id", productId).eq("owner_id", user.id);
  if (error) return { ok: false, error: "Enregistrement impossible (migration 0031 exécutée ?)." };

  const shopSlug = (product.shops as unknown as { slug: string } | null)?.slug;
  revalidatePath(`/dashboard/produits/${productId}`);
  if (shopSlug) {
    revalidatePath(`/boutique/${shopSlug}`, "layout");
  }
  revalidatePath("/market", "layout");
  return { ok: true };
}
