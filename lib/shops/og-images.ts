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
