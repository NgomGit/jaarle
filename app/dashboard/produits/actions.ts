"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { ProductInputSchema, type ProductInput } from "@/lib/shops/product-schema";
import { thumbPath } from "@/lib/shops/media";
import { storeProductImage } from "@/lib/shops/media-server";
import { productSlug } from "@/lib/shops/slug";
import { SHOP_MEDIA_BUCKET, type ProductStatus, type Shop } from "@/lib/shops/types";
import { LIMIT_MESSAGES } from "@/lib/billing/format";
import { stripBrands, stripBrandsFromName } from "@/lib/shops/brands";
import { isOwnPosterPath, isOwnVideoPath, PRODUCT_VIDEO_BUCKET, type ProductVideoDraft } from "@/lib/shops/video";
import { canUseProductVideo, getEntitlements, canUsePromo } from "@/lib/billing/entitlements";
import { PROMO_PRO_MESSAGE, promoEndFromDay, promoInputError } from "@/lib/shops/promo";

const VIDEO_PRO_MESSAGE = "La vidéo produit est réservée aux comptes Pro.";

export type ProductActionResult =
  | { ok: true; id: string; /** Produit enregistré mais vidéo non enregistrée (message à afficher). */ videoError?: string }
  | { ok: false; error: string; limit?: "products" | "feature" };

type Supabase = ReturnType<typeof createClient>;

async function context(): Promise<{ supabase: Supabase; userId: string; shop: Shop } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };
  const shop = await getMyShop(supabase, user.id);
  if (!shop) return { error: "Crée d'abord ta boutique." };
  if (shop.status === "suspended") return { error: "Ta boutique est suspendue. Contacte le support Jaarle." };
  return { supabase, userId: user.id, shop };
}

function revalidateShop(shop: Shop, productSlugValue?: string) {
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/boutique/${shop.slug}`);
  if (productSlugValue) revalidatePath(`/boutique/${shop.slug}/p/${productSlugValue}`);
  revalidatePath("/market", "layout");
  revalidatePath("/boutiques", "layout");
}

async function uniqueProductSlug(supabase: Supabase, shopId: string, name: string): Promise<string> {
  const base = productSlug(name);
  const { data } = await supabase.from("products").select("slug").eq("shop_id", shopId).like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base.slice(0, 74)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 70)}-${Date.now().toString(36)}`;
}

async function removeFiles(supabase: Supabase, paths: string[]) {
  if (paths.length === 0) return;
  const all = paths.flatMap((p) => [p, thumbPath(p)]);
  await supabase.storage.from(SHOP_MEDIA_BUCKET).remove(all).then(undefined, () => undefined);
}

/** Supprime les fichiers d'une vidéo (MP4 dans product-videos, aperçu dans shop-media). Jamais bloquant. */
async function removeVideoFiles(supabase: Supabase, video: { path: string; poster_path?: string | null }) {
  await supabase.storage.from(PRODUCT_VIDEO_BUCKET).remove([video.path]).then(undefined, () => undefined);
  if (video.poster_path) {
    await supabase.storage.from(SHOP_MEDIA_BUCKET).remove([video.poster_path]).then(undefined, () => undefined);
  }
}

/**
 * Synchronise la vidéo d'un produit (1 maximum) : ajout, remplacement (même ligne, nouveau fichier,
 * l'ancien est effacé du stockage) ou suppression. Renvoie un message en cas d'échec.
 */
async function syncProductVideo(
  supabase: Supabase,
  userId: string,
  productId: string,
  video: ProductVideoDraft | null
): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from("product_videos")
    .select("id, path, poster_path")
    .eq("product_id", productId)
    .maybeSingle();
  if (readError) {
    console.error("[produits/saveProduct] video read failed:", readError);
    return video ? "Produit enregistré, mais la vidéo n'a pas pu être enregistrée. Réessaie." : null;
  }
  const current = existing as { id: string; path: string; poster_path: string | null } | null;

  if (!video) {
    if (!current) return null;
    const { error } = await supabase.from("product_videos").delete().eq("id", current.id);
    if (error) {
      console.error("[produits/saveProduct] video delete failed:", error);
      return "La vidéo n'a pas pu être supprimée. Réessaie.";
    }
    await removeVideoFiles(supabase, current);
    return null;
  }

  const fields = {
    path: video.path,
    poster_path: video.posterPath,
    duration_ms: video.durationMs,
    file_size: video.fileSize,
    mime_type: "video/mp4",
    width: video.width,
    height: video.height,
  };
  if (current?.path === video.path) {
    if (current.poster_path === video.posterPath) return null;
    await supabase.from("product_videos").update({ poster_path: video.posterPath }).eq("id", current.id);
    return null;
  }
  const { error } = current
    ? await supabase.from("product_videos").update(fields).eq("id", current.id)
    : await supabase.from("product_videos").insert({ ...fields, product_id: productId, owner_id: userId });
  if (error) {
    if (error.message?.includes("PRO_REQUIRED:video")) return VIDEO_PRO_MESSAGE;
    console.error("[produits/saveProduct] video save failed:", error);
    return "Produit enregistré, mais la vidéo n'a pas pu être enregistrée. Réessaie.";
  }
  if (current) await removeVideoFiles(supabase, current);
  return null;
}

/** Crée (productId absent) ou met à jour un produit et synchronise ses photos (4 max) et sa vidéo (1 max). */
export async function saveProduct(input: ProductInput, productId?: string): Promise<ProductActionResult> {
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Informations invalides." };
  const data = parsed.data;

  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, userId, shop } = ctx;

  if (data.images.some((img) => !img.path.startsWith(`${userId}/products/`))) {
    return { ok: false, error: "Photo invalide." };
  }
  if (data.video && (!isOwnVideoPath(userId, data.video.path) || (data.video.posterPath && !isOwnPosterPath(userId, data.video.posterPath)))) {
    return { ok: false, error: "Vidéo invalide." };
  }
  // Nouvelle vidéo (ajout ou remplacement) : offre Pro requise. Garder ou supprimer une vidéo
  // existante reste possible après un retour en Gratuit. Vérifié AVANT d'enregistrer le produit.
  if (data.video) {
    const { data: current } = productId
      ? await supabase.from("product_videos").select("path").eq("product_id", productId).maybeSingle()
      : { data: null };
    if ((current as { path: string } | null)?.path !== data.video.path && !canUseProductVideo(await getEntitlements())) {
      return { ok: false, error: VIDEO_PRO_MESSAGE, limit: "feature" };
    }
  }

  // Promo (0046) : réservée au Pro pour en poser une ; la retirer reste toujours possible.
  // undefined = inchangée (imports, appels sans formulaire).
  let promoFields: { compare_at_price: number | null; promo_ends_at: string | null } | Record<string, never> = {};
  if (data.compareAtPrice !== undefined) {
    if (data.compareAtPrice == null) {
      promoFields = { compare_at_price: null, promo_ends_at: null };
    } else {
      const promoError = promoInputError(data.price, data.compareAtPrice);
      if (promoError) return { ok: false, error: promoError };
      const endsAt = promoEndFromDay(data.promoEndsOn);
      if (endsAt && new Date(endsAt).getTime() <= Date.now()) return { ok: false, error: "La date de fin de la promo doit être dans le futur." };
      if (!canUsePromo(await getEntitlements())) return { ok: false, error: PROMO_PRO_MESSAGE, limit: "feature" };
      promoFields = { compare_at_price: data.compareAtPrice, promo_ends_at: endsAt };
    }
  }

  // Règle de vente : aucun nom de marque dans les annonces (retiré automatiquement).
  const fields = {
    subject_type: data.subjectType,
    display_media: data.displayMedia,
    name: stripBrandsFromName(data.name),
    price: data.price,
    description: data.description ? stripBrands(data.description) || null : null,
    category: data.category,
    market_category: data.marketCategory ?? null,
    options: data.options,
    status: data.status,
    ...promoFields,
  };

  let id = productId;
  let slug: string;

  if (!id) {
    slug = await uniqueProductSlug(supabase, shop.id, fields.name);
    const { data: row, error } = await supabase
      .from("products")
      .insert({
        ...fields,
        shop_id: shop.id,
        owner_id: userId,
        slug,
        ai_suggestions: data.aiSuggestions ?? null,
        source_creation_id: data.sourceCreationId ?? null,
      })
      .select("id")
      .single();
    if (error?.message?.includes("PRO_REQUIRED:promo")) return { ok: false, error: PROMO_PRO_MESSAGE, limit: "feature" };
    if (error?.message?.includes("products_promo_valid")) return { ok: false, error: "Promo invalide : vérifie le prix promo et l'ancien prix." };
    if (error?.message?.includes("LIMIT_REACHED:products")) {
      // Limite du plan appliquée en base (trigger products_enforce_plan_limit).
      return { ok: false, error: LIMIT_MESSAGES.products, limit: "products" };
    }
    if (error || !row) {
      console.error("[produits/saveProduct] insert failed:", error);
      return { ok: false, error: "Impossible d'enregistrer le produit. Réessaie." };
    }
    id = row.id as string;
  } else {
    // Le slug ne change pas après création : le lien du produit a pu être partagé.
    const { data: row, error } = await supabase
      .from("products")
      .update(fields)
      .eq("id", id)
      .eq("owner_id", userId)
      .select("slug")
      .single();
    if (error?.message?.includes("PRO_REQUIRED:promo")) return { ok: false, error: PROMO_PRO_MESSAGE, limit: "feature" };
    if (error?.message?.includes("products_promo_valid")) return { ok: false, error: "Promo invalide : vérifie le prix promo et l'ancien prix." };
    if (error || !row) return { ok: false, error: "Produit introuvable." };
    slug = row.slug as string;
  }

  // Synchronisation des photos : suppression des retirées, puis positions, puis ajouts.
  const { data: existing } = await supabase.from("product_images").select("id, path").eq("product_id", id);
  const existingRows = (existing ?? []) as { id: string; path: string }[];
  const wanted = data.images.map((img) => img.path);
  const toDelete = existingRows.filter((r) => !wanted.includes(r.path));
  if (toDelete.length) {
    await supabase.from("product_images").delete().in("id", toDelete.map((r) => r.id));
    await removeFiles(supabase, toDelete.map((r) => r.path));
  }
  for (const [position, img] of data.images.entries()) {
    const current = existingRows.find((r) => r.path === img.path);
    if (current) {
      await supabase.from("product_images").update({ position }).eq("id", current.id);
    } else {
      const { error } = await supabase.from("product_images").insert({
        product_id: id,
        owner_id: userId,
        path: img.path,
        position,
        width: img.width ?? null,
        height: img.height ?? null,
      });
      if (error) console.error("[produits/saveProduct] image insert failed:", error);
    }
  }

  // Vidéo : seulement si le formulaire l'envoie (undefined = inchangée, ex. import d'affiche).
  const videoError = data.video !== undefined ? await syncProductVideo(supabase, userId, id, data.video ?? null) : null;

  revalidateShop(shop, slug);
  return videoError ? { ok: true, id, videoError } : { ok: true, id };
}

/**
 * Vidéo envoyée puis abandonnée dans le formulaire (remplacée ou retirée avant d'enregistrer) :
 * on efface le fichier tout de suite, s'il n'est rattaché à aucun produit. Jamais bloquant.
 */
export async function discardVideoUpload(path: string, posterPath: string | null): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwnVideoPath(user.id, path)) return;
  if (posterPath && !isOwnPosterPath(user.id, posterPath)) return;
  const { data } = await supabase.from("product_videos").select("id").eq("path", path).maybeSingle();
  if (data) return; // déjà enregistrée sur un produit : saveProduct s'en chargera
  await removeVideoFiles(supabase, { path, poster_path: posterPath });
}

export async function setProductStatus(productId: string, status: ProductStatus): Promise<ProductActionResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { data, error } = await ctx.supabase
    .from("products")
    .update({ status })
    .eq("id", productId)
    .eq("owner_id", ctx.userId)
    .select("slug")
    .single();
  if (error || !data) return { ok: false, error: "Produit introuvable." };
  revalidateShop(ctx.shop, data.slug as string);
  return { ok: true, id: productId };
}

/** Produit masqué par Jaarle : le vendeur l'a corrigé et demande une vérification (0044). */
export async function requestProductReview(productId: string): Promise<ProductActionResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  // La date est posée par la base (trigger products_guard_moderation), seulement si le produit est masqué.
  const { data, error } = await ctx.supabase
    .from("products")
    .update({ review_requested_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("owner_id", ctx.userId)
    .not("moderated_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Produit introuvable." };
  revalidatePath("/dashboard/produits");
  revalidatePath(`/dashboard/produits/${productId}`);
  return { ok: true, id: productId };
}

export async function deleteProduct(productId: string): Promise<ProductActionResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, userId, shop } = ctx;
  const { data: images } = await supabase.from("product_images").select("path").eq("product_id", productId);
  const { data: video } = await supabase.from("product_videos").select("path, poster_path").eq("product_id", productId).maybeSingle();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("owner_id", userId)
    .select("slug")
    .single();
  if (error || !data) return { ok: false, error: "Produit introuvable." };
  await removeFiles(supabase, ((images ?? []) as { path: string }[]).map((i) => i.path));
  if (video) await removeVideoFiles(supabase, video as { path: string; poster_path: string | null });
  revalidateShop(shop, data.slug as string);
  return { ok: true, id: productId };
}

/**
 * Phase 7 — « Ajouter à ma boutique » depuis une affiche existante : crée un produit BROUILLON
 * pré-rempli (nom, prix, photos copiées vers shop-media, description), que le commerçant vérifie
 * puis publie. La création d'origine n'est pas modifiée.
 */
export async function importCreationAsProduct(creationId: string): Promise<ProductActionResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, userId, shop } = ctx;

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("shop_id", shop.id)
    .eq("source_creation_id", creationId)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };

  const { data: creation } = await supabase
    .from("creations")
    .select("id, product_name, price, photo_path, extra_photo_paths, subject_type, service_description, generated_copy")
    .eq("id", creationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!creation) return { ok: false, error: "Création introuvable." };

  const sourcePaths = [creation.photo_path, ...((creation.extra_photo_paths as string[] | null) ?? [])]
    .filter((p): p is string => !!p)
    .slice(0, 4);
  const images: { path: string; width: number; height: number }[] = [];
  for (const path of sourcePaths) {
    const { data: blob } = await supabase.storage.from("creations").download(path);
    if (!blob) continue;
    const stored = await storeProductImage(supabase, userId, Buffer.from(await blob.arrayBuffer()));
    if (stored) images.push(stored);
  }

  const description =
    (creation.subject_type === "service" && creation.service_description) || creation.generated_copy || undefined;

  return saveProduct({
    subjectType: creation.subject_type === "service" ? "service" : "product",
    name: String(creation.product_name).slice(0, 120),
    price: creation.price as number | null,
    description: description ? String(description).slice(0, 2000) : undefined,
    status: "draft",
    options: [],
    images,
    sourceCreationId: creation.id as string,
  });
}
