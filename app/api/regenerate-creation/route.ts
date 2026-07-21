import { NextResponse } from "next/server";
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
      "id, product_name, price, photo_path, industry, tier, regenerations_used, logo_path, business_name, contact_phone, service_description, service_items"
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

    backgroundResult = await buildPosterBackground(
      photoBuffer,
      photoBase64,
      mediaType,
      creation.product_name,
      creation.industry,
      trimmedInstructions
    );
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

  return NextResponse.json({
    imageUrl: `/api/creations/${creation.id}/preview?v=${Date.now()}`,
    imageError,
    regenerationsRemaining: tierConfig.maxRegenerations - regenerationsUsed,
  });
}
