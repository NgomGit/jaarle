import { ImageResponse } from "next/og";
import sharp from "sharp";
import { BODY_FACES_FOR_FIT, TYPE_PAIR_DEFS, fontsForRender, loadMetrics } from "@/lib/poster-v2/fonts";
import { fitSingleLine, fitTitle, textWidth } from "@/lib/poster-v2/text-fit";
import { accentOn, contrast, luminance, mix, readableOn, rgba, rgbToHex, veilAlphaFor, type Rgb } from "@/lib/poster-v2/color";
import { brightTone, coverScene, dataUri, logoDataUri, smartCrop, isUpscaleAcceptable } from "@/lib/poster-v2/photos";
import { formatPhone, formatPrice, DEFAULT_CTA } from "@/lib/poster-v2/format";
import { LAYOUTS } from "@/lib/poster-v2/layouts";
import { sceneFocus } from "@/lib/poster-v2/overlays";
import { VARIANT_DEFS, type Prepared, type VariantDef } from "@/lib/poster-v2/render/variants";
import type { Pal } from "@/lib/poster-v2/render/primitives";
import { LayoutUnfitError, type Palette, type PctRect, type RenderInput, type RenderResult } from "@/lib/poster-v2/types";

// Renderer déterministe V2 : la scène (produit principal intégré par l'IA) + les vraies photos
// secondaires + tout le texte commercial, composés par le code sur une base 1080 × 1080.
// Rien n'est positionné par l'IA. Si le contenu ne tient pas proprement dans la mise en page
// (titre trop long, photo trop petite pour sa case), on lève LayoutUnfitError : l'appelant essaie
// la variante suivante, puis revient au pipeline 1 photo (V1). La qualité prime sur la variété.

const BASE = 1080;
/** Au-delà de cet agrandissement, la photo secondaire serait visiblement floue : variante refusée. */
const MAX_UPSCALE_HARD = 2.2;
/** Voile minimal sous un texte posé sur la scène (lisibilité + rendu « premium »). */
const MIN_TEXT_VEIL = 0.5;
/** Contraste visé pour l'accent (mot mis en valeur, surtitre, devise) sur la scène voilée. */
const ACCENT_TARGET = 4.5;

/** Palette complète (couleurs de texte calculées pour garantir le contraste). */
export function buildPal(p: Palette): Pal {
  // On force un vrai sombre et un vrai clair, quoi que propose le directeur artistique.
  const dark = luminance(p.dark) > 0.18 ? "#141414" : p.dark;
  const light = luminance(p.light) < 0.6 ? "#F6F3EE" : p.light;
  const textOnDark = readableOn(dark, "#FFFFFF", "#111111");
  const textOnLight = readableOn(light, "#FFFFFF", "#141414");
  const muted = p.muted;
  return {
    dark,
    light,
    accent: p.accent,
    muted,
    onAccent: readableOn(p.accent, "#FFFFFF", "#141414"),
    accentOnDark: accentOn(p.accent, dark, 3),
    accentOnLight: accentOn(p.accent, light, 3),
    textOnDark,
    textOnLight,
    subOnDark: rgba(textOnDark, 0.78),
    subOnLight: contrast(muted, light) >= 4.5 ? muted : rgba(textOnLight, 0.72),
  };
}

/** Points forts gardés : chacun doit tenir sur une ligne à la taille prévue (sinon il est écarté). */
async function fitBenefits(items: string[], def: VariantDef["benefits"]): Promise<string[]> {
  if (def.max <= 0) return [];
  const clean = items.map((b) => b.trim()).filter(Boolean);
  const face = BODY_FACES_FOR_FIT.semibold;
  const kept: string[] = [];
  for (const b of clean) {
    if (kept.length >= def.max) break;
    const single = await fitSingleLine(b, face, def.mode === "chips" ? def.width - 40 : def.width, def.size, def.size);
    if (single == null) continue;
    if (def.mode === "line") {
      const joined = [...kept, b].join("  ·  ");
      if ((await fitSingleLine(joined, face, def.width, def.size, def.size)) == null) continue;
    }
    if (def.mode === "chips") {
      // Puces : largeur cumulée (texte + 36 px de marge + 10 px d'écart) sur une ligne.
      const widths = await Promise.all([...kept, b].map(async (t) => (await textPx(t, def.size)) + 46));
      if (widths.reduce((s, w) => s + w, 0) > def.width) continue;
    }
    kept.push(b);
  }
  return kept;
}

async function textPx(text: string, size: number): Promise<number> {
  return textWidth(await loadMetrics(BODY_FACES_FOR_FIT.semibold), text, size);
}

/** Légende courte : au plus 3 mots / 22 caractères (sinon on la retire plutôt que la couper). */
function cleanCaption(c: string): string {
  const t = c.trim().replace(/\s+/g, " ");
  if (!t || t.length > 22 || t.split(" ").length > 3) return "";
  return t;
}

export interface PrepareResult {
  prepared: Prepared;
  def: VariantDef;
  crops: { index: number; rect: PctRect }[];
  warnings: string[];
}

/** Prépare tout ce qui est mesurable AVANT le rendu (et lève LayoutUnfitError si ça ne tient pas). */
export async function preparePoster(input: RenderInput): Promise<PrepareResult> {
  const spec = LAYOUTS[input.layout];
  const def = VARIANT_DEFS[input.layout];
  if (!spec || !def) throw new LayoutUnfitError(input.layout, "mise en page inconnue");
  const warnings: string[] = [];
  const pair = TYPE_PAIR_DEFS[input.typePair];

  if (input.secondaries.length < spec.secondaryCount) {
    throw new LayoutUnfitError(input.layout, `${spec.secondaryCount} photo(s) secondaire(s) requise(s), ${input.secondaries.length} fournie(s)`);
  }
  const secondaries = input.secondaries.slice(0, spec.secondaryCount);

  // 1. Titre : ajusté aux vraies métriques ; s'il ne tient pas, la variante est refusée.
  const title = await fitTitle({ title: input.content.title, accent: input.content.titleAccent, pair, ...def.titleBox });
  if (!title) throw new LayoutUnfitError(input.layout, "le titre ne tient pas dans la zone prévue");
  if (title.size < Math.round(def.titleBox.maxSize * pair.sizeFactor * 0.7)) warnings.push(`titre réduit à ${title.size}px`);

  // 2. Scène recadrée dans son cadre (centrée sur la zone du produit principal).
  const frame = spec.scene.frame;
  const scene = await coverScene(input.scene, frame.w, frame.h, sceneFocus(spec));

  // 3. Vraies photos secondaires, recadrées sur leur zone utile au format exact de leur case.
  const photos: string[] = [];
  const crops: { index: number; rect: PctRect }[] = [];
  for (let i = 0; i < secondaries.length; i++) {
    const slot = spec.slots[i];
    const c = await smartCrop(secondaries[i].image, slot.w, slot.h, secondaries[i].focus);
    if (c.upscale > MAX_UPSCALE_HARD) throw new LayoutUnfitError(input.layout, `photo ${i + 1} trop petite pour sa case (×${c.upscale.toFixed(2)})`);
    if (!isUpscaleAcceptable(c.upscale)) warnings.push(`photo ${i + 1} agrandie ×${c.upscale.toFixed(2)}`);
    photos.push(dataUri(c.image));
    crops.push({ index: i, rect: round(c.rect) });
  }

  // 4. Palette + voile calculé sur les pixels réels sous le texte posé sur la scène.
  const pal = buildPal(input.palette);
  let veil = 0.6;
  if (def.textOverScene) {
    const t = def.textOverScene;
    const under = await tileColors(scene, { left: t.x - frame.x, top: t.y - frame.y, width: t.w, height: t.h });
    // Voile : le texte principal doit atteindre 4,5:1 sur CHAQUE zone sous le texte. L'accent n'entre
    // en compte que s'il est clair (un accent sombre ne gagne rien à un voile plus sombre).
    veil = Math.max(...under.map((u) => veilAlphaFor(u, pal.dark, pal.textOnDark, 4.5, MIN_TEXT_VEIL)));
    if (contrast(pal.accentOnDark, pal.dark) >= 4) veil = Math.max(veil, ...under.map((u) => veilAlphaFor(u, pal.dark, pal.accentOnDark, 3)));
    // Puis l'accent est éclairci (même teinte) jusqu'à 3:1 sur chaque zone voilée.
    const effective = under.map((u) => rgbToHex(mix(u, pal.dark, veil)));
    let accent = pal.accentOnDark;
    for (let k = 0; k < 4 && effective.some((e) => contrast(accent, e) < ACCENT_TARGET); k++) {
      for (const e of effective) accent = accentOn(accent, e, ACCENT_TARGET);
    }
    pal.accentOnDark = accent;
  }

  // 5. Contenu commercial exact.
  // Un point fort déjà dit par la légende d'une photo n'est pas répété.
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const captionKeys = new Set(secondaries.map((s) => norm(cleanCaption(s.caption))).filter(Boolean));
  const benefits = await fitBenefits((input.content.benefits ?? []).filter((b) => !captionKeys.has(norm(b))), def.benefits);
  if ((input.content.benefits?.length ?? 0) > benefits.length && def.benefits.max > 0) {
    warnings.push(`${(input.content.benefits?.length ?? 0) - benefits.length} point(s) fort(s) non affiché(s)`);
  }
  const phone = formatPhone(input.content.phone);
  if (!phone) throw new LayoutUnfitError(input.layout, "numéro de contact manquant");
  const logo = input.content.logo ? await logoDataUri(input.content.logo, 200, 64) : null;
  const kicker = input.content.kicker?.trim() ? input.content.kicker.trim().slice(0, 32) : null;

  const prepared: Prepared = {
    pair,
    pal,
    title,
    kicker,
    benefits,
    price: formatPrice(input.content.price),
    phone,
    cta: input.content.ctaLabel?.trim() || DEFAULT_CTA,
    logo,
    businessName: input.content.businessName?.trim() || null,
    sceneUri: dataUri(scene),
    photos,
    captions: secondaries.map((s) => cleanCaption(s.caption)),
    veil,
  };
  return { prepared, def, crops, warnings };
}

/** Tons clairs de chaque tuile (8 × 4) d'une zone : une moyenne large masque les zones claires. */
async function tileColors(img: Buffer, r: { left: number; top: number; width: number; height: number }): Promise<Rgb[]> {
  const cols = 8;
  const rows = 4;
  const out: Rgb[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      out.push(await brightTone(img, { left: r.left + (r.width / cols) * i, top: r.top + (r.height / rows) * j, width: r.width / cols, height: r.height / rows }));
    }
  }
  return out;
}

function round(r: PctRect): PctRect {
  const q = (v: number) => Math.round(v * 10) / 10;
  return { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) };
}

/** Rendu final : JPEG carré (1080 par défaut). */
export async function renderPosterV2(input: RenderInput): Promise<RenderResult> {
  const { prepared, def, crops, warnings } = await preparePoster(input);
  const fonts = await fontsForRender(prepared.pair);
  const res = new ImageResponse(def.render(prepared), { width: BASE, height: BASE, fonts });
  const png = Buffer.from(await res.arrayBuffer());
  const size = input.size ?? BASE;
  let pipe = sharp(png);
  if (size !== BASE) pipe = pipe.resize(size, size, { kernel: "lanczos3" });
  const image = await pipe.jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  return { image, crops, warnings };
}
