import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countUnpaidCreations } from "@/lib/supabase/creations";
import { buildCulturalContext } from "@/lib/knowledge/context";
import { DEFAULT_TIER, MAX_POSTER_PHOTOS, type Tier } from "@/lib/pricing";
import {
  ALLOWED_MEDIA_TYPES,
  type AllowedMediaType,
  type LayoutVariant,
  buildPosterBackground,
  buildServiceBackground,
  buildArtisanPoster,
  renderFinalPoster,
} from "@/lib/poster-pipeline";
import { ARTISAN_INDUSTRIES } from "@/lib/art-directions";
import { resolveReferences, type MultiReferenceContext } from "@/lib/multi-reference";
import type { ProductAnalysis } from "@/lib/product-analyzer";
import { canUseMultiPhoto, getEntitlements } from "@/lib/billing/entitlements";
import { attachUsage, consumeUsage, limitPayload, refundUsage } from "@/lib/billing/consume";
import { logAiCall } from "@/lib/billing/ai-cost";
import { AI_COST_ESTIMATES_USD, usageUnits } from "@/lib/billing/usage";
import { isPosterV2User } from "@/lib/poster-v2/flags";
import { generatePosterV2, otherLayoutsCount, type DesignV2, type Excluded, type V2Photo } from "@/lib/poster-v2";
import type { LayoutId } from "@/lib/poster-v2/types";

// La génération enchaîne plusieurs appels IA séquentiels (fond + mise en page + vérifications)
// — sans ceci, la fonction serverless expire avant la fin sur la plupart des plans Vercel (15s
// par défaut sur Pro, encore moins sur Hobby). 300s est le maximum du plan Pro.
export const maxDuration = 300;

// Le style visuel n'est plus choisi par l'utilisateur : l'IA le déduit du produit lui-même.
// La colonne `style` de `creations` reste NOT NULL pour compat avec les créations existantes.
const AUTO_STYLE = "auto";

// Anti-abus : au-delà de ce nombre de créations générées mais jamais payées (unlocked=false),
// on bloque de nouvelles générations tant qu'aucune n'a été débloquée — la génération reste
// gratuite pour tester le produit, mais pas indéfiniment sans jamais rien acheter.
const MAX_UNPAID_CREATIONS = 5;

const CopySchema = z.object({
  salesCopy: z.string(),
  hashtags: z.array(z.string()).max(8),
});

type ContentPart =
  | { type: "image"; source: { type: "base64"; media_type: AllowedMediaType; data: string } }
  | { type: "text"; text: string };

async function generateSalesCopy(
  photo: { base64: string; mediaType: AllowedMediaType } | null,
  params: {
    productName: string;
    price: number | null;
    industry: string | null;
    language: string;
    serviceDescription?: string | null;
    serviceItems?: string[];
  }
) {
  const culturalContext = buildCulturalContext({ industryKey: params.industry ?? undefined });
  const languageLabel =
    params.language === "wo"
      ? "wolof (mélangé naturellement avec du français si besoin, comme parlent vraiment les commerçants à Dakar — pas une traduction littérale)"
      : "français";
  const priceLine =
    params.price != null
      ? `prix : ${params.price} FCFA.`
      : "prix sur devis (aucun prix fixe — n'invente surtout pas de montant, invite plutôt naturellement le client à contacter le commerçant pour connaître le prix).";
  const serviceContextLine =
    params.serviceDescription || (params.serviceItems && params.serviceItems.length > 0)
      ? ` ${params.serviceDescription ? `Description du service : ${params.serviceDescription}.` : ""}${
          params.serviceItems && params.serviceItems.length > 0 ? ` Ce qui est inclus : ${params.serviceItems.join(", ")}.` : ""
        }`
      : "";

  try {
    const anthropic = new Anthropic();
    const content: ContentPart[] = [];
    if (photo) {
      content.push({ type: "image", source: { type: "base64", media_type: photo.mediaType, data: photo.base64 } });
    }
    content.push({
      type: "text",
      text: `Produit ou service : "${params.productName}", ${priceLine}${serviceContextLine} Écris en ${languageLabel}. Rédige un texte de vente court (2-3 phrases, prêt à publier sur Facebook/Instagram/WhatsApp) et une liste de 4 à 6 hashtags pertinents pour le Sénégal.`,
    });

    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: culturalContext,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(CopySchema) },
    });

    if (message.parsed_output) {
      return { salesCopy: message.parsed_output.salesCopy, hashtags: message.parsed_output.hashtags, copyError: null as string | null };
    }
    return { salesCopy: null, hashtags: [] as string[], copyError: "Réponse IA invalide." };
  } catch (err) {
    return { salesCopy: null, hashtags: [] as string[], copyError: err instanceof Error ? err.message : "Erreur lors de la génération du texte." };
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // Plafond de 5 affiches non payées : garde-fou de l'ancien modèle « paiement à l'affiche ».
  // Avec la facturation Jaarle 2.0, c'est le quota du plan (puis les crédits) qui limite les
  // générations : on ne bloque plus un commerçant qui a encore des générations ou des crédits.
  const entitlements = await getEntitlements();
  if (!entitlements.billingEnabled) {
    const unpaidCount = await countUnpaidCreations(supabase, user.id);
    if (unpaidCount >= MAX_UNPAID_CREATIONS) {
      return NextResponse.json({ error: "unpaid_limit_reached", limit: MAX_UNPAID_CREATIONS }, { status: 403 });
    }
  }

  const {
    photoPath,
    extraPhotoPaths,
    mainPhotoChosen,
    productName,
    price,
    industry,
    language,
    tier,
    logoPath,
    businessName,
    contactPhone,
    subjectType,
    serviceDescription,
    serviceItems,
    productId,
  } = (await request.json()) as {
    photoPath: string | null;
    extraPhotoPaths: string[] | null;
    showSecondaryPhotos?: boolean | null; // ignoré : les photos secondaires sont toujours intégrées au design
    mainPhotoChosen?: boolean | null; // true = le commerçant a désigné la photo principale (pas de sélection IA)
    productName: string;
    price: number | null;
    industry: string | null;
    language: string;
    tier?: Tier; // ignoré : toutes les nouvelles affiches sont premium
    logoPath: string | null;
    businessName: string | null;
    contactPhone: string | null;
    subjectType: "product" | "service";
    serviceDescription: string | null;
    serviceItems: string[] | null;
    productId?: string | null; // Jaarle 2.0 : affiche créée depuis un produit de la boutique (facultatif)
  };

  const normalizedSubjectType: "product" | "service" = subjectType === "service" ? "service" : "product";
  const normalizedItems = (serviceItems ?? []).map((i) => i.trim()).filter(Boolean).slice(0, 10);

  if (!productName || (normalizedSubjectType === "product" && !photoPath)) {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  // Toutes les nouvelles affiches sont premium (clé « gold ») : un seul niveau, le plus qualitatif.
  void tier;
  const normalizedTier: Tier = DEFAULT_TIER;
  const maxExtraPhotos = MAX_POSTER_PHOTOS - 1;

  // Jaarle 2.0 — quota de générations du plan (puis crédits), décompté AVANT les appels IA et
  // remboursé si l'affiche n'a pas pu être produite. Pro / Business (ou paiement en crédit) :
  // l'affiche est livrée débloquée, sans filigrane. Gratuit : comportement historique (aperçu
  // filigrané, déblocage à l'unité via PayTech).
  const usage = await consumeUsage({
    userId: user.id,
    action: "poster_generate",
    units: usageUnits("poster_generate", normalizedTier),
    meta: { tier: normalizedTier },
  });
  if (!usage.ok && usage.reason === "limit") {
    return NextResponse.json(limitPayload("generations"), { status: 403 });
  }
  // Erreur technique de facturation : on ne bloque pas le générateur (mesure perdue, pas le client).
  const usageEventId = usage.ok ? usage.eventId : null;
  const unlockedByPlan = entitlements.posterUnlockIncluded || (usage.ok && usage.source === "credits");

  let logoBuffer: Buffer | null = null;
  if (logoPath) {
    const { data: logoBlob } = await supabase.storage.from("creations").download(logoPath);
    if (logoBlob) logoBuffer = Buffer.from(await logoBlob.arrayBuffer());
  }

  let photoBuffer: Buffer | null = null;
  let photoBase64: string | null = null;
  let mediaType: AllowedMediaType = "image/jpeg";

  if (photoPath) {
    const { data: photoBlob, error: downloadError } = await supabase.storage.from("creations").download(photoPath);
    if (downloadError || !photoBlob) {
      return NextResponse.json({ error: "Photo introuvable." }, { status: 500 });
    }
    photoBuffer = Buffer.from(await photoBlob.arrayBuffer());
    photoBase64 = photoBuffer.toString("base64");
    mediaType = ALLOWED_MEDIA_TYPES.includes(photoBlob.type as AllowedMediaType) ? (photoBlob.type as AllowedMediaType) : "image/jpeg";
  }

  // Jusqu'à 2 photos secondaires du même produit / service (offres payantes uniquement) : elles
  // servent de références au décor (chemin multi-image) et sont posées en vraies vignettes.
  // Offre Gratuite : une seule photo, les éventuelles secondaires sont ignorées.
  // Testeurs de la V2 multi-photos (lib/poster-v2/flags.ts) : 1 à 3 photos quelle que soit l'offre.
  const v2User = isPosterV2User(user);
  const multiPhotoAllowed = canUseMultiPhoto(entitlements) || v2User;
  const extraPhotos: { base64: string; mediaType: AllowedMediaType }[] = [];
  const extraDownloadedPaths: string[] = [];
  if (multiPhotoAllowed && photoPath && extraPhotoPaths?.length) {
    for (const extraPath of extraPhotoPaths.slice(0, maxExtraPhotos)) {
      const { data: extraBlob } = await supabase.storage.from("creations").download(extraPath);
      if (extraBlob) {
        const buf = Buffer.from(await extraBlob.arrayBuffer());
        const extraMediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(extraBlob.type as AllowedMediaType)
          ? (extraBlob.type as AllowedMediaType)
          : "image/jpeg";
        extraPhotos.push({ base64: buf.toString("base64"), mediaType: extraMediaType });
        extraDownloadedPaths.push(extraPath);
      }
    }
  }

  // Plusieurs photos : UNE analyse groupée choisit la principale (si le commerçant ne l'a pas
  // désignée), vérifie que les secondaires montrent bien le même produit (les autres sont
  // écartées) et prépare le contexte du décor multi-image. On réordonne buffers ET chemins pour
  // que l'affiche ET les métadonnées (nouvelle version) utilisent la même sélection.
  let effectivePhotoPath = photoPath;
  let effectiveExtraPaths = extraDownloadedPaths.slice();
  let multiContext: MultiReferenceContext | null = null;
  let groupedAnalysis: ProductAnalysis | null = null;
  // V2 multi-photos (testeurs) : produit avec au moins 2 photos. L'analyse V2 remplace l'analyse
  // groupée V1 ci-dessous ; en cas de repli, la V1 tourne avec la photo principale seule.
  const useV2 = v2User && normalizedSubjectType === "product" && !!photoBuffer && extraPhotos.length > 0;
  const v2Photos: V2Photo[] =
    useV2 && photoBuffer && photoPath
      ? [
          { buffer: photoBuffer, mediaType, path: photoPath },
          ...extraPhotos.map((p, i) => ({ buffer: Buffer.from(p.base64, "base64"), mediaType: p.mediaType, path: extraDownloadedPaths[i] })),
        ]
      : [];
  if (!useV2 && photoBuffer && photoBase64 && extraPhotos.length > 0) {
    const allImages = [{ base64: photoBase64, mediaType }, ...extraPhotos];
    const allPaths: (string | null)[] = [photoPath, ...extraDownloadedPaths];
    const resolved = await resolveReferences(allImages, productName, { heroFixed: !!mainPhotoChosen });
    const hero = allImages[resolved.heroIndex] ?? allImages[0];
    const secondaries = resolved.secondaryIndexes.map((i) => allImages[i]).filter((x): x is (typeof allImages)[number] => !!x);
    photoBase64 = hero.base64;
    mediaType = hero.mediaType;
    photoBuffer = Buffer.from(hero.base64, "base64");
    extraPhotos.length = 0;
    extraPhotos.push(...secondaries);
    effectivePhotoPath = allPaths[resolved.heroIndex] ?? photoPath;
    effectiveExtraPaths = resolved.secondaryIndexes.map((i) => allPaths[i]).filter((p): p is string => !!p);
    multiContext = resolved.multi;
    groupedAnalysis = resolved.productAnalysis;
  }

  // Les photos secondaires sont toujours montrées sur l'affiche quand il y en a.
  let normalizedShowSecondaryPhotos = extraPhotos.length > 0;

  const phone = contactPhone?.trim() || (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";

  async function renderVariation() {
    // Chemin "artisan" : décor à motifs africains rendu par sharp (aucun appel IA
    // image), produit fidèle, texte exact — pour les catégories artisanales avec
    // photo. En cas d'indisponibilité du détourage (remove.bg), on retombe
    // silencieusement sur le flux standard ci-dessous.
    if (photoBuffer && ARTISAN_INDUSTRIES.has(industry ?? "")) {
      try {
        const artisan = await buildArtisanPoster(new URL(request.url).origin, photoBuffer, {
          productName,
          price,
          phone,
          industry,
          businessName,
          logoBuffer,
          seed: Date.now(),
          secondaryPhotos: extraPhotos.map((p) => Buffer.from(p.base64, "base64")),
        });
        return { finalBuffer: artisan.finalBuffer, imageError: null as string | null, layout: artisan.layout };
      } catch {
        // détourage indisponible ou erreur — bascule sur le pipeline standard
      }
    }

    const backgroundResult =
      photoBuffer && photoBase64
        ? await buildPosterBackground(
            photoBuffer,
            photoBase64,
            mediaType,
            productName,
            industry,
            null,
            extraPhotos,
            undefined,
            normalizedShowSecondaryPhotos,
            { multi: multiContext, productAnalysis: groupedAnalysis }
          )
        : await buildServiceBackground(productName, serviceDescription, normalizedItems, industry);

    const { backgroundBuffer, imageError, layout, accentGradient, creativeBrief } = backgroundResult;
  // Points forts issus de l'analyse du produit (aucun pour un service sans photo : l'IA les choisit).
  const sellingPoints: string[] =
    "sellingPoints" in backgroundResult && Array.isArray(backgroundResult.sellingPoints) ? (backgroundResult.sellingPoints as string[]) : [];

    const { finalBuffer } = await renderFinalPoster(new URL(request.url).origin, backgroundBuffer, {
      layout,
      productName,
      price,
      phone,
      industry,
      accentGradient,
      creativeBrief,
      benefits: sellingPoints,
      // Vraies photos secondaires posées en vignettes sur l'affiche finale (jamais redessinées).
      secondaryPhotos: photoBuffer ? extraPhotos.map((p) => Buffer.from(p.base64, "base64")) : [],
      galleryZone: backgroundResult.galleryZone,
      businessName,
      logoBuffer,
      serviceItems: normalizedItems,
    });

    return { finalBuffer, imageError, layout };
  }

  // V2 : génération multi-photos, puis repli V1 (photo principale seule) si une étape échoue.
  type V2Outcome =
    | { used: true; design: DesignV2; scene: Buffer; heroPath: string; secondaryPaths: string[]; excluded: Excluded[] }
    | { used: false; reason: string; excluded: Excluded[]; costUsd: number };
  let v2Outcome: V2Outcome | null = null;

  async function recentV2Layouts(): Promise<LayoutId[]> {
    try {
      const { data } = await supabase
        .from("creations")
        .select("design")
        .eq("user_id", user!.id)
        .eq("pipeline_version", "v2")
        .order("created_at", { ascending: false })
        .limit(2);
      return (data ?? []).map((r) => (r.design as DesignV2 | null)?.render?.layout).filter((l): l is LayoutId => !!l);
    } catch {
      return [];
    }
  }

  async function renderPoster() {
    if (!useV2) return renderVariation();
    const v2 = await generatePosterV2({
      photos: v2Photos,
      heroFixed: !!mainPhotoChosen,
      content: { productName, price, industry, phone, businessName, logo: logoBuffer },
      recentLayouts: await recentV2Layouts(),
    });
    if (v2.status === "ok") {
      v2Outcome = { used: true, design: v2.design, scene: v2.scene, heroPath: v2.heroPath, secondaryPaths: v2.secondaryPaths, excluded: v2.excluded };
      effectivePhotoPath = v2.heroPath;
      effectiveExtraPaths = v2.secondaryPaths;
      normalizedShowSecondaryPhotos = true;
      return { finalBuffer: v2.image, imageError: null as string | null, layout: null as LayoutVariant | null };
    }
    // Repli V1 : photo principale (choisie par le vendeur ou par l'analyse V2) seule.
    v2Outcome = { used: false, reason: `${v2.stage} : ${v2.reason}`, excluded: v2.excluded, costUsd: v2.est_cost_usd };
    const hero = v2Photos[v2.heroIndex] ?? v2Photos[0];
    photoBuffer = hero.buffer;
    photoBase64 = hero.buffer.toString("base64");
    mediaType = hero.mediaType;
    effectivePhotoPath = hero.path;
    effectiveExtraPaths = [];
    extraPhotos.length = 0;
    multiContext = null;
    groupedAnalysis = v2.productAnalysis;
    normalizedShowSecondaryPhotos = false;
    return renderVariation();
  }

  // Palier Gold : seule la 1ère déclinaison est générée ici. La 2e est optionnelle, générée à
  // la demande via /api/creations/[id]/declination — ça évite de payer 2x la génération pour
  // les clients qui se contentent de la première (économie substantielle en moyenne).
  let posterPath: string | null = null;
  let usedLayout: LayoutVariant | null = null;
  let scenePath: string | null = null;
  let imageError: string | null = null;
  let salesCopy: string | null = null;
  let hashtags: string[] = [];
  let copyError: string | null = null;

  try {
    const [copyResult, variation] = await Promise.all([
      generateSalesCopy(photoBase64 ? { base64: photoBase64, mediaType } : null, {
        productName,
        price,
        industry,
        language,
        serviceDescription,
        serviceItems: normalizedItems,
      }),
      renderPoster(),
    ]);
    salesCopy = copyResult.salesCopy;
    hashtags = copyResult.hashtags;
    copyError = copyResult.copyError;
    imageError = variation.imageError;
    usedLayout = variation.layout;

    posterPath = `${user.id}/${Date.now()}-poster.jpg`;
    // Affiche nette : écrite (et lue) par le serveur seulement — migration 0034.
    const { error: posterUploadError } = await createAdminClient().storage
      .from("creations")
      .upload(posterPath, variation.finalBuffer, { contentType: "image/jpeg" });
    if (posterUploadError) posterPath = null;
    // V2 : scène sans texte (privée, migration 0040) pour « autre mise en page » sans appel IA.
    const v2Done = v2Outcome as V2Outcome | null;
    if (posterPath && v2Done?.used) {
      scenePath = posterPath.replace(/-poster\.jpg$/, "-poster-scene.jpg");
      const { error: sceneUploadError } = await createAdminClient()
        .storage.from("creations")
        .upload(scenePath, v2Done.scene, { contentType: "image/jpeg" });
      if (sceneUploadError) scenePath = null;
    }
  } catch (err) {
    console.error("[generate-creation] affiche non produite :", err instanceof Error ? err.message : err);
    posterPath = null;
  }
  const v2Final = v2Outcome as V2Outcome | null;
  const v2Design = v2Final?.used ? v2Final.design : null;

  // Jaarle 2.0 : lien optionnel vers le produit (et sa boutique), vérifié côté propriétaire.
  // Sans productId, l'enregistrement est strictement identique à avant.
  let productLink: { product_id: string; shop_id: string } | null = null;
  if (productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id, shop_id")
      .eq("id", productId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (product) productLink = { product_id: product.id as string, shop_id: product.shop_id as string };
  }

  // Écriture par le serveur (migration 0034) : le navigateur ne peut plus créer de ligne lui-même.
  // Les chemins de photos ont été vérifiés plus haut (téléchargés avec la session du vendeur).
  const { data: creation, error: insertError } = await createAdminClient()
    .from("creations")
    .insert({
      user_id: user.id,
      product_name: productName,
      price,
      style: AUTO_STYLE,
      photo_path: effectivePhotoPath,
      extra_photo_paths: effectiveExtraPaths.length ? effectiveExtraPaths.slice(0, maxExtraPhotos) : null,
      show_secondary_photos: normalizedShowSecondaryPhotos,
      poster_path: posterPath,
      layout: usedLayout,
      industry,
      language,
      generated_copy: salesCopy,
      generated_hashtags: hashtags,
      unlocked: unlockedByPlan,
      tier: normalizedTier,
      regenerations_used: 0,
      logo_path: logoBuffer ? logoPath : null,
      business_name: businessName,
      contact_phone: phone || null,
      subject_type: normalizedSubjectType,
      service_description: normalizedSubjectType === "service" ? serviceDescription : null,
      service_items: normalizedItems.length > 0 ? normalizedItems : null,
      ...(productLink ?? {}),
      // V2 (migration 0040) : colonnes écrites seulement pour une affiche V2 — la V1 reste identique.
      ...(v2Design && posterPath ? { pipeline_version: "v2", design: v2Design, scene_path: scenePath } : {}),
    })
    .select()
    .single();

  if (insertError || !creation) {
    await refundUsage(usageEventId);
    return NextResponse.json({ error: insertError?.message ?? "Échec de l'enregistrement." }, { status: 500 });
  }

  // Affiche non produite (erreur IA / stockage) : la génération n'est pas décomptée.
  if (!posterPath) await refundUsage(usageEventId);
  else await attachUsage(usageEventId, { creationId: creation.id as string });
  void logAiCall({
    userId: user.id,
    feature: "poster_generate",
    estCostUsd: v2Design
      ? v2Design.est_cost_usd
      : AI_COST_ESTIMATES_USD.poster_generate[normalizedTier === "gold" ? "gold" : "premium"] + (v2Final && !v2Final.used ? v2Final.costUsd : 0),
    images: v2Design ? v2Design.calls.image : 1,
    usageEventId,
    shopId: productLink?.shop_id ?? null,
    creationId: creation.id as string,
    meta: {
      tier: normalizedTier,
      posterReady: !!posterPath,
      ...(v2Final ? { pipeline: v2Final.used ? "v2" : "v2_fallback_v1", ...(v2Final.used ? {} : { fallback: v2Final.reason }) } : {}),
    },
  });

  // Historique : on enregistre l'affiche comme 1ʳᵉ version (variante principale).
  if (posterPath) {
    await createAdminClient().from("creation_versions").insert({
      creation_id: creation.id,
      user_id: user.id,
      poster_path: posterPath,
      kind: "principale",
      ...(v2Design ? { design: v2Design, scene_path: scenePath } : {}),
    });
  }

  return NextResponse.json({
    salesCopy,
    hashtags,
    copyError,
    imageUrl: `/api/creations/${creation.id}/preview?v=${Date.now()}`,
    imageError,
    posterReady: !!posterPath,
    creationId: creation.id,
    productName,
    price,
    tier: creation.tier,
    unlocked: unlockedByPlan, // Jaarle 2.0 : affiche livrée débloquée (Pro / crédits)
    // V2 multi-photos (testeurs) : photos écartées et repli éventuel, pour l'écran de résultat.
    v2: v2Final
      ? {
          used: v2Final.used,
          excluded: v2Final.excluded.map((e) => e.reason),
          otherLayouts: v2Design && scenePath ? otherLayoutsCount(v2Design) : 0,
        }
      : null,
  });
}
