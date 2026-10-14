import { createHash } from "node:crypto";
import sharp from "sharp";

// Bulk Upload — empreintes locales (serveur / scripts), sans IA ni dépendance nouvelle.
// dHash (64 bits, niveaux de gris) : repère les doublons et rafales quasi identiques.
// La couleur moyenne est comparée EN PLUS : un même modèle photographié pareil en rouge et en bleu
// a souvent le même dHash (niveaux de gris) — ce n'est pas un doublon.
// Limite mesurée en phase 0 : deux articles DIFFÉRENTS photographiés de la même façon (deux flacons
// identiques sauf l'étiquette) ont la même empreinte. Une paire « quasi identique » n'est donc qu'un
// signal « à vérifier », jamais une fusion ; seuls les fichiers identiques octet pour octet sont sûrs.

export interface ImagePrint {
  /** SHA-256 du fichier : identique = doublon certain. */
  sha256: string;
  /** dHash 64 bits en hexadécimal (16 caractères). */
  dhash: string;
  /** Couleur moyenne (0-255) d'une version 16×16. */
  rgb: [number, number, number];
}

export async function imagePrint(input: Buffer): Promise<ImagePrint> {
  const base = sharp(input).rotate();
  const gray = await base.clone().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  // 64 bits → 16 chiffres hexadécimaux (4 bits chacun), sans BigInt (cible TS < ES2020).
  let hex = "";
  let nibble = 0;
  for (let k = 0; k < 64; k++) {
    const y = Math.floor(k / 8);
    const x = k % 8;
    nibble = (nibble << 1) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1 : 0);
    if (k % 4 === 3) {
      hex += nibble.toString(16);
      nibble = 0;
    }
  }
  const stats = await base.clone().resize(16, 16, { fit: "fill" }).removeAlpha().stats();
  const [r, g, b] = stats.channels.map((c) => Math.round(c.mean));
  return { sha256: createHash("sha256").update(input).digest("hex"), dhash: hex, rgb: [r, g ?? r, b ?? r] };
}

export function hammingHex(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    let x = parseInt(a[i] ?? "0", 16) ^ parseInt(b[i] ?? "0", 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export const NEAR_DUP_MAX_HAMMING = 4;
export const NEAR_DUP_MAX_COLOR = 6;

/** Paires d'indices (0-based) quasi identiques : dHash proche ET couleur moyenne proche. */
export function nearDuplicatePairs(
  prints: ImagePrint[],
  { maxHamming = NEAR_DUP_MAX_HAMMING, maxColor = NEAR_DUP_MAX_COLOR }: { maxHamming?: number; maxColor?: number } = {}
): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < prints.length; i++) {
    for (let j = i + 1; j < prints.length; j++) {
      if (hammingHex(prints[i].dhash, prints[j].dhash) <= maxHamming && colorDistance(prints[i].rgb, prints[j].rgb) <= maxColor) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

/** Paires de fichiers identiques octet pour octet (doublons certains). */
export function exactDuplicatePairs(prints: Pick<ImagePrint, "sha256">[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < prints.length; i++) {
    for (let j = i + 1; j < prints.length; j++) if (prints[i].sha256 === prints[j].sha256) pairs.push([i, j]);
  }
  return pairs;
}

/** Vignette envoyée à l'IA pour le regroupement : JPEG, grand côté ≤ maxSide (512 par défaut). */
export async function groupingThumbnail(input: Buffer, maxSide = 512): Promise<{ base64: string; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  return { base64: data.toString("base64"), width: info.width, height: info.height };
}

/** Estimation des tokens d'une image (règle Anthropic : largeur × hauteur / 750). */
export function estimateImageTokens(width: number, height: number): number {
  return Math.ceil((width * height) / 750);
}
