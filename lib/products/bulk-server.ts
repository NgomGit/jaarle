import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { bulkUploadLimits, canUseBulkUpload } from "@/lib/billing/features";
import { getEntitlements } from "@/lib/billing/entitlements";
import { isBulkTester, isBulkUploadOpen } from "@/lib/products/bulk-flags";
import { ImportStateSchema, normalizeImportState, type ImportState, type ImportStatus } from "@/lib/products/bulk-import";
import type { Entitlements } from "@/lib/billing/types";
import type { Shop } from "@/lib/shops/types";

// Import en lot — accès et lecture des sessions côté serveur (routes et actions).

type Supabase = ReturnType<typeof createClient>;

export interface ImportRow extends ImportState {
  id: string;
  owner_id: string;
  shop_id: string;
  status: ImportStatus;
  version: number;
  stats: Record<string, unknown>;
  grouped_at: string | null;
  usage_event_id: string | null;
  created_at: string;
}

export type BulkAccess =
  | {
      ok: true;
      supabase: Supabase;
      userId: string;
      shop: Shop;
      entitlements: Entitlements;
      limits: { photosPerLot: number; videosPerLot: number };
      /** Testeur du pilote : pas de plafond quotidien d'analyses. */
      noDailyCap: boolean;
    }
  | { ok: false; status: number; error: string };

/** Vérifie session, boutique, formule (Pro / Business) et phase pilote. */
export async function bulkAccess(): Promise<BulkAccess> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Session expirée. Reconnecte-toi." };
  if (!isBulkUploadOpen(user)) return { ok: false, status: 403, error: "L'import en lot arrive bientôt." };
  const shop = await getMyShop(supabase, user.id);
  if (!shop) return { ok: false, status: 400, error: "Crée d'abord ta boutique." };
  if (shop.status === "suspended") return { ok: false, status: 403, error: "Ta boutique est suspendue. Contacte le support Jaarle." };
  const entitlements = await getEntitlements();
  const limits = bulkUploadLimits(entitlements);
  if (!canUseBulkUpload(entitlements) || !limits) {
    return { ok: false, status: 403, error: "L'import de plusieurs produits est inclus dans les formules Pro et Business." };
  }
  return { ok: true, supabase, userId: user.id, shop, entitlements, limits, noDailyCap: isBulkTester(user) };
}

/** Lit une session du vendeur (RLS : uniquement les siennes). L'état est remis en ordre à la lecture. */
export async function loadImport(supabase: Supabase, id: string): Promise<ImportRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from("product_imports").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const parsed = ImportStateSchema.safeParse({
    items: data.items ?? [],
    groups: data.groups ?? [],
    unsorted: data.unsorted ?? [],
    removed: data.removed ?? [],
    variants: data.variants ?? [],
  });
  if (!parsed.success) {
    console.error("[bulk-import] invalid stored state:", parsed.error.issues[0]);
    return null;
  }
  return { ...(data as Omit<ImportRow, keyof ImportState>), ...normalizeImportState(parsed.data) };
}

export function stateOf(row: ImportRow): ImportState {
  return { items: row.items, groups: row.groups, unsorted: row.unsorted, removed: row.removed, variants: row.variants };
}

/** Données renvoyées au navigateur. */
export function publicImport(row: ImportRow) {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    grouped: !!row.grouped_at,
    state: stateOf(row),
  };
}
export type PublicImport = ReturnType<typeof publicImport>;
