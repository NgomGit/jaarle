import type opentype from "opentype.js";
import { loadMetrics, type FontFace, type TypePair } from "@/lib/poster-v2/fonts";

// Ajustement du texte par le code : on mesure avec les vraies métriques des polices, puis on
// choisit la plus grande taille qui tient dans la zone (largeur ET nombre de lignes). Si même la
// taille minimale ne tient pas, la mise en page est déclarée inadaptée (l'appelant en essaie une
// autre) : un titre n'est jamais coupé ni débordant.

export interface TitleToken {
  text: string;
  accent: boolean;
}

export interface FittedTitle {
  size: number;
  lines: TitleToken[][];
  /** Hauteur occupée (lignes × interligne). */
  height: number;
}

/** Largeur d'un texte en px pour une police et une taille données. */
export function textWidth(font: opentype.Font, text: string, size: number, letterSpacingEm = 0): number {
  const base = font.getAdvanceWidth(text, size, { kerning: true });
  return base + Math.max(0, [...text].length - 1) * letterSpacingEm * size;
}

/** Découpe le titre en mots ; marque ceux qui appartiennent au groupe mis en valeur. */
export function tokenizeTitle(title: string, accent?: string | null): TitleToken[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const tokens = words.map((text) => ({ text, accent: false }));
  if (!accent) return tokens;
  const target = accent.trim().split(/\s+/).map((w) => w.toLocaleLowerCase("fr"));
  if (target.length === 0) return tokens;
  const norm = (w: string) => w.toLocaleLowerCase("fr").replace(/[.,;:!?]+$/, "");
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((t, j) => norm(words[i + j]) === t)) {
      for (let j = 0; j < target.length; j++) tokens[i + j].accent = true;
      break; // une seule occurrence mise en valeur
    }
  }
  return tokens;
}

/** Répartit les mots en lignes (glouton) ; null si un mot seul dépasse la largeur. */
function wrap(
  tokens: TitleToken[],
  widths: number[],
  spaceWidth: number,
  maxWidth: number
): TitleToken[][] | null {
  const lines: TitleToken[][] = [];
  let line: TitleToken[] = [];
  let lineWidth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = widths[i];
    if (w > maxWidth) return null;
    const next = line.length === 0 ? w : lineWidth + spaceWidth + w;
    if (next <= maxWidth) {
      line.push(tokens[i]);
      lineWidth = next;
    } else {
      lines.push(line);
      line = [tokens[i]];
      lineWidth = w;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

export interface FitTitleOptions {
  title: string;
  accent?: string | null;
  pair: TypePair;
  maxWidth: number;
  maxLines: number;
  /** Taille de départ (avant facteur de la paire). */
  maxSize: number;
  /** Taille minimale acceptable (avant facteur). */
  minSize: number;
  /** Hauteur maximale optionnelle. */
  maxHeight?: number;
}

export async function fitTitle(opts: FitTitleOptions): Promise<FittedTitle | null> {
  const { pair } = opts;
  const display = await loadMetrics(pair.display);
  const accentFont = pair.accent ? await loadMetrics(pair.accent) : display;
  const title = pair.uppercase ? opts.title.toLocaleUpperCase("fr") : opts.title;
  const tokens = tokenizeTitle(title, opts.accent ? (pair.uppercase ? opts.accent.toLocaleUpperCase("fr") : opts.accent) : null);
  const maxSize = Math.round(opts.maxSize * pair.sizeFactor);
  const minSize = Math.round(opts.minSize * pair.sizeFactor);
  for (let size = maxSize; size >= minSize; size -= 2) {
    const widths = tokens.map((t) => textWidth(t.accent ? accentFont : display, t.text, size, pair.letterSpacing));
    const spaceWidth = textWidth(display, " ", size);
    const lines = wrap(tokens, widths, spaceWidth, opts.maxWidth);
    if (!lines || lines.length > opts.maxLines) continue;
    const height = lines.length * size * pair.lineHeight;
    if (opts.maxHeight && height > opts.maxHeight) continue;
    return { size, lines, height };
  }
  return null;
}

/** Plus grande taille (≤ maxSize) pour laquelle un texte tient sur une ligne ; null si < minSize. */
export async function fitSingleLine(
  text: string,
  face: FontFace,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  letterSpacingEm = 0
): Promise<number | null> {
  const font = await loadMetrics(face);
  for (let size = maxSize; size >= minSize; size -= 1) {
    if (textWidth(font, text, size, letterSpacingEm) <= maxWidth) return size;
  }
  return null;
}
