import { readFile } from "node:fs/promises";
import { join } from "node:path";
import opentype from "opentype.js";
import type { TypePairKey } from "@/lib/poster-v2/types";

// Polices du renderer V2 (toutes sous licence OFL, fichiers WOFF dans public/fonts/poster — satori
// ne lit pas le woff2). Chargées une seule fois par processus. Les mêmes fichiers servent à MESURER
// le texte (opentype.js) : le titre est ajusté par le code avant le rendu, jamais coupé.

export type FontFace = { family: string; file: string; weight: 400 | 500 | 600 | 700 | 800; style: "normal" | "italic" };

const BODY_FACES: FontFace[] = [
  { family: "Manrope", file: "manrope-latin-500-normal.woff", weight: 500, style: "normal" },
  { family: "Manrope", file: "manrope-latin-600-normal.woff", weight: 600, style: "normal" },
  { family: "Manrope", file: "manrope-latin-700-normal.woff", weight: 700, style: "normal" },
  { family: "Manrope", file: "manrope-latin-800-normal.woff", weight: 800, style: "normal" },
];

export interface TypePair {
  key: TypePairKey;
  label: string;
  display: FontFace;
  /** Variante italique pour le mot mis en valeur (sinon : même police, couleur d'accent). */
  accent: FontFace | null;
  uppercase: boolean;
  /** Interlettrage du titre, en em. */
  letterSpacing: number;
  lineHeight: number;
  /** Le prix utilise la police de titre (sinon Manrope 800 : chiffres alignés). */
  priceInDisplay: boolean;
  /** Ratio de taille du titre par rapport à la référence (polices étroites → plus grandes). */
  sizeFactor: number;
}

export const TYPE_PAIR_DEFS: Record<TypePairKey, TypePair> = {
  T1: {
    key: "T1",
    label: "Éditorial luxe",
    display: { family: "Cormorant", file: "cormorant-garamond-latin-600-normal.woff", weight: 600, style: "normal" },
    accent: { family: "Cormorant", file: "cormorant-garamond-latin-500-italic.woff", weight: 500, style: "italic" },
    uppercase: false,
    letterSpacing: 0,
    lineHeight: 0.95,
    // Cormorant a des chiffres « elzéviriens » : prix en Manrope pour la lisibilité.
    priceInDisplay: false,
    sizeFactor: 1.12,
  },
  T2: {
    key: "T2",
    label: "Affirmé",
    display: { family: "Anton", file: "anton-latin-400-normal.woff", weight: 400, style: "normal" },
    accent: null,
    uppercase: true,
    letterSpacing: 0.01,
    lineHeight: 0.98,
    priceInDisplay: true,
    sizeFactor: 1.05,
  },
  T3: {
    key: "T3",
    label: "Moderne premium",
    display: { family: "Syne", file: "syne-latin-800-normal.woff", weight: 800, style: "normal" },
    accent: null,
    uppercase: false,
    letterSpacing: 0,
    lineHeight: 1,
    priceInDisplay: true,
    sizeFactor: 0.92,
  },
  T4: {
    key: "T4",
    label: "Chaleureux",
    display: { family: "Fraunces", file: "fraunces-latin-600-normal.woff", weight: 600, style: "normal" },
    accent: { family: "Fraunces", file: "fraunces-latin-500-italic.woff", weight: 500, style: "italic" },
    uppercase: false,
    letterSpacing: 0,
    lineHeight: 1,
    priceInDisplay: true,
    sizeFactor: 1,
  },
  T5: {
    key: "T5",
    label: "Précis",
    display: { family: "Archivo", file: "archivo-latin-800-normal.woff", weight: 800, style: "normal" },
    accent: null,
    uppercase: false,
    letterSpacing: -0.02,
    lineHeight: 0.98,
    priceInDisplay: true,
    sizeFactor: 0.95,
  },
};

const FONT_DIR = () => join(process.cwd(), "public/fonts/poster");

const bufferCache = new Map<string, Promise<Buffer>>();
function loadBuffer(file: string): Promise<Buffer> {
  let p = bufferCache.get(file);
  if (!p) {
    p = readFile(join(FONT_DIR(), file));
    p.catch(() => bufferCache.delete(file));
    bufferCache.set(file, p);
  }
  return p;
}

const parsedCache = new Map<string, Promise<opentype.Font>>();
/** Police analysée (pour la mesure du texte). */
export function loadMetrics(face: FontFace): Promise<opentype.Font> {
  let p = parsedCache.get(face.file);
  if (!p) {
    p = loadBuffer(face.file).then((b) => opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    p.catch(() => parsedCache.delete(face.file));
    parsedCache.set(face.file, p);
  }
  return p;
}

/** Polices à fournir au rendu (next/og) pour une paire donnée. */
export async function fontsForRender(pair: TypePair) {
  const faces = [...BODY_FACES, pair.display, ...(pair.accent ? [pair.accent] : [])];
  return Promise.all(
    faces.map(async (f) => ({ name: f.family, data: await loadBuffer(f.file), weight: f.weight, style: f.style }))
  );
}

export const BODY_FAMILY = "Manrope";
export const BODY_FACE_800: FontFace = BODY_FACES[3];
export const BODY_FACE_700: FontFace = BODY_FACES[2];
/** Graisses de Manrope utilisées pour mesurer les textes courts (points forts, légendes). */
export const BODY_FACES_FOR_FIT = { semibold: BODY_FACES[1], bold: BODY_FACES[2], extrabold: BODY_FACES[3] } as const;
