import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { bulkAccess, loadImport, publicImport } from "@/lib/products/bulk-server";
import { BULK_IMPORTS_PER_DAY, newGroup, normalizeImportState, partitionOf, stateFromGrouping, type ImportItem, type ImportState } from "@/lib/products/bulk-import";
import { groupMediaWithAi, normalizeGrouping, photoNoteText, type GroupingImage } from "@/lib/ai/bulk-group";
import { applyVerification, suspiciousPairs, verifyMode, verifyPairsWithAi, type VerifiedGrouping } from "@/lib/ai/bulk-group-verify";
import { exactDuplicatePairs, groupingThumbnail, imagePrint, nearDuplicatePairs, type ImagePrint } from "@/lib/ai/bulk-group-hash";
import { buildShopContext } from "@/lib/shops/context";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";
import { consumeUsage, limitPayload, refundUsage } from "@/lib/billing/consume";
import { usageUnits } from "@/lib/billing/usage";
import { logAiCall } from "@/lib/billing/ai-cost";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/products/imports/{id}/group — range les photos du lot par article, en UN appel IA.
//  - { manual: true } : pas d'IA, chaque photo devient un produit (repli si l'IA échoue). Gratuit.
//  - 1 lot = 1 crédit (quota du mois puis crédits achetés) ; le tout 1er lot du vendeur est offert.
//    Débité une seule fois par lot, remboursé si l'IA échoue. 3 lots analysés par jour au plus.

export const runtime = "nodejs";
export const maxDuration = 60;

const DOWNLOAD_CONCURRENCY = 6;
/** La 2e vérification (facultative) n'est lancée que s'il reste assez de temps avant maxDuration. */
const VERIFY_TIME_BUDGET_MS = 35_000;

async function mapLimit<T, R>(list: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i], i);
      }
    })
  );
  return out;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  const access = await bulkAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase, userId, shop, noDailyCap } = access;
  const body = (await request.json().catch(() => ({}))) as { manual?: boolean };

  const row = await loadImport(supabase, params.id);
  if (!row) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
  if (row.status === "done" || row.status === "canceled") return NextResponse.json({ error: "Cet import est terminé." }, { status: 409 });
  if (row.groups.some((g) => g.productId)) return NextResponse.json({ error: "Des produits sont déjà créés pour ce lot." }, { status: 409 });

  const writer = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;
  const save = async (state: ImportState, extra: Record<string, unknown>) => {
    const { error } = await writer
      .from("product_imports")
      .update({ groups: state.groups, unsorted: state.unsorted, removed: state.removed, variants: state.variants, status: "review", version: row.version + 1, ...extra })
      .eq("id", row.id)
      .eq("owner_id", userId);
    return !error;
  };
  const items = row.items.filter((i) => !row.removed.includes(i.id));

  // ── Repli manuel : une photo = un produit ──────────────────────────────────────────────────
  if (body.manual) {
    const state = normalizeImportState({
      ...row,
      groups: items.map((i) => ({ ...newGroup(randomUUID(), [i.id]), suggestion: "pending" as const })),
      unsorted: [],
      variants: [],
    });
    if (!(await save(state, { stats: { ...row.stats, manual: true } }))) {
      return NextResponse.json({ error: "Enregistrement impossible. Réessaie." }, { status: 500 });
    }
    const fresh = await loadImport(supabase, row.id);
    return NextResponse.json({ import: fresh ? publicImport(fresh) : null });
  }

  if (items.length === 0) return NextResponse.json({ error: "Aucune photo à analyser." }, { status: 400 });

  // ── Plafond quotidien et facturation (une seule fois par lot) ──────────────────────────────
  let usageEventId = row.usage_event_id;
  let free = false;
  if (!row.grouped_at) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: today } = await supabase
      .from("product_imports")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .neq("id", row.id)
      .gte("grouped_at", since);
    if (!noDailyCap && (today ?? 0) >= BULK_IMPORTS_PER_DAY) {
      return NextResponse.json(
        {
          error: `Limite de ${BULK_IMPORTS_PER_DAY} analyses par jour atteinte (tes crédits ne sont pas touchés). Reviens demain, ou range ce lot toi-même.`,
          canManual: true,
          daily: true,
        },
        { status: 429 }
      );
    }
    const { count: before } = await supabase
      .from("product_imports")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .neq("id", row.id)
      .not("grouped_at", "is", null);
    free = (before ?? 0) === 0;
    if (!free && !usageEventId) {
      const usage = await consumeUsage({
        userId,
        action: "bulk_import",
        units: usageUnits("bulk_import"),
        shopId: shop.id,
        meta: { importId: row.id, photos: items.length },
      });
      if (!usage.ok && usage.reason === "limit") return NextResponse.json(limitPayload("generations"), { status: 403 });
      if (!usage.ok) return NextResponse.json({ error: "Impossible de vérifier tes crédits. Réessaie." }, { status: 500 });
      usageEventId = usage.eventId;
    }
  }
  const giveBack = async () => {
    if (usageEventId && usageEventId !== row.usage_event_id) await refundUsage(usageEventId);
  };

  // ── Vignettes et empreintes ────────────────────────────────────────────────────────────────
  const prepared = await mapLimit(items, DOWNLOAD_CONCURRENCY, async (item) => {
    const { data: blob } = await supabase.storage.from(SHOP_MEDIA_BUCKET).download(item.path);
    if (!blob) return null;
    try {
      const buf = Buffer.from(await blob.arrayBuffer());
      const [thumb, print] = await Promise.all([groupingThumbnail(buf), imagePrint(buf)]);
      return { item, thumb, print };
    } catch {
      return null;
    }
  });
  const ok = prepared.filter((p): p is NonNullable<typeof p> => !!p);
  if (ok.length === 0) {
    await giveBack();
    return NextResponse.json({ error: "Photos introuvables. Ajoute-les à nouveau." }, { status: 404 });
  }
  const prints: ImagePrint[] = ok.map((p) => p.print);
  const exact = exactDuplicatePairs(prints);
  const near = nearDuplicatePairs(prints);
  const images: GroupingImage[] = ok.map((p) => ({ base64: p.thumb.base64, videoRef: p.item.videoRef ?? null, takenAt: p.item.takenAt ?? null }));

  try {
    const result = await groupMediaWithAi(images, { exactDuplicates: exact, shopContext: buildShopContext(shop) });
    void logAiCall({
      userId,
      feature: "bulk_group",
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      images: images.length,
      usageEventId,
      shopId: shop.id,
      meta: { importId: row.id, durationMs: result.durationMs, prompt: result.promptVersion },
    });
    const videoRefs = ok.map((p) => p.item.videoRef ?? null);
    let grouping: ReturnType<typeof normalizeGrouping> | VerifiedGrouping = normalizeGrouping(result.raw, ok.length, {
      nearDuplicates: [...exact, ...near],
      videoRefs,
    });

    // 2e vérification ciblée (BULK_GROUP_VERIFY=on) : seulement les paires suspectes, et seulement
    // s'il reste du temps. Un échec ne bloque jamais le lot : on garde le 1er regroupement.
    if (verifyMode() === "on" && Date.now() - startedAt < VERIFY_TIME_BUDGET_MS) {
      const pairs = suspiciousPairs(grouping, videoRefs);
      if (pairs.length) {
        try {
          const v = await verifyPairsWithAi(images, grouping, pairs);
          void logAiCall({
            userId,
            feature: "bulk_verify",
            model: v.model,
            inputTokens: v.inputTokens,
            outputTokens: v.outputTokens,
            images: v.images,
            usageEventId,
            shopId: shop.id,
            meta: { importId: row.id, durationMs: v.durationMs, pairs: pairs.length },
          });
          grouping = applyVerification(grouping, pairs, v.raw);
        } catch (err) {
          console.error("[imports/group] verify failed (ignored):", err);
        }
      }
    }
    const grouped = stateFromGrouping(
      ok.map((p) => p.item),
      grouping,
      () => randomUUID()
    );
    // Inventaire IA gardé avec chaque média : relu pour rédiger la fiche du produit.
    const notes = new Map<string, Pick<ImportItem, "aiNote" | "aiView" | "aiReadable">>();
    ok.forEach((p, i) => {
      const n = grouping.photos[i];
      if (n) notes.set(p.item.id, { aiNote: photoNoteText(n) || null, aiView: n.view, aiReadable: n.identifiable });
    });
    const items = row.items.map((it) => ({ ...it, ...(notes.get(it.id) ?? {}) }));
    // Photos illisibles (non téléchargées) : gardées dans « non rangées », jamais perdues.
    const state = normalizeImportState({ ...grouped, items, removed: row.removed });
    const saved = await save(state, {
      items,
      grouped_at: row.grouped_at ?? new Date().toISOString(),
      usage_event_id: usageEventId ?? null,
      stats: {
        ...row.stats,
        manual: false,
        free,
        groups: state.groups.length,
        unsorted: state.unsorted.length,
        issues: grouping.issues,
        signals: grouping.signals,
        ...("verification" in grouping ? { verification: grouping.verification } : {}),
        model: result.model,
        prompt: result.promptVersion,
        durationMs: result.durationMs,
        // Proposition de l'IA, gardée telle quelle : comparée au résultat final pour mesurer les corrections.
        initial: partitionOf(state),
      },
    });
    if (!saved) {
      await giveBack();
      return NextResponse.json({ error: "Enregistrement impossible. Réessaie." }, { status: 500 });
    }
    const fresh = await loadImport(supabase, row.id);
    return NextResponse.json({ import: fresh ? publicImport(fresh) : null, free });
  } catch (err) {
    console.error("[imports/group] failed:", err);
    await giveBack();
    return NextResponse.json({ error: "L'IA n'a pas pu ranger tes photos. Réessaie, ou range-les toi-même.", canManual: true }, { status: 502 });
  }
}
