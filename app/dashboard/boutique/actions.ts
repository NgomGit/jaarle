"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ShopInputSchema, type ShopInput } from "@/lib/shops/schema";
import { slugify, validateSlug, withSuffix, type SlugProblem } from "@/lib/shops/slug";
import { toE164Senegal } from "@/lib/shops/format";
import { getMyShop } from "@/lib/shops/queries";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";

export type ActionResult = { ok: true; slug: string } | { ok: false; error: string; field?: string };

export type SlugCheck =
  | { status: "available"; slug: string }
  | { status: "taken"; slug: string; suggestion: string | null }
  | { status: "invalid"; slug: string; problem: SlugProblem };

const UNIQUE_VIOLATION = "23505";

async function isSlugAvailable(supabase: ReturnType<typeof createClient>, slug: string): Promise<boolean> {
  // Fonction SQL security definer : voit aussi les boutiques brouillon des autres (masquées par la RLS).
  const { data, error } = await supabase.rpc("is_shop_slug_available", { p_slug: slug });
  if (error) throw error;
  return data === true;
}

async function findFreeSlug(supabase: ReturnType<typeof createClient>, base: string): Promise<string | null> {
  for (let n = 2; n <= 9; n++) {
    const candidate = withSuffix(base, n);
    if (await isSlugAvailable(supabase, candidate)) return candidate;
  }
  return null;
}

/** Vérifie un lien de boutique pendant la saisie (onboarding / édition). */
export async function checkShopSlug(rawSlug: string): Promise<SlugCheck> {
  const slug = slugify(rawSlug);
  const problem = validateSlug(slug);
  if (problem) return { status: "invalid", slug, problem };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "invalid", slug, problem: "invalid" };

  // Le slug actuel de sa propre boutique est « disponible » pour soi.
  const mine = await getMyShop(supabase, user.id);
  if (mine?.slug === slug) return { status: "available", slug };

  if (await isSlugAvailable(supabase, slug)) return { status: "available", slug };
  return { status: "taken", slug, suggestion: await findFreeSlug(supabase, slug) };
}

function firstIssue(input: ShopInput): { error: string; field?: string } | null {
  const parsed = ShopInputSchema.safeParse(input);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return { error: issue?.message || "Informations invalides.", field: issue?.path?.[0]?.toString() };
}

function ownsPath(userId: string, path: string | null | undefined): boolean {
  return !path || path.startsWith(`${userId}/`);
}

export async function createShop(input: ShopInput): Promise<ActionResult> {
  const invalid = firstIssue(input);
  if (invalid) return { ok: false, ...invalid };
  const data = ShopInputSchema.parse(input);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!ownsPath(user.id, data.logoPath)) return { ok: false, error: "Logo invalide.", field: "logoPath" };

  const existing = await getMyShop(supabase, user.id);
  if (existing) return { ok: true, slug: existing.slug }; // double clic / retour arrière : pas de doublon

  const row = {
    owner_id: user.id,
    name: data.name,
    industry: data.industry,
    category_label: data.categoryLabel,
    whatsapp: toE164Senegal(data.whatsapp),
    city: data.city,
    district: data.district,
    description: data.description,
    logo_path: data.logoPath ?? null,
    status: "draft" as const, // publication avec la page publique (phase 4)
  };

  // Le slug a pu être pris entre la vérification et l'envoi : on bascule sur une variante suffixée.
  let slug = data.slug;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from("shops").insert({ ...row, slug });
    if (!error) {
      revalidatePath("/dashboard", "layout");
      return { ok: true, slug };
    }
    if (error.code === UNIQUE_VIOLATION && error.message.includes("shops_one_per_owner")) {
      const mine = await getMyShop(supabase, user.id);
      return mine ? { ok: true, slug: mine.slug } : { ok: false, error: "Tu as déjà une boutique." };
    }
    if (error.code === UNIQUE_VIOLATION) {
      const free = await findFreeSlug(supabase, data.slug);
      if (!free) break;
      slug = free;
      continue;
    }
    console.error("[boutique/createShop] insert failed:", error);
    return { ok: false, error: "Impossible de créer la boutique pour le moment. Réessaie." };
  }
  return { ok: false, error: "Ce lien est déjà pris. Choisis-en un autre.", field: "slug" };
}

export async function updateShop(input: ShopInput): Promise<ActionResult> {
  const invalid = firstIssue(input);
  if (invalid) return { ok: false, ...invalid };
  const data = ShopInputSchema.parse(input);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!ownsPath(user.id, data.logoPath)) return { ok: false, error: "Logo invalide.", field: "logoPath" };

  const shop = await getMyShop(supabase, user.id);
  if (!shop) return { ok: false, error: "Boutique introuvable." };
  if (shop.status === "suspended") return { ok: false, error: "Ta boutique est suspendue. Contacte le support Jaarle." };

  // Le lien ne change plus après publication : il a pu être partagé, imprimé en QR code…
  const slug = shop.status === "draft" ? data.slug : shop.slug;
  if (slug !== shop.slug && !(await isSlugAvailable(supabase, slug))) {
    return { ok: false, error: "Ce lien est déjà pris. Choisis-en un autre.", field: "slug" };
  }

  const logoPath = data.logoPath ?? null;
  const { error } = await supabase
    .from("shops")
    .update({
      slug,
      name: data.name,
      industry: data.industry,
      category_label: data.categoryLabel,
      whatsapp: toE164Senegal(data.whatsapp),
      city: data.city,
      district: data.district,
      description: data.description,
      logo_path: logoPath,
    })
    .eq("id", shop.id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, error: "Ce lien est déjà pris.", field: "slug" };
    console.error("[boutique/updateShop] update failed:", error);
    return { ok: false, error: "Impossible d'enregistrer pour le moment. Réessaie." };
  }

  // Ancien logo remplacé ou retiré : nettoyage best-effort (sans bloquer l'utilisateur).
  if (shop.logo_path && shop.logo_path !== logoPath) {
    await supabase.storage.from(SHOP_MEDIA_BUCKET).remove([shop.logo_path]).catch(() => undefined);
  }

  revalidatePath("/dashboard", "layout");
  // Nom, logo, ville… changés : vitrine, Market et annuaire à jour tout de suite.
  revalidatePath(`/boutique/${slug}`, "layout");
  revalidatePath("/market", "layout");
  revalidatePath("/boutiques", "layout");
  return { ok: true, slug };
}

/** Met la boutique en ligne (au moins un produit visible requis) ou la repasse en brouillon. */
export async function setShopPublished(published: boolean): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };

  const shop = await getMyShop(supabase, user.id);
  if (!shop) return { ok: false, error: "Boutique introuvable." };
  if (shop.status === "suspended") return { ok: false, error: "Ta boutique est suspendue. Contacte le support Jaarle." };

  if (published) {
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .in("status", ["active", "sold_out"]);
    if (!count) return { ok: false, error: "Ajoute au moins un produit disponible avant de publier." };
  }

  const { error } = await supabase
    .from("shops")
    .update({ status: published ? "published" : "draft" })
    .eq("id", shop.id);
  if (error) {
    console.error("[boutique/setShopPublished] failed:", error);
    return { ok: false, error: "Impossible de modifier la publication pour le moment." };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/boutique/${shop.slug}`, "layout");
  // Hors ligne → disparaît tout de suite du Market et de l'annuaire (pages en cache 5 min sinon).
  revalidatePath("/market", "layout");
  revalidatePath("/boutiques", "layout");
  return { ok: true, slug: shop.slug };
}
