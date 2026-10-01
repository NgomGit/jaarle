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

export type ProductActionResult = { ok: true; id: string } | { ok: false; error: string; limit?: "products" };

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

/** Crée (productId absent) ou met à jour un produit et synchronise ses photos (4 max). */
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

  revalidateShop(shop, slug);
  return { ok: true, id };
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

export async function deleteProduct(productId: string): Promise<ProductActionResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, userId, shop } = ctx;
  const { data: images } = await supabase.from("product_images").select("path").eq("product_id", productId);
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("owner_id", userId)
    .select("slug")
    .single();
  if (error || !data) return { ok: false, error: "Produit introuvable." };
  await removeFiles(supabase, ((images ?? []) as { path: string }[]).map((i) => i.path));
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
