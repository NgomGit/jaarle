import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { buildShopContext } from "@/lib/shops/context";
import { suggestProductFromPhotos, type AutofillImage } from "@/lib/ai/product-autofill";
import { logAiCall } from "@/lib/billing/ai-cost";

// POST /api/creations/suggest-name — FormData { photos: File[] } (photos pas encore envoyées)
// → nom de produit proposé par l'IA quand le commerçant n'en a pas saisi. Réutilise l'analyse
// « photo → fiche produit » (Haiku, peu coûteuse). L'IA propose, le commerçant peut modifier ;
// rien n'est enregistré ici et aucune génération n'est décomptée.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGES = 3;
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("photos") ?? []).filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_BYTES);
  if (files.length === 0) return NextResponse.json({ error: "Aucune photo à analyser." }, { status: 400 });

  const images: AutofillImage[] = [];
  for (const file of files.slice(0, MAX_IMAGES)) {
    try {
      const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      images.push({ base64: jpeg.toString("base64"), mediaType: "image/jpeg" });
    } catch {
      // image illisible : ignorée
    }
  }
  if (images.length === 0) return NextResponse.json({ error: "Photo illisible." }, { status: 400 });

  const shop = await getMyShop(supabase, user.id).catch(() => null);
  const shopContext = shop ? buildShopContext(shop) : "";

  try {
    const suggestion = await suggestProductFromPhotos(images, shopContext, (u) =>
      void logAiCall({
        userId: user.id,
        feature: "product_autofill",
        model: u.model,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        images: images.length,
        shopId: shop?.id ?? null,
        meta: { source: "poster_name" },
      })
    );
    return NextResponse.json({ name: suggestion.name, subjectType: suggestion.subjectType });
  } catch (err) {
    console.error("[creations/suggest-name] failed:", err);
    return NextResponse.json({ error: "L'IA n'a pas pu proposer de nom." }, { status: 502 });
  }
}
