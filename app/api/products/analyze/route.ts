import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { buildShopContext } from "@/lib/shops/context";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";
import { suggestProductFromPhotos, type AutofillImage } from "@/lib/ai/product-autofill";
import { logAiCall } from "@/lib/billing/ai-cost";

// POST /api/products/analyze — { paths: string[] } (photos déjà envoyées dans shop-media)
// → proposition de fiche produit. L'IA propose, le commerçant valide : rien n'est enregistré ici.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGES = 3;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = Array.isArray(body?.paths)
    ? (body!.paths as unknown[]).filter((p): p is string => typeof p === "string" && p.startsWith(`${user.id}/products/`))
    : [];
  if (paths.length === 0) return NextResponse.json({ error: "Aucune photo à analyser." }, { status: 400 });

  // Images réduites à 768 px en JPEG : suffisant pour reconnaître un produit, et bien moins de tokens.
  const images: AutofillImage[] = [];
  for (const path of paths.slice(0, MAX_IMAGES)) {
    const { data: blob } = await supabase.storage.from(SHOP_MEDIA_BUCKET).download(path);
    if (!blob) continue;
    try {
      const jpeg = await sharp(Buffer.from(await blob.arrayBuffer()))
        .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      images.push({ base64: jpeg.toString("base64"), mediaType: "image/jpeg" });
    } catch {
      // image illisible : ignorée
    }
  }
  if (images.length === 0) return NextResponse.json({ error: "Photo introuvable." }, { status: 404 });

  const shop = await getMyShop(supabase, user.id);
  const shopContext = shop ? buildShopContext(shop) : "";

  try {
    const suggestion = await suggestProductFromPhotos(images, shopContext, (u) =>
      void logAiCall({ userId: user.id, feature: "product_autofill", model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, images: images.length, shopId: shop?.id ?? null })
    );
    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[products/analyze] failed:", err);
    return NextResponse.json({ error: "L'IA n'a pas pu analyser la photo. Remplis la fiche à la main." }, { status: 502 });
  }
}
