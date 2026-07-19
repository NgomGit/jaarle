import sharp from "sharp";

/**
 * Superpose une image d'overlay (texte/badges rendus via satori, fond transparent)
 * sur une image de fond, et retourne le JPEG final aplati (bien plus léger qu'un PNG
 * pour ce type de visuel photographique, sans perte visible à qualité 90).
 */
export async function compositeOverlay(backgroundBuffer: Buffer, overlayBuffer: Buffer): Promise<Buffer> {
  const background = sharp(backgroundBuffer).resize(1024, 1024, { fit: "cover" });
  return background
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/**
 * Normalise une image (déjà finalisée, texte inclus par l'IA) au même format de sortie que le
 * reste du pipeline : 1024×1024, JPEG optimisé.
 */
export async function finalizeJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1024, 1024, { fit: "cover" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
