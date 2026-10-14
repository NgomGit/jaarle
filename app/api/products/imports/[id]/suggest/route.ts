import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { bulkAccess, loadImport } from "@/lib/products/bulk-server";
import { BULK_SUGGESTIONS_PER_IMPORT, SUGGEST_IMAGES } from "@/lib/products/bulk-import";
import { suggestProductFromPhotos, type AutofillImage } from "@/lib/ai/product-autofill";
import { buildShopContext } from "@/lib/shops/context";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";
import { logAiCall } from "@/lib/billing/ai-cost";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/products/imports/{id}/suggest — { itemIds } (3 premières photos d'un groupe, principale
// en tête) → proposition de fiche (même IA que l'ajout d'un produit). Rien n'est enregistré ici :
// le navigateur range la proposition dans son groupe puis enregistre la session (PATCH).
// Inclus dans le crédit du lot ; plafonné à BULK_SUGGESTIONS_PER_IMPORT appels par lot.

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({ itemIds: z.array(z.string().uuid()).min(1).max(10) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await bulkAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase, userId, shop } = access;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Aucune photo." }, { status: 400 });

  const row = await loadImport(supabase, params.id);
  if (!row) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
  if (row.status === "done" || row.status === "canceled") return NextResponse.json({ error: "Cet import est terminé." }, { status: 409 });

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { count } = await createAdminClient()
      .from("ai_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", "bulk_suggest")
      .eq("meta->>importId", row.id);
    if ((count ?? 0) >= BULK_SUGGESTIONS_PER_IMPORT) {
      return NextResponse.json({ error: "Limite de fiches IA atteinte pour ce lot. Remplis la fiche à la main.", capped: true }, { status: 429 });
    }
  }

  const byId = new Map(row.items.map((i) => [i.id, i]));
  const paths = parsed.data.itemIds
    .map((id) => byId.get(id)?.path)
    .filter((p): p is string => !!p)
    .slice(0, SUGGEST_IMAGES);
  if (paths.length === 0) return NextResponse.json({ error: "Photo introuvable." }, { status: 404 });

  const images: AutofillImage[] = [];
  for (const path of paths) {
    const { data: blob } = await supabase.storage.from(SHOP_MEDIA_BUCKET).download(path);
    if (!blob) continue;
    try {
      const jpeg = await sharp(Buffer.from(await blob.arrayBuffer()))
        .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      images.push({ base64: jpeg.toString("base64"), mediaType: "image/jpeg" });
    } catch {
      // image illisible : ignorée
    }
  }
  if (images.length === 0) return NextResponse.json({ error: "Photo introuvable." }, { status: 404 });

  try {
    const s = await suggestProductFromPhotos(images, buildShopContext(shop), (u) =>
      void logAiCall({
        userId,
        feature: "bulk_suggest",
        model: u.model,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        images: images.length,
        usageEventId: row.usage_event_id,
        shopId: shop.id,
        meta: { importId: row.id },
      })
    );
    const attributes = s.attributes.map((a) => `${a.name} : ${a.value}`).join(" · ");
    return NextResponse.json({
      suggestion: {
        name: s.name,
        description: [s.description, attributes].filter(Boolean).join("\n").slice(0, 2000),
        category: s.category,
        marketCategory: s.marketCategory === "none" ? "" : s.marketCategory,
        subjectType: s.subjectType,
      },
    });
  } catch (err) {
    console.error("[imports/suggest] failed:", err);
    return NextResponse.json({ error: "L'IA n'a pas pu écrire cette fiche. Remplis-la à la main." }, { status: 502 });
  }
}
