"use server";

import { saveProduct, type ProductActionResult } from "@/app/dashboard/produits/actions";
import { bulkAccess, loadImport } from "@/lib/products/bulk-server";
import { BULK_GROUPS_MAX, groupMissing, productPhotoIds } from "@/lib/products/bulk-import";

/**
 * Crée le produit d'un groupe du lot (brouillon par défaut, publié si `publish`).
 * Lit le groupe EN BASE (le navigateur enregistre la session avant) et passe par saveProduct :
 * mêmes contrôles que le formulaire (marques, limite du plan, photos du vendeur).
 * Idempotente : un groupe déjà créé renvoie son produit (products.import_group_id unique).
 */
export async function createFromImportGroup(importId: string, groupId: string, publish: boolean): Promise<ProductActionResult> {
  const access = await bulkAccess();
  if (!access.ok) return { ok: false, error: access.error };
  const { supabase, userId } = access;

  const row = await loadImport(supabase, importId);
  if (!row) return { ok: false, error: "Import introuvable." };
  if (row.status === "done" || row.status === "canceled") return { ok: false, error: "Cet import est terminé." };
  const group = row.groups.find((g) => g.id === groupId);
  if (!group) return { ok: false, error: "Produit introuvable dans le lot. Réessaie." };

  const { data: existing } = await supabase.from("products").select("id").eq("owner_id", userId).eq("import_group_id", groupId).maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };

  if (group.excluded) return { ok: false, error: "Ce produit est exclu du lot." };
  const missing = groupMissing(group);
  if (missing.includes("name")) return { ok: false, error: "Donne un nom à ce produit." };
  if (missing.includes("photo")) return { ok: false, error: "Ce produit n'a pas de photo." };

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .in("import_group_id", row.groups.map((g) => g.id));
  if ((count ?? 0) >= BULK_GROUPS_MAX) return { ok: false, error: `${BULK_GROUPS_MAX} produits maximum par lot.` };

  const byId = new Map(row.items.map((i) => [i.id, i]));
  const images = productPhotoIds(row, group)
    .map((id) => byId.get(id))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .map((i) => ({ path: i.path, width: i.width ?? null, height: i.height ?? null }));

  const d = group.draft;
  return saveProduct({
    subjectType: d.subjectType,
    displayMedia: "photos",
    name: d.name.trim(),
    // Sans prix = « Prix sur demande ».
    price: d.price ?? null,
    description: d.description.trim() || undefined,
    category: d.category.trim() || undefined,
    marketCategory: d.marketCategory || null,
    options: d.options,
    status: publish ? "active" : "draft",
    images,
    importGroupId: group.id,
    aiSuggestions: { source: "bulk_import", importId: row.id, label: group.label },
  });
}
