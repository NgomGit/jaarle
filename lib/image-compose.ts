import sharp from "sharp";
import { readFileSync } from "fs";
import path from "path";

const JAARLE_LOGO_PATH = path.join(process.cwd(), "public/images/logo-icon.png");
const PREVIEW_SIZE = 640;

/**
 * Fond de secours en dégradé uni — utilisé quand une création "service" sans photo échoue
 * totalement à générer une image (aucune photo d'origine vers laquelle se replier dans ce
 * cas, contrairement au flux produit). Garantit que le bandeau satori a toujours un fond.
 */
export async function buildPlainBackground(accent?: { from: string; to: string } | null): Promise<Buffer> {
  const from = accent?.from ?? "#6D5EF5";
  const to = accent?.to ?? "#3B82F6";
  const svg = Buffer.from(
    `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${from}" />
          <stop offset="1" stop-color="${to}" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#g)" />
    </svg>`
  );
  return sharp(svg).png().toBuffer();
}

/**
 * Petit chip arrondi (fond blanc) contenant un logo marchand, pour le coin bas-droit du
 * bandeau satori — la zone restée libre dans les deux gabarits (bottom-bar et side-panel).
 */
async function buildLogoChip(logoBuffer: Buffer): Promise<Buffer> {
  const chipSize = 76;
  const padding = 10;
  const logoResized = await sharp(logoBuffer)
    .resize(chipSize - padding * 2, chipSize - padding * 2, { fit: "inside" })
    .toBuffer();
  const chipBase = Buffer.from(
    `<svg width="${chipSize}" height="${chipSize}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${chipSize}" height="${chipSize}" rx="14" fill="white" fill-opacity="0.92" />
    </svg>`
  );
  return sharp(chipBase).composite([{ input: logoResized, gravity: "center" }]).png().toBuffer();
}

/**
 * Superpose une image d'overlay (texte/badges rendus via satori, fond transparent), et en
 * option un logo marchand en bas à droite, sur une image de fond — retourne le JPEG final
 * aplati (bien plus léger qu'un PNG pour ce type de visuel photographique, sans perte visible
 * à qualité 90).
 */
export async function compositeOverlay(backgroundBuffer: Buffer, overlayBuffer: Buffer, logoBuffer?: Buffer | null): Promise<Buffer> {
  const layers: { input: Buffer; top: number; left: number }[] = [{ input: overlayBuffer, top: 0, left: 0 }];

  if (logoBuffer) {
    const chip = await buildLogoChip(logoBuffer);
    const chipSize = 76;
    const margin = 24;
    layers.push({ input: chip, left: 1024 - chipSize - margin, top: 1024 - chipSize - margin });
  }

  const background = sharp(backgroundBuffer).resize(1024, 1024, { fit: "cover" });
  return background
    .composite(layers)
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

/**
 * Aperçu protégé pour les créations non débloquées : filigrane Jaarle répété (logo semi-
 * transparent) + résolution réduite. Ne bloque pas la capture d'écran (impossible depuis un
 * site web), mais rend une sauvegarde/capture inutilisable pour une vraie publication.
 */
export async function applyPreviewWatermark(buffer: Buffer): Promise<Buffer> {
  const logoBase64 = readFileSync(JAARLE_LOGO_PATH).toString("base64");
  const tileSize = 130;
  const step = 190;

  const tiles: { input: Buffer; left: number; top: number }[] = [];
  const tileSvg = Buffer.from(
    `<svg width="${tileSize}" height="${tileSize}" xmlns="http://www.w3.org/2000/svg">
      <image href="data:image/png;base64,${logoBase64}" width="${tileSize}" height="${tileSize}" opacity="0.16" />
    </svg>`
  );
  const tileBuffer = await sharp(tileSvg).png().toBuffer();

  for (let y = -60; y < PREVIEW_SIZE; y += step) {
    for (let x = -60; x < PREVIEW_SIZE; x += step) {
      tiles.push({ input: tileBuffer, left: x, top: y });
    }
  }

  return sharp(buffer)
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: "cover" })
    .composite(tiles)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}
