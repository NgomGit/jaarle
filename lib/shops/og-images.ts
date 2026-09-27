import sharp from "sharp";

/**
 * Récupère une image publique (WebP) et la convertit en PNG data-URI pour les images Open Graph :
 * le moteur de rendu de next/og ne lit pas le WebP, et WhatsApp affiche mal ce format en aperçu.
 */
export async function toPngDataUri(
  url: string | null,
  size: number,
  height: number = size // hauteur facultative : recadrage non carré (ex. visuels du Studio)
): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: size, height, fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Convertit une image Open Graph (PNG de next/og) en JPEG : 5 à 10 fois plus léger, ce qui compte
 * pour les aperçus de liens WhatsApp (image ignorée au-delà d'environ 300 Ko).
 */
export async function toJpegResponse(image: Response, quality = 82): Promise<Response> {
  const jpeg = await sharp(Buffer.from(await image.arrayBuffer())).jpeg({ quality, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400" },
  });
}
