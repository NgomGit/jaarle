import { logAiCall } from "@/lib/billing/ai-cost";
import { AI_COST_ESTIMATES_USD } from "@/lib/billing/usage";
import { NextResponse } from "next/server";
import { canUseMultiPhoto, getEntitlements } from "@/lib/billing/entitlements";
import { resolveReferences } from "@/lib/multi-reference";
import { createClient } from "@/lib/supabase/server";
import { getTierConfig } from "@/lib/pricing";
import {
  ALLOWED_MEDIA_TYPES,
  type AllowedMediaType,
  buildPosterBackground,
  buildServiceBackground,
  renderFinalPoster,
} from "@/lib/poster-pipeline";

// Même raison que generate-creation/route.ts : la génération enchaîne plusieurs appels IA
// séquentiels et peut dépasser le timeout serverless par défaut sans ce réglage.
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { creationId, customInstructions } = (await request.json()) as {
    creationId: string;
    customInstructions?: string | null;
  };
  if (!creationId) {
    return NextResponse.json({ error: "Création manquante." }, { status: 400 });
  }
  const trimmedInstructions = customInstructions?.trim().slice(0, 300) || null;

  const { data: creation, error: creationError } = await supabase
    .from("creations")
    .select(
      "id, product_name, price, photo_path, extra_photo_paths, industry, tier, regenerations_used, logo_path, business_name, contact_phone, service_description, service_items"
    )
    .eq("id", creationId)
    .eq("user_id", user.id)
    .single();

  if (creationError || !creation) {
    return NextResponse.json({ error: "Création introuvable." }, { status: 404 });
  }

  const tierConfig = getTierConfig(creation.tier);
  if (creation.regenerations_used >= tierConfig.maxRegenerations) {
    return NextResponse.json({ error: "Limite de régénérations atteinte." }, { status: 400 });
  }

  let backgroundResult: Awaited<ReturnType<typeof buildPosterBackground>> | Awaited<ReturnType<typeof buildServiceBackground>>;
  let secondaryBuffers: Buffer[] = [];

  if (creation.photo_path) {
    const { data: photoBlob, error: downloadError } = await supabase.storage.from("creations").download(creation.photo_path);
    if (downloadError || !photoBlob) {
      return NextResponse.json({ error: "Photo introuvable." }, { status: 500 });
    }
    const photoBuffer = Buffer.from(await photoBlob.arrayBuffer());
    const photoBase64 = photoBuffer.toString("base64");
    const mediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(photoBlob.type as AllowedMediaType)
      ? (photoBlob.type as AllowedMediaType)
      : "image/jpeg";

    // Action unique « Nouvelle version » : les photos secondaires de l'affiche sont reprises et
    // restent intégrées au design (remplace l'ancienne « déclinaison » séparée).
    // Photos secondaires : offres payantes uniquement (décor multi-image + vraies vignettes).
    const multiPhotoAllowed = canUseMultiPhoto(await getEntitlements());
    let extraPhotos: { base64: string; mediaType: AllowedMediaType }[] = [];
    for (const extraPath of multiPhotoAllowed ? ((creation.extra_photo_paths as string[] | null) ?? []) : []) {
      const { data: extraBlob } = await supabase.storage.from("creations").download(extraPath);
      if (!extraBlob) continue;
      const buf = Buffer.from(await extraBlob.arrayBuffer());
      const extraMediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(extraBlob.type as AllowedMediaType)
        ? (extraBlob.type as AllowedMediaType)
        : "image/jpeg";
      extraPhotos.push({ base64: buf.toString("base64"), mediaType: extraMediaType });
    }

    // La photo principale reste celle de la création ; l'analyse groupée revérifie les secondaires.
    const resolved =
      extraPhotos.length > 0
        ? await resolveReferences([{ base64: photoBase64, mediaType }, ...extraPhotos], creation.product_name, { heroFixed: true })
        : null;
    if (resolved) {
      const all = [{ base64: photoBase64, mediaType }, ...extraPhotos];
      extraPhotos = resolved.secondaryIndexes.map((i) => all[i]).filter((x): x is (typeof all)[number] => !!x);
    }

    backgroundResult = await buildPosterBackground(
      photoBuffer,
      photoBase64,
      mediaType,
      creation.product_name,
      creation.industry,
      trimmedInstructions,
      extraPhotos,
      undefined,
      extraPhotos.length > 0,
      { multi: resolved?.multi ?? null, productAnalysis: resolved?.productAnalysis ?? null }
    );
    secondaryBuffers = extraPhotos.map((p) => Buffer.from(p.base64, "base64"));
  } else {
    backgroundResult = await buildServiceBackground(
      creation.product_name,
      creation.service_description,
      creation.service_items ?? [],
      creation.industry,
      trimmedInstructions
    );
  }

  const { backgroundBuffer, imageError, layout, accentGradient, creativeBrief } = backgroundResult;
  // Points forts issus de l'analyse du produit (aucun pour un service sans photo : l'IA les choisit).
  const sellingPoints: string[] =
    "sellingPoints" in backgroundResult && Array.isArray(backgroundResult.sellingPoints) ? (backgroundResult.sellingPoints as string[]) : [];
  const phone = creation.contact_phone || (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";

  let logoBuffer: Buffer | null = null;
  if (creation.logo_path) {
    const { data: logoBlob } = await supabase.storage.from("creations").download(creation.logo_path);
    if (logoBlob) logoBuffer = Buffer.from(await logoBlob.arrayBuffer());
  }

  let posterPath: string | null = null;
  try {
    const origin = new URL(request.url).origin;
    const { finalBuffer } = await renderFinalPoster(origin, backgroundBuffer, {
      layout,
      productName: creation.product_name,
      price: creation.price,
      phone,
      industry: creation.industry,
      accentGradient,
      creativeBrief,
      benefits: sellingPoints,
      secondaryPhotos: secondaryBuffers,
      businessName: creation.business_name,
      logoBuffer,
      customInstructions: trimmedInstructions,
      serviceItems: creation.service_items,
    });

    posterPath = `${user.id}/${Date.now()}-poster.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("creations")
      .upload(posterPath, finalBuffer, { contentType: "image/jpeg" });
    if (uploadError) posterPath = null;
  } catch {
    posterPath = null;
  }

  if (!posterPath) {
    return NextResponse.json({ error: imageError || "Échec de la régénération." }, { status: 500 });
  }

  const regenerationsUsed = creation.regenerations_used + 1;
  const { error: updateError } = await supabase
    .from("creations")
    .update({ poster_path: posterPath, regenerations_used: regenerationsUsed })
    .eq("id", creation.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Historique : la régénération est conservée comme une nouvelle version (l'ancienne reste,
  // son fichier n'est pas écrasé — chaque génération crée un nouveau chemin).
  await supabase.from("creation_versions").insert({
    creation_id: creation.id,
    user_id: user.id,
    poster_path: posterPath,
    kind: "regeneration",
  });

  // Mesure du coût IA (retouche incluse dans l'affiche, non décomptée du quota). Jamais bloquant.
  void logAiCall({ userId: user.id, feature: "poster_regenerate", estCostUsd: AI_COST_ESTIMATES_USD.poster_regenerate, images: 1, creationId: creation.id });

  return NextResponse.json({
    imageUrl: `/api/creations/${creation.id}/preview?v=${Date.now()}`,
    imageError,
    regenerationsRemaining: tierConfig.maxRegenerations - regenerationsUsed,
  });
}
