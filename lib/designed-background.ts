// ============================================================================
// designed-background.ts — Décor "designé" (motifs africains) rendu par sharp,
// SANS appel IA. Alternative rapide/gratuite à generateComposedPoster() du
// pipeline actuel, pour les produits nets (mode, sacs, chaussures, cosmétique).
//
// Testé : sharp rasterise et composite ces SVG sans problème (même moteur que
// lib/image-compose.ts). Le produit est ensuite détouré via removeBackground()
// (remove.bg, déjà en place) puis composité par-dessus le décor.
// ============================================================================

import sharp, { type OverlayOptions } from "sharp";
import { bogolan, kenteBand, adinkraScatter, sunburst, adinkra } from "./knowledge/motifs";
import type { ArtDirection } from "./art-directions";

const SIZE = 1080;

function gradientSvg(w: number, h: number, bg: string | [string, string]): string {
  if (Array.isArray(bg)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/></svg>`;
}

const raster = (svg: string, w?: number, h?: number) => {
  let s = sharp(Buffer.from(svg));
  if (w) s = s.resize(w, h ?? null);
  return s.png().toBuffer();
};

/**
 * Construit le buffer de FOND décoré selon la direction artistique choisie.
 * (Le texte prix/contact est ajouté ensuite par l'overlay satori — cf. pipeline.)
 */
export async function buildDesignedBackground(dir: ArtDirection, w = SIZE, h = SIZE): Promise<Buffer> {
  const p = dir.palette;
  const layers: OverlayOptions[] = [];

  // Fond de base
  const base = await raster(gradientSvg(w, h, p.bg));

  switch (dir.motif) {
    case "bogolan": {
      const bogo = await raster(bogolan(w, h, { bg: Array.isArray(p.bg) ? p.bg[1] : p.bg, mark: p.motif }));
      layers.push({ input: bogo, top: 0, left: 0, blend: "over" });
      // vignette pour dégager le sujet
      const vig = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="v" cx="42%" cy="46%" r="62%"><stop offset="55%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(12,9,5,0.9)"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#v)"/></svg>`;
      layers.push({ input: await raster(vig), top: 0, left: 0 });
      // médaillon adinkrahene en filigrane
      const glyph = await raster(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="620" height="620">${adinkra("adinkrahene", p.accent, 4)}</svg>`);
      layers.push({ input: glyph, top: 70, left: w - 500 });
      break;
    }
    case "kente-adinkra": {
      const scatter = await raster(adinkraScatter(w, h, { color: p.motif, opacity: 0.07, step: 165, size: 72 }));
      layers.push({ input: scatter, top: 0, left: 0 });
      const band = await raster(kenteBand(w, 118, { palette: p.kente }));
      layers.push({ input: band, top: 0, left: 0 });
      layers.push({ input: await raster(kenteBand(w, 26, { palette: p.kente })), top: h - 26, left: 0 });
      break;
    }
    case "adinkra-sun": {
      const scatter = await raster(adinkraScatter(w, h, { color: p.motif, opacity: 0.1, step: 150 }));
      layers.push({ input: scatter, top: 0, left: 0 });
      const sun = await raster(sunburst({ R: 460, stroke: p.accent, op: 0.35 }));
      layers.push({ input: sun, top: -120, left: w - 620 });
      break;
    }
    case "wax-sun": {
      const sun = await raster(sunburst({ R: 410, stroke: p.motif, op: 0.4 }));
      layers.push({ input: sun, top: -140, left: w - 630 });
      break;
    }
    case "none":
    default:
      break;
  }

  return sharp(base).composite(layers).png().toBuffer();
}

/**
 * Composite le produit détouré sur le décor. `cutoutBuffer` provient de
 * removeBackground() (remove.bg) déjà utilisé dans le pipeline.
 */
export async function placeProduct(
  backgroundBuffer: Buffer,
  cutoutBuffer: Buffer,
  opts: { width?: number; top?: number; left?: number } = {}
): Promise<Buffer> {
  const { width = 720, top = 200, left = 40 } = opts;
  const prod = await sharp(cutoutBuffer).resize(width, null).png().toBuffer();
  return sharp(backgroundBuffer).composite([{ input: prod, top, left }]).png().toBuffer();
}
