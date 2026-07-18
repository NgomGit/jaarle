import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildCulturalContext } from "@/lib/knowledge/context";

const CopySchema = z.object({
  salesCopy: z.string(),
  hashtags: z.array(z.string()).max(8),
});

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { refCommand } = (await request.json()) as { refCommand: string };
  if (!refCommand) {
    return NextResponse.json({ error: "Commande manquante." }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("ref_command", refCommand)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }

  if (order.status !== "paid") {
    return NextResponse.json({ error: "Paiement non confirmé." }, { status: 402 });
  }

  // Idempotence : si la création existe déjà pour cette commande, on la renvoie sans regénérer.
  if (order.creation_id) {
    const { data: existing } = await supabase.from("creations").select("*").eq("id", order.creation_id).single();
    if (existing) {
      const posterPath = existing.poster_path || existing.photo_path;
      const { data: signed } = await supabase.storage.from("creations").createSignedUrl(posterPath, 3600);
      return NextResponse.json({
        salesCopy: existing.generated_copy,
        hashtags: existing.generated_hashtags ?? [],
        copyError: null,
        imageUrl: signed?.signedUrl ?? null,
        imageError: null,
        creationId: existing.id,
        productName: existing.product_name,
        price: existing.price,
      });
    }
  }

  const { data: photoBlob, error: downloadError } = await supabase.storage.from("creations").download(order.photo_path);
  if (downloadError || !photoBlob) {
    return NextResponse.json({ error: "Photo introuvable." }, { status: 500 });
  }

  const photoBuffer = Buffer.from(await photoBlob.arrayBuffer());
  const photoBase64 = photoBuffer.toString("base64");
  const mediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(photoBlob.type as AllowedMediaType)
    ? (photoBlob.type as AllowedMediaType)
    : "image/jpeg";

  const culturalContext = buildCulturalContext({ industryKey: order.industry ?? undefined });
  const languageLabel =
    order.language === "wo"
      ? "wolof (mélangé naturellement avec du français si besoin, comme parlent vraiment les commerçants à Dakar — pas une traduction littérale)"
      : "français";

  let salesCopy: string | null = null;
  let hashtags: string[] = [];
  let copyError: string | null = null;

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
              text: `Produit : "${order.product_name}", prix : ${order.price} FCFA, style visuel choisi : "${order.style}". Écris en ${languageLabel}. Rédige un texte de vente court (2-3 phrases, prêt à publier sur Facebook/Instagram/WhatsApp) et une liste de 4 à 6 hashtags pertinents pour le Sénégal.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(CopySchema) },
    });

    if (message.parsed_output) {
      salesCopy = message.parsed_output.salesCopy;
      hashtags = message.parsed_output.hashtags;
    } else {
      copyError = "Réponse IA invalide.";
    }
  } catch (err) {
    copyError = err instanceof Error ? err.message : "Erreur lors de la génération du texte.";
  }

  let generatedImageBase64: string | null = null;
  let imageError: string | null = null;

  try {
    const imagePrompt = `Transforme cette photo de produit en affiche publicitaire de style "${order.style}", adaptée au marché sénégalais. Garde le produit reconnaissable et fidèle à la photo originale. Ajoute un arrière-plan et une mise en page professionnelle, sans texte incrusté.`;

    const openRouterRes = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-image-1",
        prompt: imagePrompt,
        input_references: [{ type: "image_url", image_url: { url: `data:${mediaType};base64,${photoBase64}` } }],
        quality: "medium",
        size: "1024x1024",
      }),
    });

    if (!openRouterRes.ok) {
      throw new Error(`${openRouterRes.status} ${await openRouterRes.text()}`);
    }

    const editResult = (await openRouterRes.json()) as { data?: { b64_json?: string }[] };
    const b64 = editResult.data?.[0]?.b64_json;
    if (b64) {
      generatedImageBase64 = b64;
    } else {
      imageError = "Aucune image générée.";
    }
  } catch (err) {
    imageError = err instanceof Error ? err.message : "Erreur lors de la génération de l'image.";
  }

  let posterPath: string | null = null;
  if (generatedImageBase64) {
    posterPath = `${user.id}/${Date.now()}-poster.png`;
    const posterBuffer = Buffer.from(generatedImageBase64, "base64");
    const { error: posterUploadError } = await supabase.storage
      .from("creations")
      .upload(posterPath, posterBuffer, { contentType: "image/png" });
    if (posterUploadError) posterPath = null;
  }

  const { data: creation, error: insertError } = await supabase
    .from("creations")
    .insert({
      user_id: user.id,
      product_name: order.product_name,
      price: order.price,
      style: order.style,
      photo_path: order.photo_path,
      poster_path: posterPath,
      industry: order.industry,
      language: order.language,
      generated_copy: salesCopy,
      generated_hashtags: hashtags,
    })
    .select()
    .single();

  if (insertError || !creation) {
    return NextResponse.json({ error: insertError?.message ?? "Échec de l'enregistrement." }, { status: 500 });
  }

  await supabase.from("orders").update({ creation_id: creation.id }).eq("id", order.id);

  const displayPath = posterPath || order.photo_path;
  const { data: signed } = await supabase.storage.from("creations").createSignedUrl(displayPath, 3600);

  return NextResponse.json({
    salesCopy,
    hashtags,
    copyError,
    imageUrl: signed?.signedUrl ?? null,
    imageError,
    creationId: creation.id,
    productName: order.product_name,
    price: order.price,
  });
}
