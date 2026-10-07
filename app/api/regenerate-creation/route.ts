import { logAiCall } from "@/lib/billing/ai-cost";
import { AI_COST_ESTIMATES_USD } from "@/lib/billing/usage";
import { NextResponse } from "next/server";
import { canUseMultiPhoto, getEntitlements } from "@/lib/billing/entitlements";
import { resolveReferences } from "@/lib/multi-reference";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTierConfig } from "@/lib/pricing";
import { otherLayoutsCount, regenerateScene, rerenderOtherLayout, type DesignV2, type V2Content } from "@/lib/poster-v2";
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

  const { creationId, customInstructions, mode } = (await request.json()) as {
    creationId: string;
    customInstructions?: string | null;
    /** V2 seulement : "layout" = autre mise en page (même scène, 0 appel IA, gratuit) ; sinon nouvelle scène. */
    mode?: "layout" | "scene" | null;
  };
  if (!creationId) {
    return NextResponse.json({ error: "Création manquante." }, { status: 400 });
  }
  const trimmedInstructions = customInstructions?.trim().slice(0, 300) || null;

  const { data: creation, error: creationError } = await supabase
    .from("creations")
    // « * » : les colonnes V2 (migration 0040) sont lues si elles existent, sans casser la V1 sinon.
    .select("*")
    .eq("id", creationId)
    .eq("user_id", user.id)
    .single();

  if (creationError || !creation) {
    return NextResponse.json({ error: "Création introuvable." }, { status: 404 });
  }

  const tierConfig = getTierConfig(creation.tier);

  // ——— V2 multi-photos ———
  if (creation.pipeline_version === "v2" && creation.design) {
    return regenerateV2(request, {
      supabase,
      user: { id: user.id, phone: user.phone ?? null, whatsapp: (user.user_metadata?.whatsapp_number as string | undefined) ?? null },
      creation,
      design: creation.design as DesignV2,
      mode: mode === "layout" ? "layout" : "scene",
      instructions: trimmedInstructions,
      maxRegenerations: tierConfig.maxRegenerations,
    });
  }
  if (mode === "layout") {
    return NextResponse.json({ error: "Option réservée aux affiches multi-photos." }, { status: 400 });
  }

  if (creation.regenerations_used >= tierConfig.maxRegenerations) {
    return NextResponse.json({ error: "Limite de régénérations atteinte." }, { status: 400 });
  }

  // Réservation de la régénération AVANT l'appel IA (écriture serveur, migration 0034) : la ligne
  // n'est mise à jour que si le compteur n'a pas bougé entre-temps — deux clics simultanés ne
  // donnent donc pas deux régénérations. Rendue si la génération échoue.
  const admin = createAdminClient();
  const regenerationsUsed = creation.regenerations_used + 1;
  const { data: reserved } = await admin
    .from("creations")
    .update({ regenerations_used: regenerationsUsed })
    .eq("id", creation.id)
    .eq("user_id", user.id)
    .eq("regenerations_used", creation.regenerations_used)
    .select("id");
  if (!reserved?.length) {
    return NextResponse.json({ error: "Limite de régénérations atteinte." }, { status: 400 });
  }
  const releaseReservation = () =>
    admin.from("creations").update({ regenerations_used: creation.regenerations_used }).eq("id", creation.id).eq("regenerations_used", regenerationsUsed);

  let backgroundResult: Awaited<ReturnType<typeof buildPosterBackground>> | Awaited<ReturnType<typeof buildServiceBackground>>;
  let secondaryBuffers: Buffer[] = [];

  if (creation.photo_path) {
    const { data: photoBlob, error: downloadError } = await supabase.storage.from("creations").download(creation.photo_path);
    if (downloadError || !photoBlob) {
      await releaseReservation();
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
      galleryZone: backgroundResult.galleryZone,
      businessName: creation.business_name,
      logoBuffer,
      customInstructions: trimmedInstructions,
      serviceItems: creation.service_items,
    });

    posterPath = `${user.id}/${Date.now()}-poster.jpg`;
    const { error: uploadError } = await admin.storage
      .from("creations")
      .upload(posterPath, finalBuffer, { contentType: "image/jpeg" });
    if (uploadError) posterPath = null;
  } catch {
    posterPath = null;
  }

  if (!posterPath) {
    await releaseReservation();
    return NextResponse.json({ error: imageError || "Échec de la régénération." }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("creations")
    .update({ poster_path: posterPath })
    .eq("id", creation.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Historique : la régénération est conservée comme une nouvelle version (l'ancienne reste,
  // son fichier n'est pas écrasé — chaque génération crée un nouveau chemin).
  await admin.from("creation_versions").insert({
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

// ——— V2 : « autre mise en page » (gratuit, 0 appel IA) ou « nouvelle scène » (compte comme une
// régénération, réservée avant l'appel IA et rendue en cas d'échec, comme la V1). ———
type V2Creation = {
  id: string;
  product_name: string;
  price: number | null;
  photo_path: string | null;
  extra_photo_paths: string[] | null;
  industry: string | null;
  regenerations_used: number;
  logo_path: string | null;
  business_name: string | null;
  contact_phone: string | null;
  scene_path: string | null;
};

async function regenerateV2(
  request: Request,
  ctx: {
    supabase: ReturnType<typeof createClient>;
    user: { id: string; phone: string | null; whatsapp: string | null };
    creation: V2Creation;
    design: DesignV2;
    mode: "layout" | "scene";
    instructions: string | null;
    maxRegenerations: number;
  }
) {
  void request;
  const { supabase, user, creation, design } = ctx;
  const admin = createAdminClient();

  const download = async (path: string | null, asAdmin = false): Promise<Buffer | null> => {
    if (!path) return null;
    const { data } = await (asAdmin ? admin : supabase).storage.from("creations").download(path);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };
  const hero = await download(creation.photo_path);
  const secondaryBuffers = (await Promise.all((creation.extra_photo_paths ?? []).map((p) => download(p)))).filter((b): b is Buffer => !!b);
  if (!hero || secondaryBuffers.length < design.secondaries.length) {
    return NextResponse.json({ error: "Photo introuvable." }, { status: 500 });
  }
  const content: V2Content = {
    productName: creation.product_name,
    price: creation.price,
    industry: creation.industry,
    phone: creation.contact_phone || user.whatsapp || user.phone || "",
    businessName: creation.business_name,
    logo: await download(creation.logo_path),
  };

  // Autre mise en page : même scène, aucun appel IA, hors compteur de régénérations.
  if (ctx.mode === "layout") {
    const scene = await download(creation.scene_path, true);
    if (!scene) return NextResponse.json({ error: "Scène introuvable." }, { status: 500 });
    const r = await rerenderOtherLayout({ design, scene, secondaryBuffers, content });
    if (!r) return NextResponse.json({ error: "Aucune autre mise en page possible pour cette affiche." }, { status: 400 });
    const posterPath = `${user.id}/${Date.now()}-poster.jpg`;
    const { error: uploadError } = await admin.storage.from("creations").upload(posterPath, r.image, { contentType: "image/jpeg" });
    if (uploadError) return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
    await admin.from("creations").update({ poster_path: posterPath, design: r.design }).eq("id", creation.id).eq("user_id", user.id);
    await admin.from("creation_versions").insert({
      creation_id: creation.id,
      user_id: user.id,
      poster_path: posterPath,
      kind: "regeneration",
      design: r.design,
      scene_path: creation.scene_path,
    });
    return NextResponse.json({
      imageUrl: `/api/creations/${creation.id}/preview?v=${Date.now()}`,
      imageError: null,
      regenerationsRemaining: Math.max(0, ctx.maxRegenerations - creation.regenerations_used),
      otherLayouts: otherLayoutsCount(r.design),
    });
  }

  // Nouvelle scène : réservation du compteur avant l'appel IA (même garde-fou que la V1).
  if (creation.regenerations_used >= ctx.maxRegenerations) {
    return NextResponse.json({ error: "Limite de régénérations atteinte." }, { status: 400 });
  }
  const regenerationsUsed = creation.regenerations_used + 1;
  const { data: reserved } = await admin
    .from("creations")
    .update({ regenerations_used: regenerationsUsed })
    .eq("id", creation.id)
    .eq("user_id", user.id)
    .eq("regenerations_used", creation.regenerations_used)
    .select("id");
  if (!reserved?.length) return NextResponse.json({ error: "Limite de régénérations atteinte." }, { status: 400 });
  const release = () =>
    admin.from("creations").update({ regenerations_used: creation.regenerations_used }).eq("id", creation.id).eq("regenerations_used", regenerationsUsed);

  let r: Awaited<ReturnType<typeof regenerateScene>> = null;
  try {
    r = await regenerateScene({ design, hero, secondaryBuffers, content, sellerNote: ctx.instructions });
  } catch (e) {
    console.error("[regenerate-creation] V2 :", e instanceof Error ? e.message : e);
  }
  if (!r) {
    await release();
    return NextResponse.json({ error: "La nouvelle version n'a pas passé le contrôle qualité. Réessaie : ta régénération n'a pas été décomptée." }, { status: 500 });
  }
  const ts = Date.now();
  const posterPath = `${user.id}/${ts}-poster.jpg`;
  const scenePath = `${user.id}/${ts}-poster-scene.jpg`;
  const [up1, up2] = await Promise.all([
    admin.storage.from("creations").upload(posterPath, r.image, { contentType: "image/jpeg" }),
    admin.storage.from("creations").upload(scenePath, r.scene, { contentType: "image/jpeg" }),
  ]);
  if (up1.error) {
    await release();
    return NextResponse.json({ error: "Échec de l'enregistrement." }, { status: 500 });
  }
  const savedScene = up2.error ? null : scenePath;
  await admin.from("creations").update({ poster_path: posterPath, design: r.design, scene_path: savedScene }).eq("id", creation.id).eq("user_id", user.id);
  await admin.from("creation_versions").insert({
    creation_id: creation.id,
    user_id: user.id,
    poster_path: posterPath,
    kind: "regeneration",
    design: r.design,
    scene_path: savedScene,
  });
  void logAiCall({
    userId: user.id,
    feature: "poster_regenerate",
    estCostUsd: Math.max(0, r.design.est_cost_usd - design.est_cost_usd),
    images: r.design.calls.image - design.calls.image,
    creationId: creation.id,
  });
  return NextResponse.json({
    imageUrl: `/api/creations/${creation.id}/preview?v=${ts}`,
    imageError: null,
    regenerationsRemaining: ctx.maxRegenerations - regenerationsUsed,
    otherLayouts: savedScene ? otherLayoutsCount(r.design) : 0,
  });
}
