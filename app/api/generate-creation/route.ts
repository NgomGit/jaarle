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
  renderFinalPoster,
} from "@/lib/poster-pipeline";

// Le style visuel n'est plus choisi par l'utilisateur : l'IA le déduit du produit lui-même.
// La colonne `style` de `creations` reste NOT NULL pour compat avec les créations existantes.
const AUTO_STYLE = "auto";

const CopySchema = z.object({
  salesCopy: z.string(),
  hashtags: z.array(z.string()).max(8),
});

async function generateSalesCopy(photoBase64: string, mediaType: AllowedMediaType, params: {
  productName: string;
  price: number;
  industry: string | null;
  language: string;
}) {
  const culturalContext = buildCulturalContext({ industryKey: params.industry ?? undefined });
  const languageLabel =
    params.language === "wo"
      ? "wolof (mélangé naturellement avec du français si besoin, comme parlent vraiment les commerçants à Dakar — pas une traduction littérale)"
      : "français";

  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: culturalContext,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: photoBase64 } },
            {
              type: "text",
              text: `Produit : "${params.productName}", prix : ${params.price} FCFA. Écris en ${languageLabel}. Rédige un texte de vente court (2-3 phrases, prêt à publier sur Facebook/Instagram/WhatsApp) et une liste de 4 à 6 hashtags pertinents pour le Sénégal.`,
            },
          ],
        },
      ],
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

  const { photoPath, productName, price, industry, language, tier, logoPath, businessName } = (await request.json()) as {
    photoPath: string;
    productName: string;
    price: number;
    industry: string | null;
    language: string;
    tier: Tier;
    logoPath: string | null;
    businessName: string | null;
  };

  if (!photoPath || !productName || !price) {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const { data: photoBlob, error: downloadError } = await supabase.storage.from("creations").download(photoPath);
  if (downloadError || !photoBlob) {
    return NextResponse.json({ error: "Photo introuvable." }, { status: 500 });
  }

  const normalizedTier: Tier = (tier as Tier) || "basic";
  const photoBuffer = Buffer.from(await photoBlob.arrayBuffer());
  const photoBase64 = photoBuffer.toString("base64");
  const mediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(photoBlob.type as AllowedMediaType)
    ? (photoBlob.type as AllowedMediaType)
    : "image/jpeg";

  let logoBuffer: Buffer | null = null;
  if (normalizedTier === "premium" && logoPath) {
    const { data: logoBlob } = await supabase.storage.from("creations").download(logoPath);
    if (logoBlob) logoBuffer = Buffer.from(await logoBlob.arrayBuffer());
  }

  const [{ salesCopy, hashtags, copyError }, { backgroundBuffer, imageError, layout, accentGradient }] = await Promise.all([
    generateSalesCopy(photoBase64, mediaType, { productName, price, industry, language }),
    buildPosterBackground(photoBuffer, photoBase64, mediaType, productName, industry, normalizedTier),
  ]);

  const phone =
    (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";

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
