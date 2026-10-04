"use client";

// Réduction d'image dans le navigateur AVANT envoi :
// - économise les données mobiles du commerçant (une photo de téléphone fait souvent 3 à 8 Mo) ;
// - reste sous la limite de 4,5 Mo des requêtes serverless Vercel.
// Le serveur refait ensuite une passe sharp (WebP, taille finale) : ceci n'est qu'un pré-traitement.

export async function downscaleImage(
  file: File,
  { maxSide = 1600, quality = 0.85 }: { maxSide?: number; quality?: number } = {}
): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    // PNG conservé pour préserver la transparence (logos) ; JPEG sinon (bien plus léger).
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    // HEIC non décodable par ce navigateur, etc. : on envoie l'original, le serveur tranchera.
    return file;
  }
}

export type ShopMediaKind = "logo" | "banner" | "product" | "video_poster";

export interface UploadedShopMedia {
  path: string;
  url: string;
  width: number;
  height: number;
}

/** Réduit puis envoie une image vers le bucket public `shop-media` via /api/shop-media/upload. */
export async function uploadShopMedia(file: File, kind: ShopMediaKind): Promise<UploadedShopMedia> {
  const blob = await downscaleImage(file, { maxSide: kind === "logo" ? 1024 : 1600 });
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", blob, file.name || "image");
  const res = await fetch("/api/shop-media/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Échec de l'envoi de l'image.");
  return data as UploadedShopMedia;
}
