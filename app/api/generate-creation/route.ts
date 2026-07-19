import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildCulturalContext } from "@/lib/knowledge/context";
import { type Tier } from "@/lib/pricing";
import {
  ALLOWED_MEDIA_TYPES,
  type AllowedMediaType,
  buildPosterBackground,
  buildServiceBackground,
  renderFinalPoster,
} from "@/lib/poster-pipeline";

// Le style visuel n'est plus choisi par l'utilisateur : l'IA le déduit du produit lui-même.
// La colonne `style` de `creations` reste NOT NULL pour compat avec les créations existantes.
const AUTO_STYLE = "auto";

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

  const {
    photoPath,
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
  } = (await request.json()) as {
    photoPath: string | null;
    productName: string;
    price: number | null;
    industry: string | null;
    language: string;
    tier: Tier;
    logoPath: string | null;
    businessName: string | null;
    contactPhone: string | null;
    subjectType: "product" | "service";
    serviceDescription: string | null;
    serviceItems: string[] | null;
  };

  const normalizedSubjectType: "product" | "service" = subjectType === "service" ? "service" : "product";
  const normalizedItems = (serviceItems ?? []).map((i) => i.trim()).filter(Boolean).slice(0, 10);

  if (!productName || (normalizedSubjectType === "product" && !photoPath)) {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const normalizedTier: Tier = (tier as Tier) || "basic";

  let logoBuffer: Buffer | null = null;
  if (normalizedTier === "premium" && logoPath) {
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

  const [{ salesCopy, hashtags, copyError }, backgroundResult] = await Promise.all([
    generateSalesCopy(photoBase64 ? { base64: photoBase64, mediaType } : null, {
      productName,
      price,
      industry,
      language,
      serviceDescription,
      serviceItems: normalizedItems,
    }),
    photoBuffer && photoBase64
      ? buildPosterBackground(photoBuffer, photoBase64, mediaType, productName, industry, normalizedTier)
      : buildServiceBackground(productName, serviceDescription, normalizedItems, industry, normalizedTier),
  ]);

  const { backgroundBuffer, imageError, layout, accentGradient } = backgroundResult;

  const phone =
    contactPhone?.trim() || (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";

  let posterPath: string | null = null;
  try {
    const origin = new URL(request.url).origin;
    const { finalBuffer } = await renderFinalPoster(origin, backgroundBuffer, {
      tier: normalizedTier,
      layout,
      productName,
      price,
      phone,
      industry,
      accentGradient,
      businessName,
      logoBuffer,
      serviceItems: normalizedItems,
    });

    posterPath = `${user.id}/${Date.now()}-poster.jpg`;
    const { error: posterUploadError } = await supabase.storage
      .from("creations")
      .upload(posterPath, finalBuffer, { contentType: "image/jpeg" });
    if (posterUploadError) posterPath = null;
  } catch {
    posterPath = null;
  }

  const { data: creation, error: insertError } = await supabase
    .from("creations")
    .insert({
      user_id: user.id,
      product_name: productName,
      price,
      style: AUTO_STYLE,
      photo_path: photoPath,
      poster_path: posterPath,
      industry,
      language,
      generated_copy: salesCopy,
      generated_hashtags: hashtags,
      unlocked: false,
      tier: normalizedTier,
      regenerations_used: 0,
      logo_path: normalizedTier === "premium" ? logoPath : null,
      business_name: normalizedTier === "premium" ? businessName : null,
      contact_phone: phone || null,
      subject_type: normalizedSubjectType,
      service_description: normalizedSubjectType === "service" ? serviceDescription : null,
      service_items: normalizedItems.length > 0 ? normalizedItems : null,
    })
    .select()
    .single();

  if (insertError || !creation) {
    return NextResponse.json({ error: insertError?.message ?? "Échec de l'enregistrement." }, { status: 500 });
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
  });
}
