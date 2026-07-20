import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_MEDIA_TYPES,
  type AllowedMediaType,
  type LayoutVariant,
  buildPosterBackground,
  buildServiceBackground,
  renderFinalPoster,
} from "@/lib/poster-pipeline";

// Même raison que generate-creation/route.ts.
export const maxDuration = 300;

/**
 * Génère la 2e déclinaison Gold à la demande — jamais automatique, pour ne payer la génération
 * que si le client la veut vraiment. Une seule déclinaison par création (bloque si poster_path_2
 * existe déjà). Le gabarit est forcé à l'opposé de la 1ère variation pour garantir une vraie
 * différence visuelle entre les deux.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { customInstructions } = (await request.json()) as { customInstructions?: string | null };
  const trimmedInstructions = customInstructions?.trim().slice(0, 300) || null;

  const { data: creation, error: creationError } = await supabase
    .from("creations")
    .select(
      "id, product_name, price, photo_path, extra_photo_paths, show_secondary_photos, industry, tier, layout, logo_path, business_name, contact_phone, service_description, service_items, poster_path_2"
    )
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (creationError || !creation) {
    return NextResponse.json({ error: "Création introuvable." }, { status: 404 });
  }

  if (creation.tier !== "gold") {
    return NextResponse.json({ error: "La déclinaison est réservée au palier Advanced." }, { status: 400 });
  }

  if (creation.poster_path_2) {
    return NextResponse.json({ error: "Une déclinaison a déjà été générée pour cette création." }, { status: 400 });
  }

  const opposingLayout: LayoutVariant = creation.layout === "side-panel" ? "bottom-bar" : "side-panel";
  const phone = creation.contact_phone || (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";

  let logoBuffer: Buffer | null = null;
  if (creation.logo_path) {
    const { data: logoBlob } = await supabase.storage.from("creations").download(creation.logo_path);
    if (logoBlob) logoBuffer = Buffer.from(await logoBlob.arrayBuffer());
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

    const extraPhotos: { base64: string; mediaType: AllowedMediaType }[] = [];
    for (const extraPath of creation.extra_photo_paths ?? []) {
      const { data: extraBlob } = await supabase.storage.from("creations").download(extraPath);
      if (extraBlob) {
        const buf = Buffer.from(await extraBlob.arrayBuffer());
        const extraMediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(extraBlob.type as AllowedMediaType)
          ? (extraBlob.type as AllowedMediaType)
          : "image/jpeg";
        extraPhotos.push({ base64: buf.toString("base64"), mediaType: extraMediaType });
      }
    }

    backgroundResult = await buildPosterBackground(
      photoBuffer,
      photoBase64,
      mediaType,
      creation.product_name,
      creation.industry,
      "gold",
      trimmedInstructions,
      extraPhotos,
      opposingLayout,
      !!creation.show_secondary_photos
    );
  } else {
    backgroundResult = await buildServiceBackground(
      creation.product_name,
      creation.service_description,
      creation.service_items ?? [],
      creation.industry,
      "gold",
      trimmedInstructions,
      opposingLayout
    );
  }

  const { backgroundBuffer, imageError, layout, accentGradient, creativeBrief } = backgroundResult;

  // `imageError` non-null signifie que buildPosterBackground/buildServiceBackground n'a pas réussi
  // à générer un fond IA et est retombé silencieusement sur la photo brute (ou un fond uni pour un
  // service) — un vrai échec, pas juste un rendu dégradé. Contrairement à la 1ère variation (qui
  // DOIT toujours livrer quelque chose puisque le client a déjà payé), la déclinaison est facultative :
  // mieux vaut échouer franchement et laisser `poster_path_2` à null (le garde-fou "une seule
  // déclinaison" se base dessus) plutôt que de facturer au client sa seule tentative avec la photo
  // d'origine déguisée en "déclinaison".
  if (imageError) {
    return NextResponse.json({ error: "La génération de la déclinaison a échoué. Réessaie." }, { status: 500 });
  }

  let posterPath2: string | null = null;
  try {
    const origin = new URL(request.url).origin;
    const { finalBuffer } = await renderFinalPoster(origin, backgroundBuffer, {
      tier: "gold",
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

    posterPath2 = `${user.id}/${Date.now()}-poster-2.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("creations")
      .upload(posterPath2, finalBuffer, { contentType: "image/jpeg" });
    if (uploadError) posterPath2 = null;
  } catch {
    posterPath2 = null;
  }

  if (!posterPath2) {
    return NextResponse.json({ error: "Échec de la génération de la déclinaison." }, { status: 500 });
  }

  const { error: updateError } = await supabase.from("creations").update({ poster_path_2: posterPath2 }).eq("id", creation.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    imageUrl2: `/api/creations/${creation.id}/preview?variant=2&v=${Date.now()}`,
  });
}
