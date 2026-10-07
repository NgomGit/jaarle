import sharp from "sharp";
import type { PctRect } from "@/lib/poster-v2/types";
import type { Rgb } from "@/lib/poster-v2/color";

// Traitement local des photos (aucune IA) :
//  - recadrage intelligent d'une vraie photo secondaire sur sa zone utile (rectangle donné par
//    l'analyse), au ratio exact de la case de la mise en page ;
//  - mesure de netteté (variance du laplacien) pour écarter une photo floue ;
//  - léger réglage global (saturation, accentuation douce), sans retouche locale ni génération :
//    les photos du vendeur restent fidèles ;
//  - recadrage de la scène dans son cadre, couleur moyenne d'une zone (pour calculer les voiles).

export interface CropResult {
  image: Buffer;
  /** Zone gardée, en % de la photo d'origine (après rotation EXIF). */
  rect: PctRect;
  /** Agrandissement appliqué (> 1 = la photo a été agrandie). */
  upscale: number;
}

const MAX_UPSCALE = 1.6;

/** Image orientée (EXIF appliqué) + dimensions. */
async function oriented(buffer: Buffer): Promise<{ img: Buffer; width: number; height: number }> {
  const img = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(img).metadata();
  return { img, width: meta.width ?? 1, height: meta.height ?? 1 };
}

/**
 * Plus petit rectangle au ratio `aspect` (largeur / hauteur) qui contient `focus` agrandi de
 * `expand`, centré sur lui et borné à l'image. Calcul pur (testé).
 */
export function cropRectFor(
  imgW: number,
  imgH: number,
  aspect: number,
  focus?: PctRect | null,
  expand = 0.15
): { left: number; top: number; width: number; height: number } {
  const f = focus ?? { x: 0, y: 0, w: 100, h: 100 };
  let fw = (f.w / 100) * imgW * (1 + expand);
  let fh = (f.h / 100) * imgH * (1 + expand);
  const cx = ((f.x + f.w / 2) / 100) * imgW;
  const cy = ((f.y + f.h / 2) / 100) * imgH;
  // Agrandir le côté manquant pour atteindre le ratio voulu.
  if (fw / fh < aspect) fw = fh * aspect;
  else fh = fw / aspect;
  // Trop grand pour l'image : réduire en gardant le ratio.
  const scale = Math.min(1, imgW / fw, imgH / fh);
  fw *= scale;
  fh *= scale;
  const left = Math.min(Math.max(0, cx - fw / 2), imgW - fw);
  const top = Math.min(Math.max(0, cy - fh / 2), imgH - fh);
  return { left: Math.round(left), top: Math.round(top), width: Math.max(1, Math.round(fw)), height: Math.max(1, Math.round(fh)) };
}

/** Recadre une photo réelle sur sa zone utile, au format exact d'une case (outW × outH). */
export async function smartCrop(buffer: Buffer, outW: number, outH: number, focus?: PctRect | null): Promise<CropResult> {
  const { img, width, height } = await oriented(buffer);
  const r = cropRectFor(width, height, outW / outH, focus);
  const upscale = outW / r.width;
  const image = await sharp(img)
    .extract(r)
    .resize(outW, outH, { fit: "cover", kernel: "lanczos3" })
    // Réglage global très léger : la photo reste celle du vendeur.
    .modulate({ saturation: 1.04 })
    .sharpen({ sigma: upscale > 1 ? 0.8 : 0.5 })
    .jpeg({ quality: 92 })
    .toBuffer();
  return {
    image,
    rect: { x: (r.left / width) * 100, y: (r.top / height) * 100, w: (r.width / width) * 100, h: (r.height / height) * 100 },
    upscale,
  };
}

/** La case demande-t-elle un agrandissement excessif de la zone utile ? */
export function isUpscaleAcceptable(upscale: number): boolean {
  return upscale <= MAX_UPSCALE;
}

/** Netteté : variance du laplacien sur une version réduite en gris. Plus c'est haut, plus c'est net. */
export async function sharpness(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: "inside" })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    sq += data[i] * data[i];
  }
  const mean = sum / data.length;
  return sq / data.length - mean * mean;
}

/** Seuil de netteté en dessous duquel une photo secondaire est écartée (à calibrer au benchmark). */
export const MIN_SHARPNESS = 18;

/** Recadre la scène pour remplir exactement son cadre (cover, centré sur `focus` en %). */
export async function coverScene(scene: Buffer, outW: number, outH: number, focus?: { x: number; y: number }): Promise<Buffer> {
  const { img, width, height } = await oriented(scene);
  const aspect = outW / outH;
  let w = width;
  let h = width / aspect;
  if (h > height) {
    h = height;
    w = height * aspect;
  }
  const cx = ((focus?.x ?? 50) / 100) * width;
  const cy = ((focus?.y ?? 50) / 100) * height;
  const left = Math.round(Math.min(Math.max(0, cx - w / 2), width - w));
  const top = Math.round(Math.min(Math.max(0, cy - h / 2), height - h));
  return sharp(img)
    .extract({ left, top, width: Math.round(w), height: Math.round(h) })
    .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Couleur moyenne d'une zone d'une image (rect en px de l'image). */
export async function meanColor(img: Buffer, rect: { left: number; top: number; width: number; height: number }): Promise<Rgb> {
  const meta = await sharp(img).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const left = Math.max(0, Math.min(W - 1, Math.round(rect.left)));
  const top = Math.max(0, Math.min(H - 1, Math.round(rect.top)));
  const width = Math.max(1, Math.min(W - left, Math.round(rect.width)));
  const height = Math.max(1, Math.min(H - top, Math.round(rect.height)));
  const { channels } = await sharp(img).extract({ left, top, width, height }).stats();
  return { r: channels[0].mean, g: channels[1].mean, b: channels[2].mean };
}

/** Image → data URI pour le rendu. */
export function dataUri(buffer: Buffer, mime = "image/jpeg"): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Logo du vendeur → PNG data URI borné (le rendu accepte png / jpeg). */
export async function logoDataUri(logo: Buffer, maxW: number, maxH: number): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    const png = await sharp(logo).rotate().resize(maxW * 2, maxH * 2, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const meta = await sharp(png).metadata();
    const ratio = Math.min(maxW / (meta.width ?? maxW), maxH / (meta.height ?? maxH));
    return { uri: dataUri(png, "image/png"), width: Math.round((meta.width ?? maxW) * ratio), height: Math.round((meta.height ?? maxH) * ratio) };
  } catch {
    return null;
  }
}
