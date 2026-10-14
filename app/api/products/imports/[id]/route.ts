import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkAccess, loadImport, publicImport } from "@/lib/products/bulk-server";
import { ImportStateSchema, checkImportInvariants, normalizeImportState } from "@/lib/products/bulk-import";

// GET   /api/products/imports/{id} — état de la session (reprise).
// PATCH /api/products/imports/{id} — enregistre la révision du vendeur. Verrou optimiste :
//   `version` doit être celle lue ; sinon 409 avec l'état courant (autre onglet, autre appareil).

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const access = await bulkAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = await loadImport(access.supabase, params.id);
  if (!row) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
  return NextResponse.json({ import: publicImport(row) });
}

const PatchSchema = z.object({ version: z.number().int().min(0), state: ImportStateSchema });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const access = await bulkAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Modification invalide." }, { status: 400 });

  const row = await loadImport(supabase, params.id);
  if (!row) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
  if (row.status === "done" || row.status === "canceled") {
    return NextResponse.json({ error: "Cet import est terminé." }, { status: 409 });
  }
  if (parsed.data.version !== row.version) {
    return NextResponse.json({ error: "conflict", import: publicImport(row) }, { status: 409 });
  }

  // Les médias viennent du serveur, jamais du navigateur : on garde ceux de la session.
  const state = normalizeImportState({ ...parsed.data.state, items: row.items });
  const errors = checkImportInvariants(state);
  if (errors.length) {
    console.error("[imports] invariants:", errors.slice(0, 3));
    return NextResponse.json({ error: "Modification invalide." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("product_imports")
    .update({
      groups: state.groups,
      unsorted: state.unsorted,
      removed: state.removed,
      variants: state.variants,
      version: row.version + 1,
      status: row.status === "uploading" || row.status === "analyzing" ? (row.grouped_at ? "review" : row.status) : row.status,
    })
    .eq("id", row.id)
    .eq("version", row.version)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[imports] patch failed:", error);
    return NextResponse.json({ error: "Enregistrement impossible. Réessaie." }, { status: 500 });
  }
  if (!data) {
    const current = await loadImport(supabase, row.id);
    return NextResponse.json({ error: "conflict", import: current ? publicImport(current) : null }, { status: 409 });
  }
  return NextResponse.json({ version: row.version + 1 });
}
