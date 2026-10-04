import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { shopMediaUrl, thumbPath } from "@/lib/shops/media";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";

// Upload d'une image de boutique (logo, bannière, photo produit) vers le bucket PUBLIC `shop-media`.
// Le bucket privé `creations` du générateur d'affiches n'est jamais utilisé ici.
// L'image est normalisée avec sharp (déjà utilisé par le pipeline) : orientation EXIF corrigée,
// taille maximale selon l'usage, WebP — léger pour les visiteurs sur connexion mobile.

export const runtime = "nodejs";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;

const KINDS = {
  logo: { maxSide: 512, folder: "shops", quality: 90 },
  banner: { maxSide: 1600, folder: "shops", quality: 80 },
  product: { maxSide: 1200, folder: "products", quality: 82 },
  // Image d'aperçu d'une vidéo produit (frame extraite dans le navigateur) — migration 0035.
  video_poster: { maxSide: 1280, folder: "videos", quality: 78 },
} as const;

type Kind = keyof typeof KINDS;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const kind = String(form.get("kind") || "") as Kind;
  const file = form.get("file");
  if (!(kind in KINDS) || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Image ou type manquant." }, { status: 400 });
  }
  if (file.size > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (8 Mo maximum)." }, { status: 413 });
  }

  const config = KINDS[kind];
  let output: { data: Buffer; info: { width: number; height: number } };
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // applique l'orientation EXIF des photos de téléphone
      .resize({ width: config.maxSide, height: config.maxSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality: config.quality })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return NextResponse.json({ error: "Format d'image non pris en charge. Essaie en JPG ou PNG." }, { status: 415 });
  }

  // 1er segment = user.id : exigé par les policies storage (0016_shop_media_bucket.sql).
  const path = `${user.id}/${config.folder}/${randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage
    .from(SHOP_MEDIA_BUCKET)
    .upload(path, output.data, { contentType: "image/webp", cacheControl: "31536000" });

  if (uploadError) {
    console.error("[shop-media/upload] upload failed:", uploadError);
    return NextResponse.json({ error: "Échec de l'enregistrement de l'image." }, { status: 500 });
  }

  // Photos produit : miniature 400 px à côté ({uuid}_400.webp) pour les grilles de la boutique
  // publique — bien plus légère sur connexion mobile. Best-effort : sans miniature, on affiche l'originale.
  if (kind === "product") {
    try {
      const thumb = await sharp(output.data).resize({ width: 400, height: 400, fit: "inside" }).webp({ quality: 75 }).toBuffer();
      await supabase.storage
        .from(SHOP_MEDIA_BUCKET)
        .upload(thumbPath(path), thumb, { contentType: "image/webp", cacheControl: "31536000" });
    } catch (err) {
      console.error("[shop-media/upload] thumbnail failed:", err);
    }
  }

  return NextResponse.json({
    path,
    url: shopMediaUrl(path),
    width: output.info.width,
    height: output.info.height,
  });
}
