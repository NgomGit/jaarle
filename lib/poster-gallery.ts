import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import sharp, { type OverlayOptions } from "sharp";

// ——— Galerie des photos secondaires (affiches multi-photos, offres payantes) ———
//
// Remplace les anciennes « vignettes collées » (cadre blanc, liseré, inclinaison, position libre
// choisie APRÈS coup) qui donnaient un effet autocollant. Désormais :
//  1. la zone de la galerie est décidée AVANT la génération et donnée en coordonnées précises aux
//     deux passes du modèle d'image (décor puis mise en page) : elles composent AUTOUR d'elle ;
//  2. le code pose une seule carte « verre dépoli » qui reprend le décor flouté sous elle, avec les
//     vraies photos du commerçant alignées sur la grille (marges de l'affiche), sans inclinaison ;
//  3. avant de poser, une vérification visuelle confirme que la zone est restée libre ; sinon on
//     prend la meilleure zone de repli (colonne opposée, rangée en haut).
// Les photos restent toujours les vraies photos, au pixel près : le modèle ne les dessine jamais.

export type GalleryZone = {
  /** Côté de l'affiche où se trouve la galerie. */
  side: "left" | "right";
  /** Colonne (photos empilées) ou rangée (côte à côte). */
  orientation: "column" | "row";
  /** Rectangle de la carte, en % de la largeur (x, w) et de la hauteur (y, h). */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  count: number;
};

const MARGIN = 4; // même marge que le texte des affiches
const PAD = 1.5; // marge intérieure de la carte
const GAP = 1.4; // espace entre deux photos

/** Géométrie d'une galerie de `count` photos (1 ou 2). */
export function galleryZone(count: number, side: "left" | "right", orientation: "column" | "row", photoPct?: number): GalleryZone {
  const n = Math.max(1, Math.min(2, count));
  if (orientation === "column") {
    const photo = photoPct ?? 20; // côté d'une photo, % de la largeur
    const w = photo + PAD * 2;
    const h = photo * n + GAP * (n - 1) + PAD * 2;
    // À droite, la colonne commence sous les points forts (coin haut-droit du bandeau de secours).
    return { side, orientation, xPct: side === "left" ? MARGIN : 100 - MARGIN - w, yPct: side === "left" ? 6 : 19, wPct: w, hPct: h, count: n };
  }
  const photo = photoPct ?? 16.5;
  const w = photo * n + GAP * (n - 1) + PAD * 2;
  const h = photo + PAD * 2;
  return { side, orientation, xPct: side === "left" ? MARGIN : 100 - MARGIN - w, yPct: 5, wPct: w, hPct: h, count: n };
}

/** Zone prévue pour une nouvelle affiche : colonne, à gauche ou à droite. */
export function pickGalleryZone(count: number, preferredSide?: "left" | "right"): GalleryZone {
  const side = preferredSide ?? (Math.random() < 0.5 ? "left" : "right");
  return galleryZone(count, side, "column");
}

function describeZone(z: GalleryZone): string {
  const r = (v: number) => Math.round(v);
  return `the ${z.orientation === "column" ? "vertical" : "horizontal"} area on the ${z.side.toUpperCase()} side spanning x ${r(z.xPct)}%–${r(z.xPct + z.wPct)}% of the width and y ${r(z.yPct)}%–${r(z.yPct + z.hPct)}% of the height (origin top-left)`;
}

/**
 * Passe 1 (décor) : composer une scène de campagne « multi-vues » qui laisse la place exacte de la
 * galerie, en continuité douce du décor (pas un trou, pas un aplat).
 */
export function galleryScenePrompt(zone: GalleryZone): string {
  const photos = zone.count > 1 ? `${zone.count} real detail photos` : "1 real detail photo";
  return `Multi-view campaign layout (premium tier — the merchant supplied several photos, so this poster must look even richer and more editorial than a single-photo poster):
- A frosted-glass gallery card holding ${photos} of the same product will be composited by the application AFTER generation, in ${describeZone(zone)}.
- Treat that gallery as a deliberate part of the composition, like a luxury brand campaign page pairing a hero shot with detail shots: place the hero subject on the ${zone.side === "left" ? "right" : "left"} side / centre so the two read as one balanced layout, and let lines, light and depth lead the eye from the gallery to the hero.
- Inside that area keep ONLY a soft, out-of-focus continuation of the background (gentle light and colour, no objects, no hard edges, no product parts, no text). It must not look like an empty hole or a flat block.
- Do NOT draw the gallery card, frames, thumbnails or any extra copy or view of the product yourself.`;
}

/** Passe 2 (mise en page) : construire la mise en page autour de la galerie, jamais dessus. */
export function galleryLayoutPrompt(zone: GalleryZone): string {
  return `Gallery zone (mandatory): the application will place a frosted-glass card with ${zone.count > 1 ? `${zone.count} real photos` : "1 real photo"} of the product in ${describeZone(zone)}. Design your layout AROUND it as an intentional element of the poster:
- put NO text, tag, button, price, logo or decoration inside that area, and keep it as calm background;
- align your other elements to the same outer margin (${MARGIN}% from the edges) so the card, the tags and the text block share one grid;
- echo its style (soft rounded corners, translucent / glassy surfaces) in your tags or CTA so it feels like the same design system;
- do NOT draw the card, frames or thumbnails yourself, and do not alter the hero product.`;
}

// ——— Emplacement libre : jamais sur le texte ———
// La mise en page (passe 2) place le texte librement et ne respecte pas toujours la zone prévue.
// On repère donc sur l'affiche FINIE tout ce qu'il ne faut pas couvrir (texte, boutons, prix,
// contact, logo, produit principal), puis on cherche par le calcul un emplacement libre : la zone
// prévue d'abord, sinon la position libre la plus proche, en réduisant la carte si besoin.

const OccupiedSchema = z.object({
  elements: z
    .array(
      z.object({
        kind: z.enum(["text", "button", "tag", "price", "contact", "logo", "product"]),
        x0: z.number(),
        y0: z.number(),
        x1: z.number(),
        y1: z.number(),
      })
    )
    .max(30),
});

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Rectangles (en % de l'affiche) à ne jamais couvrir. null si la détection échoue. */
async function detectOccupied(poster: Buffer, productName: string): Promise<Box[] | null> {
  try {
    const preview = await sharp(poster).resize(768, 768, { fit: "fill" }).jpeg({ quality: 82 }).toBuffer();
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: preview.toString("base64") } },
            {
              type: "text",
              text: `Affiche publicitaire terminée pour « ${productName} ». Repère TOUS les éléments qu'il ne faut pas recouvrir : chaque bloc de texte (titre — y compris chaque ligne d'un titre sur plusieurs lignes —, sous-titre, nom de boutique, points forts), boutons, étiquettes, prix, contact / numéro, logo, et le produit principal. Pour chacun, donne son rectangle englobant en pourcentage de l'image : x0, y0 (coin haut-gauche), x1, y1 (coin bas-droit), de 0 à 100. Sois généreux : mieux vaut un rectangle un peu trop grand que trop petit.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(OccupiedSchema) },
    });
    const els = message.parsed_output?.elements;
    if (!els) return null;
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    return els
      .map((e) => ({ x0: clamp(Math.min(e.x0, e.x1)), y0: clamp(Math.min(e.y0, e.y1)), x1: clamp(Math.max(e.x0, e.x1)), y1: clamp(Math.max(e.y0, e.y1)) }))
      .filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
  } catch {
    return null;
  }
}

const SAFETY = 2.5; // marge (en %) autour de chaque élément détecté
const EDGE = 3; // marge minimale avec les bords de l'affiche

function overlaps(z: GalleryZone, boxes: Box[]): boolean {
  return boxes.some(
    (b) => z.xPct < b.x1 + SAFETY && z.xPct + z.wPct > b.x0 - SAFETY && z.yPct < b.y1 + SAFETY && z.yPct + z.hPct > b.y0 - SAFETY
  );
}

/**
 * Zone prévue si elle est libre ; sinon, pour des tailles décroissantes (colonne puis rangée),
 * la position libre la plus proche de la zone prévue. null : aucune place sans couvrir le texte.
 */
function findFreeZone(primary: GalleryZone, boxes: Box[]): GalleryZone | null {
  if (!overlaps(primary, boxes)) return primary;
  const sizes = { column: [20, 17, 14, 12], row: [16.5, 14, 12] } as const;
  for (const orientation of ["column", "row"] as const) {
    for (const photo of sizes[orientation]) {
      const base = galleryZone(primary.count, primary.side, orientation, photo);
      let best: GalleryZone | null = null;
      let bestDist = Infinity;
      for (let y = EDGE; y + base.hPct <= 100 - EDGE; y += 1) {
        for (let x = EDGE; x + base.wPct <= 100 - EDGE; x += 1) {
          const cand: GalleryZone = { ...base, xPct: x, yPct: y, side: x + base.wPct / 2 < 50 ? "left" : "right" };
          if (overlaps(cand, boxes)) continue;
          const dist = Math.hypot(x - primary.xPct, y - primary.yPct);
          if (dist < bestDist) {
            bestDist = dist;
            best = cand;
          }
        }
      }
      if (best) return best;
    }
  }
  return null;
}

// ——— Rendu de la carte ———

function roundedRectSvg(w: number, h: number, r: number, fill = "#fff"): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/></svg>`);
}

/**
 * Pose la carte galerie dans `zone` : décor flouté sous la carte (verre dépoli clair ou sombre
 * selon la luminosité du décor), fin liseré, ombre douce, vraies photos à coins arrondis.
 */
export async function composeGallery(posterBuffer: Buffer, photos: Buffer[], zone: GalleryZone): Promise<Buffer> {
  const list = photos.slice(0, zone.count);
  if (list.length === 0) return posterBuffer;
  const meta = await sharp(posterBuffer).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? W;
  const px = (pct: number) => Math.round((pct / 100) * W);

  const left = px(zone.xPct);
  const top = Math.round((zone.yPct / 100) * H);
  const cw = Math.min(px(zone.wPct), W - left);
  const ch = Math.min(Math.round((zone.hPct / 100) * H), H - top);
  const radius = px(2.2);
  const pad = px(PAD);
  const gap = px(GAP);
  const photoSize = zone.orientation === "column" ? cw - pad * 2 : ch - pad * 2;
  const photoRadius = px(1.4);

  // Verre dépoli : le décor sous la carte, flouté, éclairci ou assombri selon sa luminosité.
  const region = sharp(posterBuffer).extract({ left, top, width: cw, height: ch });
  const stats = await region.clone().stats();
  const lum = (0.2126 * stats.channels[0].mean + 0.7152 * stats.channels[1].mean + 0.0722 * stats.channels[2].mean) / 255;
  const light = lum > 0.55;
  const tint = light ? "rgba(255,255,255,0.32)" : "rgba(12,12,16,0.34)";
  const glass = await region
    .blur(Math.max(8, Math.round(W / 45)))
    .modulate({ saturation: 1.15 })
    .composite([
      { input: roundedRectSvg(cw, ch, 0, tint) },
      { input: roundedRectSvg(cw, ch, radius), blend: "dest-in" },
    ])
    .png()
    .toBuffer();

  // Ombre douce sous la carte (calque plein format : jamais hors de l'image).
  const sh = Math.round(W / 40);
  const shadow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sh * 0.8}"/></filter></defs><rect x="${left}" y="${top + Math.round(sh * 0.6)}" width="${cw}" height="${ch}" rx="${radius}" ry="${radius}" fill="#000" fill-opacity="${light ? 0.18 : 0.38}" filter="url(#b)"/></svg>`
  );

  // Fin liseré (lumière sur l'arête du verre).
  const stroke = Math.max(1, Math.round(W / 700));
  const border = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><rect x="${stroke / 2}" y="${stroke / 2}" width="${cw - stroke}" height="${ch - stroke}" rx="${radius}" ry="${radius}" fill="none" stroke="#fff" stroke-opacity="${light ? 0.75 : 0.35}" stroke-width="${stroke}"/></svg>`
  );

  const layers: OverlayOptions[] = [
    { input: shadow, left: 0, top: 0 },
    { input: glass, left, top },
    { input: border, left, top },
  ];

  for (let i = 0; i < list.length; i++) {
    let photo: Buffer;
    try {
      photo = await sharp(list[i])
        .rotate()
        .resize(photoSize, photoSize, { fit: "cover", position: "attention" })
        .composite([
          { input: roundedRectSvg(photoSize, photoSize, photoRadius), blend: "dest-in" },
          {
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${photoSize}" height="${photoSize}"><rect x="0.5" y="0.5" width="${photoSize - 1}" height="${photoSize - 1}" rx="${photoRadius}" ry="${photoRadius}" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="1"/></svg>`
            ),
          },
        ])
        .png()
        .toBuffer();
    } catch {
      continue;
    }
    const offset = i * (photoSize + gap);
    layers.push(
      zone.orientation === "column"
        ? { input: photo, left: left + pad, top: top + pad + offset }
        : { input: photo, left: left + pad + offset, top: top + pad }
    );
  }

  return sharp(posterBuffer).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Point d'entrée : repère le texte de l'affiche finie, pose la galerie dans la zone prévue si elle
 * est libre, sinon à la place libre la plus proche (carte réduite si besoin), jamais sur le texte. `verify: false` quand c'est le code qui a fait toute la mise en page
 * (chemin artisan) et que la zone est donc garantie libre.
 */
export async function placeGallery(
  posterBuffer: Buffer,
  photos: Buffer[],
  zone: GalleryZone,
  opts: { productName: string; verify?: boolean }
): Promise<Buffer> {
  if (photos.length === 0) return posterBuffer;
  const z = zone.count === Math.min(2, photos.length) ? zone : galleryZone(photos.length, zone.side, zone.orientation);
  if (opts.verify === false) return composeGallery(posterBuffer, photos, z);
  const boxes = await detectOccupied(posterBuffer, opts.productName);
  if (!boxes) return composeGallery(posterBuffer, photos, z); // détection en échec : zone prévue
  const chosen = findFreeZone(z, boxes);
  if (!chosen) {
    // Aucune place sans couvrir le texte : on n'ajoute pas la galerie plutôt que de masquer une info.
    console.info(`[poster] galerie non posée : aucune place libre (${boxes.length} éléments détectés)`);
    return posterBuffer;
  }
  return composeGallery(posterBuffer, photos, chosen);
}
