import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { STUDIO_MAX_PACKS_PER_DAY } from "@/lib/studio/access";
import { buildFacts, buildFactsFromCreation, type StudioFacts } from "@/lib/studio/facts";
import { generateVariants, STUDIO_MODEL } from "@/lib/studio/generate";
import { loadOwnedCreation, loadOwnedProduct } from "@/lib/studio/load";
import { PLATFORMS } from "@/lib/studio/platforms";
import { countPacksSince, getPack } from "@/lib/studio/queries";
import { attachUsage, consumeUsage, limitPayload, refundUsage } from "@/lib/billing/consume";
import { logAiCall } from "@/lib/billing/ai-cost";
import { usageUnits } from "@/lib/billing/usage";

// POST /api/studio/generate
//   { creationId, versionId?, objective, promoDetail?, extraFacts? }  → à partir d'une affiche (Studio)
//   { productId, objective, promoDetail?, extraFacts? }               → à partir d'un produit (repli)
// Génère un pack complet (5 plateformes × 3 variantes de texte). Les visuels ne sont pas générés
// ici : ils sont rendus à la volée par /api/studio/visual/[id].

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z
  .object({
    productId: z.string().uuid().optional(),
    creationId: z.string().uuid().optional(),
    versionId: z.string().uuid().optional().nullable(),
    objective: z.enum(["sell", "present", "promo", "new"]),
    promoDetail: z.string().trim().max(160).optional().nullable(),
    extraFacts: z.string().trim().max(300).optional().nullable(),
  })
  .refine((b) => !!b.productId !== !!b.creationId, { message: "Choisis une affiche ou un produit." })
  .refine((b) => b.objective !== "promo" || !!b.promoDetail, {
    message: "Décris l'offre pour une promotion (ex. « -20 % jusqu'à dimanche »).",
  });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
  }
  const body = parsed.data;
  const promo = body.objective === "promo" ? body.promoDetail || null : null;
  const extra = body.extraFacts || null;

  // Garde-fou de coût IA.
  const recent = await countPacksSince(supabase, user.id, new Date(Date.now() - 24 * 3600 * 1000));
  if (recent >= STUDIO_MAX_PACKS_PER_DAY) {
    return NextResponse.json({ error: "Tu as atteint la limite de contenus pour aujourd'hui. Réessaie demain." }, { status: 429 });
  }

  let facts: StudioFacts;
  let packRow: Record<string, string | null>;
  if (body.creationId) {
    const loaded = await loadOwnedCreation(supabase, user.id, body.creationId);
    if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    // Affiche non débloquée : le Studio reste utilisable (décompté du quota comme toute génération),
    // mais les visuels téléchargés portent la signature « Créé avec Jaarle » (voir /api/studio/visual).
    let versionId: string | null = null;
    if (body.versionId) {
      const { data: v } = await supabase
        .from("creation_versions")
        .select("id")
        .eq("id", body.versionId)
        .eq("creation_id", body.creationId)
        .eq("user_id", user.id)
        .maybeSingle();
      versionId = (v?.id as string | undefined) ?? null;
    }
    facts = buildFactsFromCreation(loaded.creation, loaded.shop, loaded.product, body.objective, promo, extra);
    packRow = {
      shop_id: loaded.shop?.id ?? null,
      product_id: loaded.product?.id ?? null,
      creation_id: loaded.creation.id,
      creation_version_id: versionId,
    };
  } else {
    const loaded = await loadOwnedProduct(supabase, user.id, body.productId!);
    if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    facts = buildFacts(loaded.shop, loaded.product, body.objective, promo, extra);
    packRow = { shop_id: loaded.shop.id, product_id: loaded.product.id };
  }

  // Quota de générations du plan (puis crédits) : décompté avant l'appel IA, remboursé en cas d'échec.
  const usage = await consumeUsage({
    userId: user.id,
    action: "studio_pack",
    units: usageUnits("studio_pack"),
    shopId: packRow.shop_id ?? null,
    creationId: packRow.creation_id ?? null,
  });
  if (!usage.ok && usage.reason === "limit") return NextResponse.json(limitPayload("generations"), { status: 403 });
  const usageEventId = usage.ok ? usage.eventId : null;

  let variants;
  try {
    const generated = await generateVariants(facts, PLATFORMS.map((p) => p.key));
    variants = generated.variants;
    void logAiCall({
      userId: user.id,
      feature: "studio_pack",
      model: generated.usage.model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      usageEventId,
      shopId: packRow.shop_id ?? null,
      creationId: packRow.creation_id ?? null,
    });
  } catch (err) {
    console.error("[studio/generate] AI failed:", err);
    await refundUsage(usageEventId);
    return NextResponse.json({ error: "La génération a échoué. Réessaie dans un instant." }, { status: 502 });
  }

  const { data: pack, error: packError } = await supabase
    .from("marketing_packs")
    .insert({
      ...packRow,
      owner_id: user.id,
      objective: body.objective,
      promo_detail: promo,
      extra_facts: extra,
      model: STUDIO_MODEL,
    })
    .select("id")
    .single();
  if (packError || !pack) {
    console.error("[studio/generate] pack insert failed:", packError);
    await refundUsage(usageEventId);
    return NextResponse.json({ error: "Impossible d'enregistrer le contenu." }, { status: 500 });
  }

  const { error: postsError } = await supabase.from("marketing_posts").insert(
    PLATFORMS.map((spec) => ({
      pack_id: pack.id,
      owner_id: user.id,
      platform: spec.key,
      format: spec.format,
      variants: variants[spec.key],
      selected_variant: 0,
    }))
  );
  if (postsError) {
    console.error("[studio/generate] posts insert failed:", postsError);
    await refundUsage(usageEventId);
    return NextResponse.json({ error: "Impossible d'enregistrer le contenu." }, { status: 500 });
  }

  await attachUsage(usageEventId, { packId: pack.id as string });
  return NextResponse.json({ pack: await getPack(supabase, pack.id) });
}
