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
export function galleryZone(count: number, side: "left" | "right", orientation: "column" | "row"): GalleryZone {
  const n = Math.max(1, Math.min(2, count));
  if (orientation === "column") {
    const photo = 20; // côté d'une photo, % de la largeur
    const w = photo + PAD * 2;
    const h = photo * n + GAP * (n - 1) + PAD * 2;
    // À droite, la colonne commence sous les points forts (coin haut-droit du bandeau de secours).
    return { side, orientation, xPct: side === "left" ? MARGIN : 100 - MARGIN - w, yPct: side === "left" ? 6 : 19, wPct: w, hPct: h, count: n };
  }
  const photo = 16.5;
  const w = photo * n + GAP * (n - 1) + PAD * 2;
  const h = photo + PAD * 2;
  return { side, orientation, xPct: side === "left" ? MARGIN : 100 - MARGIN - w, yPct: 5, wPct: w, hPct: h, count: n };
}

/** Zone prévue pour une nouvelle affiche : colonne, à gauche ou à droite. */
export function pickGalleryZone(count: number, preferredSide?: "left" | "right"): GalleryZone {
  const side = preferredSide ?? (Math.random() < 0.5 ? "left" : "right");
  return galleryZone(count, side, "column");
}

/** Zones essayées dans l'ordre si la zone prévue n'est pas restée libre. */
function candidateZones(primary: GalleryZone): GalleryZone[] {
  const other = primary.side === "left" ? "right" : "left";
  return [
    primary,
    galleryZone(primary.count, other, "column"),
    galleryZone(primary.count, primary.side, "row"),
    galleryZone(primary.count, other, "row"),
  ];
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

// ——— Vérification visuelle avant de poser la galerie ———

const ZONE_COLORS = [
  { key: "red", hex: "#ff2d2d" },
  { key: "blue", hex: "#2d6bff" },
  { key: "green", hex: "#18c44a" },
  { key: "yellow", hex: "#ffd400" },
] as const;

const ZoneCheckSchema = z.object({
  reasoning: z.string(),
  free_zones: z.array(z.enum(["red", "blue", "green", "yellow"])),
});

/**
 * Montre à l'IA l'affiche finie avec les zones candidates en couleur et garde la 1re zone libre
 * (sans texte, bouton, logo ni partie importante du produit). Repli : la zone prévue.
 */
async function chooseFreeZone(poster: Buffer, candidates: GalleryZone[], productName: string): Promise<GalleryZone> {
  try {
    const S = 768;
    const outlines = candidates
      .map((z, i) => {
        const c = ZONE_COLORS[i];
        return `<rect x="${(z.xPct / 100) * S}" y="${(z.yPct / 100) * S}" width="${(z.wPct / 100) * S}" height="${(z.hPct / 100) * S}" fill="none" stroke="${c.hex}" stroke-width="4" stroke-dasharray="${i === 0 ? "0" : "12 6"}"/>`;
      })
      .join("");
    const preview = await sharp(poster)
      .resize(S, S, { fit: "fill" })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${outlines}</svg>`) }])
      .jpeg({ quality: 80 })
      .toBuffer();

    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 300,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: preview.toString("base64") } },
            {
              type: "text",
              text: `Affiche publicitaire terminée pour « ${productName} ». Les rectangles de couleur (${candidates
                .map((_, i) => ZONE_COLORS[i].key)
                .join(", ")}) sont des emplacements possibles pour une carte de photos qu'on va poser par-dessus. Ils ne font pas partie de l'affiche.

Liste dans free_zones les couleurs dont le rectangle ENTIER ne recouvre ni texte (titre, prix, points forts, contact, bouton), ni logo, ni la partie importante du produit principal — seulement du décor. Ordre : du plus élégant au moins élégant pour cette composition. Si aucun n'est libre, liste vide.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ZoneCheckSchema) },
    });
    const free = message.parsed_output?.free_zones ?? [];
    // On garde la zone prévue si elle est libre (les deux passes ont été composées pour elle).
    const idxs = free.map((k) => ZONE_COLORS.findIndex((c) => c.key === k)).filter((i) => i >= 0 && i < candidates.length);
    if (idxs.includes(0)) return candidates[0];
    if (idxs.length > 0) return candidates[idxs[0]];
    return candidates[0];
  } catch {
    return candidates[0];
  }
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
 * Point d'entrée : vérifie que la zone prévue est restée libre (sinon meilleure zone de repli),
 * puis pose la galerie. `verify: false` quand c'est le code qui a fait toute la mise en page
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
  const chosen = opts.verify === false ? z : await chooseFreeZone(posterBuffer, candidateZones(z), opts.productName);
  return composeGallery(posterBuffer, photos, chosen);
}
