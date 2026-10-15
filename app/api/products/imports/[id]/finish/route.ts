import { NextResponse } from "next/server";
import { bulkAccess, loadImport, publicImport } from "@/lib/products/bulk-server";
import { ImportPartitionSchema, correctionStats, unusedItemPaths } from "@/lib/products/bulk-import";
import { thumbPath } from "@/lib/shops/media";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";

// POST /api/products/imports/{id}/finish — termine le lot ({ cancel: true } = abandon).
// Efface du stockage les photos du lot qui ne servent à AUCUN produit (vérifié en base, pas sur
// la foi du navigateur). Les produits déjà créés ne sont jamais touchés.

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await bulkAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase, userId } = access;
  const body = (await request.json().catch(() => ({}))) as { cancel?: boolean };

  const row = await loadImport(supabase, params.id);
  if (!row) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
  if (row.status === "done" || row.status === "canceled") return NextResponse.json({ import: publicImport(row) });

  const paths = row.items.map((i) => i.path);
  const { data: used } = await supabase.from("product_images").select("path").eq("owner_id", userId).in("path", paths);
  const usedPaths = new Set(((used ?? []) as { path: string }[]).map((r) => r.path));
  const unused = unusedItemPaths(row, usedPaths).filter((p) => p.startsWith(`${userId}/products/`));
  if (unused.length) {
    await supabase.storage
      .from(SHOP_MEDIA_BUCKET)
      .remove(unused.flatMap((p) => [p, thumbPath(p)]))
      .then(undefined, () => undefined);
  }

  // Produits réellement créés par ce lot (vérité = products.import_group_id).
  const groupIds = row.groups.map((g) => g.id);
  const { data: created } = groupIds.length
    ? await supabase.from("products").select("id, import_group_id").eq("owner_id", userId).in("import_group_id", groupIds)
    : { data: [] };
  const createdMap = new Map(((created ?? []) as { id: string; import_group_id: string }[]).map((r) => [r.import_group_id, r.id]));
  const groups = row.groups.map((g) => ({ ...g, productId: createdMap.get(g.id) ?? g.productId ?? null }));

  // Corrections réelles du vendeur : proposition de l'IA (stats.initial) contre produits créés.
  const initial = ImportPartitionSchema.safeParse(row.stats?.initial);
  const corrections =
    initial.success && !row.stats?.manual
      ? correctionStats(initial.data, groups.filter((g) => g.productId).map((g) => g.itemIds))
      : null;

  const { error } = await supabase
    .from("product_imports")
    .update({
      status: body.cancel ? "canceled" : "done",
      groups,
      version: row.version + 1,
      stats: { ...row.stats, created: createdMap.size, deletedMedia: unused.length, ...(corrections ? { corrections } : {}) },
    })
    .eq("id", row.id);
  if (error) {
    console.error("[imports/finish] failed:", error);
    return NextResponse.json({ error: "Impossible de terminer l'import. Réessaie." }, { status: 500 });
  }
  const fresh = await loadImport(supabase, row.id);
  return NextResponse.json({ import: fresh ? publicImport(fresh) : null, created: createdMap.size, deleted: unused.length });
}
