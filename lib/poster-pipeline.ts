import { compositeOverlay, finalizeJpeg, buildPlainBackground } from "@/lib/image-compose";
import { removeBackground } from "@/lib/background-removal";
import { analyzeProduct, analyzeLogoColors, planThumbnailPlacement, type ProductAnalysis } from "@/lib/product-analyzer";
import { checkMultiReferenceFidelity, checkPosterQuality, checkTextAccuracy } from "@/lib/quality-checker";
import type { MultiReferenceContext } from "@/lib/multi-reference";
import { getIndustry, type Industry } from "@/lib/knowledge/industries";
import { pickHeritageCue } from "@/lib/knowledge/senegal-heritage";
import { getRelevantEvents } from "@/lib/knowledge/events";
import {
  buildCreativeBrief,
  formatCreativeBrief,
  pickTypographyMood,
  formatLightingInstruction,
  CREATIVE_DIRECTOR_OPENING,
  CONCEPT_FIRST_INSTRUCTION,
  CREATIVITY_RULES,
  DESIGN_PRINCIPLES,
  VISUAL_SURPRISE_RULE,
  ASYMMETRY_RULE,
  COLOR_HIERARCHY_INSTRUCTION,
  SELF_CRITIQUE_INSTRUCTION,
  LAYOUT_FREEDOM_INSTRUCTION,
  type CreativeBrief,
} from "@/lib/knowledge/creative-vocabulary";
import { ALLOWED_MEDIA_TYPES, type AllowedMediaType } from "@/lib/media-types";
import { pickArtDirection, artDirectionFromAnalysis } from "@/lib/art-directions";
import { buildDesignedBackground, placeProduct } from "@/lib/designed-background";
import sharp, { type OverlayOptions } from "sharp";

export { ALLOWED_MEDIA_TYPES, type AllowedMediaType };

// GPT Image 2 pour les deux paliers restants (Standard/Advanced) — coût réel mesuré via le champ
// `usage.cost` renvoyé par OpenRouter : ~$0.065-0.073/appel selon le nombre de références.
const IMAGE_MODEL = "openai/gpt-image-2";

/**
 * Palette de secours par secteur, utilisée dès qu'aucune couleur d'accent plus spécifique
 * n'est disponible (analyse produit en échec, ou création "service" sans photo). Évite de
 * retomber systématiquement sur la même teinte neutre/beige — chaque secteur a sa propre
 * identité chromatique, cohérente avec son ambiance (visualDirection/toneHint).
 */
const INDUSTRY_ACCENTS: Record<string, { from: string; to: string }> = {
  fashion: { from: "#C2185B", to: "#6D28D9" },
  beauty: { from: "#DB2777", to: "#D97706" },
  restaurant: { from: "#DC2626", to: "#EA580C" },
  poissonnerie: { from: "#2E8FB8", to: "#0A2740" },
  agriculture: { from: "#4B9B3A", to: "#7A5A22" },
  services: { from: "#2563EB", to: "#EA580C" },
  electronics: { from: "#1E3A8A", to: "#0891B2" },
  furniture: { from: "#92400E", to: "#166534" },
  "real-estate": { from: "#1E3A5F", to: "#B45309" },
  automotive: { from: "#7F1D1D", to: "#1F2937" },
  grocery: { from: "#15803D", to: "#65A30D" },
  pharmacy: { from: "#0F766E", to: "#1D4ED8" },
  events: { from: "#7C3AED", to: "#B45309" },
  artisanat: { from: "#B45309", to: "#1E3A5F" },
  hotel: { from: "#0E7490", to: "#2563EB" },
  travel: { from: "#0D9488", to: "#EA580C" },
};

function getIndustryAccent(industryKey: string | null): { from: string; to: string } {
  return (industryKey && INDUSTRY_ACCENTS[industryKey]) || { from: "#6D5EF5", to: "#3B82F6" };
}

export type LayoutVariant = "bottom-bar" | "side-panel";

/**
 * Bascule le gabarit du bandeau de texte pour éviter que toutes les affiches se ressemblent.
 */
function pickLayoutVariant(): LayoutVariant {
  return Math.random() < 0.5 ? "bottom-bar" : "side-panel";
}

/**
 * Pistes d'accroche de la catégorie, sans les promesses commerciales (livraison, paiement,
 * garantie…) : le commerçant ne les a pas forcément, elles ne doivent jamais être imposées.
 */
function getIndustryInspiration(industryKey: string | null): string[] {
  const industry = getIndustry(industryKey ?? undefined);
  if (!industry) return [];
  return industry.ctaExamples.filter((c) => !/livraison|paiement|payer|garanti|wave|orange money/i.test(c));
}

/**
 * Note saisonnière courte, dérivée des mêmes événements que le texte de vente. Pour les
 * événements religieux sobres (Magal, Gamou), on ne suggère jamais un traitement festif.
 */
function getSeasonalVisualNote(referenceDate: Date): string | null {
  const [event] = getRelevantEvents(referenceDate, 1);
  if (!event) return null;
  if (event.avoid) {
    return `This period corresponds to ${event.name} in Senegal — keep the visual respectful and understated, avoid festive or commercial embellishment.`;
  }
  return `This period corresponds to ${event.name} in Senegal — you may subtly echo this mood with tones like ${event.colors.join(", ")} if it fits naturally, without forcing it.`;
}

/**
 * Le rendu de texte (render-overlay) place des éléments à des positions fixes selon le palier
 * ET le gabarit choisi. On le dit à l'IA pour qu'elle laisse ces zones visuellement calmes
 * plutôt que de les remplir.
 */
function getNegativeSpaceInstruction(layout: LayoutVariant, thumbCount = 0): string {
  const base =
    layout === "side-panel"
      ? "Composition constraint: keep the left third of the frame visually calm and uncluttered — a dark text panel with the name, price and contact will be added there programmatically. Compose and frame the product mainly within the right two-thirds of the image."
      : "Composition constraint: keep the top-right corner (two short benefit tags) and a generous strip along the bottom ~25% of the frame visually calm and uncluttered — marketing text, price and contact info will be added programmatically in those zones afterward.";
  return thumbCount > 0 ? `${base} ${thumbnailZoneInstruction(thumbCount)}` : base;
}

// ——— Vignettes des photos secondaires (vraies photos, posées par le code, jamais redessinées) ———
// La DISPOSITION est décidée par l'IA en regardant l'affiche finie (planThumbnailPlacement) ;
// le code se charge seulement de poser les vraies photos au pixel près.

/**
 * Consigne aux modèles d'image : prévoir de la place pour les vraies photos, que l'APPLICATION
 * pose ensuite. Formulée pour qu'ils ne dessinent jamais eux-mêmes de vignette ni de vue en plus.
 */
function thumbnailZoneInstruction(count: number): string {
  const photos = count > 1 ? `${count} small photographic insets` : "1 small photographic inset";
  return `Secondary photo insets: ${photos} (real photos of the same product, each roughly 15-22% of the poster width) will be composited by the application AFTER generation. Keep a visually appropriate area for ${count > 1 ? "them" : "it"}, wherever it best suits THIS composition — do not always use the same corner. Do NOT draw, generate or simulate these insets yourself, and do NOT create additional copies or views of the product to stand in for them. Do not place critical text or the hero product where it would conflict with these future insets.`;
}

/** Repli si l'IA de placement échoue : coin opposé au bloc de texte principal. */
function fallbackThumbnailSlots(layout: LayoutVariant, count: number): { xPct: number; yPct: number }[] {
  const size = 20;
  const gap = 2.2;
  return Array.from({ length: count }, (_, i) =>
    layout === "side-panel"
      ? { xPct: 100 - 4 - size - (count - 1 - i) * (size + gap), yPct: 4 }
      : { xPct: 4 + i * (size + gap), yPct: 4 }
  );
}

/**
 * Pose les photos secondaires (max 2) en vignettes sur l'affiche FINALE : l'IA choisit
 * l'emplacement, la taille, la forme (arrondie / ronde) et l'inclinaison selon la composition ;
 * ce sont toujours les vraies photos du commerçant, au pixel près.
 */
export async function insetSecondaryPhotos(
  posterBuffer: Buffer,
  secondaries: Buffer[],
  layout: LayoutVariant,
  accent: string,
  productName = ""
): Promise<Buffer> {
  const photos = secondaries.slice(0, 2);
  if (photos.length === 0) return posterBuffer;
  const meta = await sharp(posterBuffer).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? W;

  const preview = await sharp(posterBuffer).resize(768, 768, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  let plan = await planThumbnailPlacement(preview.toString("base64"), photos.length, productName);
  // Deux vignettes qui se chevauchent : plan rejeté.
  if (plan && plan.slots.length === 2) {
    const [a, b] = plan.slots;
    if (Math.abs(a.xPct - b.xPct) < plan.sizePct && Math.abs(a.yPct - b.yPct) < plan.sizePct) plan = null;
  }
  const sizePct = plan?.sizePct ?? 20;
  const shape = plan?.shape ?? "rounded";
  const tilt = plan?.tiltDeg ?? 0;
  const slots = plan?.slots ?? fallbackThumbnailSlots(layout, photos.length);

  const k = W / 1024;
  const size = Math.round((sizePct / 100) * W);
  const border = Math.max(4, Math.round(7 * k));
  const radius = shape === "circle" ? size / 2 : Math.round(size * 0.12);
  const inner = size - border * 2;
  const innerRadius = shape === "circle" ? inner / 2 : Math.max(2, radius - border / 2);
  const pad = Math.round(26 * k);

  const layers: OverlayOptions[] = [];
  for (let i = 0; i < photos.length; i++) {
    const slot = slots[i];
    if (!slot) continue;
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}"><rect width="${inner}" height="${inner}" rx="${innerRadius}" ry="${innerRadius}" fill="#fff"/></svg>`
    );
    let photo: Buffer;
    try {
      photo = await sharp(photos[i])
        .rotate()
        .resize(inner, inner, { fit: "cover", position: "attention" })
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer();
    } catch {
      continue;
    }
    const tileSize = size + pad * 2;
    const frame = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}">
        <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${Math.round(8 * k)}" stdDeviation="${Math.round(9 * k)}" flood-color="#000" flood-opacity="0.4"/></filter></defs>
        <rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${accent}" filter="url(#s)"/>
        <rect x="${pad + Math.round(3 * k)}" y="${pad + Math.round(3 * k)}" width="${size - Math.round(6 * k)}" height="${size - Math.round(6 * k)}" rx="${Math.max(1, radius - 3 * k)}" ry="${Math.max(1, radius - 3 * k)}" fill="#ffffff"/>
      </svg>`
    );
    // Cadre + photo assemblés en une tuile, puis légèrement inclinée si l'IA l'a choisi.
    let tile = await sharp(frame)
      .png()
      .composite([{ input: photo, left: pad + border, top: pad + border }])
      .png()
      .toBuffer();
    const angle = i === 1 && photos.length === 2 ? -tilt : tilt; // deux vignettes : inclinaisons opposées
    if (Math.abs(angle) >= 0.5) {
      tile = await sharp(tile).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }
    const tileMeta = await sharp(tile).metadata();
    const tw = tileMeta.width ?? tileSize;
    const th = tileMeta.height ?? tileSize;
    const cx = Math.round((slot.xPct / 100) * W + size / 2);
    const cy = Math.round((slot.yPct / 100) * H + size / 2);
    const left = Math.min(Math.max(0, cx - Math.round(tw / 2)), W - tw);
    const top = Math.min(Math.max(0, cy - Math.round(th / 2)), H - th);
    if (left < 0 || top < 0) continue;
    layers.push({ input: tile, left, top });
  }
  if (layers.length === 0) return posterBuffer;
  return sharp(posterBuffer).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Ancre visuellement le fond dans une référence patrimoniale sénégalaise précise (Gorée,
 * Saint-Louis, Casamance...) plutôt qu'une imagerie "africaine" générique — réservé aux
 * secteurs où l'identité culturelle est un vrai angle créatif (voir Industry.culturalHeritage).
 */
function getCulturalHeritageInstruction(industry: Industry | undefined): string {
  if (!industry?.culturalHeritage) return "";
  return `\n\nSenegalese cultural identity (mandatory for this category — this is what makes the result read as authentically Senegalese, not generic "African" stock imagery): weave in a specific, tasteful visual reference to real Senegalese heritage — ${pickHeritageCue()}. Treat it as a backdrop influence (mood, texture, silhouette, color, materials) rather than a literal postcard illustration, and never let it compete with or obscure the product itself, which remains the hero.`;
}

/**
 * Prompt orchestrator ("Marketing Engine" + "Prompt Builder") : assemble l'analyse produit,
 * le secteur, la saison, les canaux de diffusion et l'espace réservé au texte en un brief de
 * directeur artistique. L'IA choisit elle-même le style, les couleurs et l'ambiance, mais en
 * s'appuyant sur des faits explicites (couleurs/matière du produit) plutôt qu'en devinant.
 */
function buildComposedPosterPrompt(params: {
  industryKey: string | null;
  layout: LayoutVariant;
  isCutout: boolean;
  analysis: ProductAnalysis | null;
  customInstructions?: string | null;
  /** Nombre de vraies photos secondaires que le code posera en vignettes (0 à 2). */
  thumbCount: number;
  /** Chemin multi-image : la photo principale est la 1re référence, les secondaires suivent. */
  multi: MultiReferenceContext | null;
  /** Nouvel essai : défauts relevés par le contrôle qualité sur l'essai précédent. */
  retryIssues?: string[];
  creativeBrief: CreativeBrief;
}): string {
  const industry = getIndustry(params.industryKey ?? undefined);
  const seasonalNote = getSeasonalVisualNote(new Date());

  const subjectLine = params.multi
    ? multiReferenceSubjectLine(params.multi, params.isCutout)
    : params.isCutout
      ? "You are given the subject (a product, or something representing a service being offered — e.g. a vehicle, equipment, a person at work) completely isolated on a transparent background — no original scene, no props, no distracting context. Everything visible in the reference image is the subject itself."
      : "You are given a photo of the subject — a product, or something representing a service being offered (e.g. a vehicle, equipment, a person at work) — in its original setting.";

  const analysisBlock = params.analysis
    ? `Subject analysis (from a vision pass on the original photo):
- Category: ${params.analysis.category}
- Dominant colors: ${params.analysis.colors.join(", ")}
- Material / texture: ${params.analysis.material}
- Positioning: ${params.analysis.positioning}
- Distinctive detail: ${params.analysis.visualNotes}

Weave THIS analysis into the creative direction below — the palette and materials must genuinely relate to these specific colors and materials, not be chosen independently of them.`
    : "";

  return `${CREATIVE_DIRECTOR_OPENING}

You are working on premium commercial photography and social media marketing for African markets — for physical products as well as local services (e.g. car rental, cleaning services, car detailing).

${subjectLine}

Your task: design a complete, professional advertising visual around this exact subject to sell it.

${CONCEPT_FIRST_INSTRUCTION}

Product/service fidelity (absolute, overrides everything else below):
- The subject shown is the absolute hero of the composition — preserve its exact colors, proportions, textures, and any text or logo already visible on it. Never redesign, restyle or reinterpret the subject itself — no exceptions, regardless of the creative direction below.${
    params.multi ? `\n\n${multiReferenceIdentityBlock(params.multi)}` : ""
  }

${formatCreativeBrief(params.creativeBrief)}

${formatLightingInstruction(params.creativeBrief.lightingStrategy)}

${COLOR_HIERARCHY_INSTRUCTION}

${CREATIVITY_RULES}

${VISUAL_SURPRISE_RULE}

${ASYMMETRY_RULE}

${DESIGN_PRINCIPLES}

Do NOT include: text, logos other than what's already visible on the subject, prices, numbers, watermarks, QR codes, buttons or UI elements.

${analysisBlock}

Category: ${industry ? `${industry.labelFr} — typical scene elements to draw inspiration from: ${industry.visualDirection}.` : "General Senegalese retail."}
${getCulturalHeritageInstruction(industry)}

Distribution channels: Facebook, Instagram and WhatsApp — the visual must read clearly even as a small thumbnail.
${seasonalNote ? `\n${seasonalNote}` : ""}
${getNegativeSpaceInstruction(params.layout, Math.min(2, params.thumbCount))}
${params.customInstructions ? `\nThe merchant asked for these specific changes compared to the previous version — prioritize honoring this request while still respecting the fidelity rule above: "${params.customInstructions}"` : ""}
${params.retryIssues?.length ? `\n${retryFeedbackBlock(params.retryIssues)}` : ""}

${SELF_CRITIQUE_INSTRUCTION}`;
}

// ——— Multi-image (offres payantes) : blocs propres au chemin 2-3 photos ———

const PURPOSE_LABEL: Record<MultiReferenceContext["secondaries"][number]["purpose"], string> = {
  detail: "close-up detail",
  alternate_angle: "another viewpoint",
  texture: "material / texture",
  usage: "worn / in use / contextual shot",
  other: "additional reference",
};

/** Remplace la phrase de référence : la 1re image est la SEULE référence du héros. */
function multiReferenceSubjectLine(multi: MultiReferenceContext, heroIsCutout: boolean): string {
  const total = multi.secondaries.length + 1;
  const list = multi.secondaries
    .map((s, i) => `- Reference image ${i + 2}: ${PURPOSE_LABEL[s.purpose]}${s.note ? ` — ${s.note}` : ""}`)
    .join("\n");
  return `You are given ${total} reference images of ONE SAME SUBJECT (a product, or something representing a service being offered).

The FIRST reference image is the PRIMARY HERO REFERENCE${
    heroIsCutout ? " — the subject cut out from the merchant's main photo, isolated on a transparent background" : ""
  }. Only this first image determines the hero representation of the subject: main angle, orientation, silhouette, proportions and visible configuration.

The remaining images are SECONDARY REFERENCE IMAGES:
${list}
They exist ONLY to help you understand details, materials, textures, construction and features of the SAME subject that are hidden or unclear in the first image. They are NOT additional products and NOT separate hero shots. Do NOT reproduce them as additional objects, do NOT combine different viewpoints into a new impossible viewpoint, do NOT duplicate the product, do NOT redesign it, and never take a person, a hand or a setting from a worn / in-use reference into the scene.

When references conflict, the PRIMARY HERO REFERENCE always wins for the visual representation; use secondary references only to clarify details not visible in it. The final scene must contain ONE single, coherent representation of the subject.`;
}

/** Bloc d'identité produit, placé juste après la règle de fidélité. */
function multiReferenceIdentityBlock(multi: MultiReferenceContext): string {
  const a = multi.analysis;
  const bullets = (items: string[]) => items.map((x) => `- ${x}`).join("\n");
  const identity = [
    a.product_identity.shape && `shape: ${a.product_identity.shape}`,
    a.product_identity.dominant_colors.length > 0 && `colors: ${a.product_identity.dominant_colors.join(", ")}`,
    a.product_identity.materials.length > 0 && `materials: ${a.product_identity.materials.join(", ")}`,
    a.product_identity.visible_branding.length > 0 && `visible branding: ${a.product_identity.visible_branding.join(", ")}`,
  ].filter((x): x is string => !!x);
  return `Multi-reference product identity — NON-NEGOTIABLE:
The following characteristics define the exact identity of the subject and must remain consistent:
${bullets([...identity, ...a.critical_features])}${
    a.features_to_preserve.length ? `\nPreserve:\n${bullets(a.features_to_preserve)}` : ""
  }${a.potential_conflicts.length ? `\nDo not invent:\n${bullets(a.potential_conflicts)}` : ""}
The secondary references are evidence about the SAME subject, not additional subjects. They will be added later by the application as real photographic insets: do NOT create, draw, simulate or reproduce thumbnails yourself, and do NOT create additional copies of the product representing them. The generated scene must contain only the main hero representation of the subject.`;
}

/** Nouvel essai : on dit précisément ce qui a échoué, sans abandonner le concept créatif. */
function retryFeedbackBlock(issues: string[]): string {
  return `Previous attempt failed quality control for these reasons: ${issues.join("; ")}. Correct ONLY these issues while preserving the creative concept.`;
}

/**
 * Étape "Image Generator" (+ "Upscaler" via la résolution demandée directement à la
 * génération, plutôt qu'un service de post-traitement séparé).
 */
async function generateComposedPoster(
  images: { base64: string; mediaType: AllowedMediaType }[],
  opts: {
    industryKey: string | null;
    layout: LayoutVariant;
    isCutout: boolean;
    analysis: ProductAnalysis | null;
    customInstructions: string | null | undefined;
    creativeBrief: CreativeBrief;
    thumbCount: number;
    multi: MultiReferenceContext | null;
    retryIssues?: string[];
  }
) {
  try {
    const prompt = buildComposedPosterPrompt(opts);

    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        input_references: images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } })),
        aspect_ratio: "1:1",
        resolution: "2K",
      }),
    });

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Aucune image générée.");
    return { imageBase64: b64, imageError: null as string | null };
  } catch (err) {
    return { imageBase64: null, imageError: err instanceof Error ? err.message : "Erreur lors de la génération de l'image." };
  }
}

/**
 * Pipeline complet : Vision + Product Analyzer -> Marketing Engine + Prompt Builder ->
 * Image Generator -> Quality Checker (avec une reprise bornée si le contrôle échoue).
 * Le détourage (pixels du produit intacts, aucun décor d'origine) tourne en parallèle de
 * l'analyse produit puisque les deux partent de la même photo brute.
 *
 * `extraPhotos` (palier Advanced) : jusqu'à 2 photos supplémentaires du même produit, fournies en
 * référence en plus de la photo principale, pour une composition plus riche et plus fidèle.
 * `forcedLayout` (palier Advanced) : impose le gabarit plutôt que de le tirer au hasard, pour
 * générer 2 déclinaisons structurellement différentes (une side-panel, une bottom-bar).
 */
export async function buildPosterBackground(
  photoBuffer: Buffer,
  photoBase64: string,
  mediaType: AllowedMediaType,
  productName: string,
  industry: string | null,
  customInstructions?: string | null,
  extraPhotos?: { base64: string; mediaType: AllowedMediaType }[],
  forcedLayout?: LayoutVariant,
  showSecondaryPhotos?: boolean,
  opts?: {
    /**
     * Chemin multi-image (offres payantes, voir lib/multi-reference.ts). Absent : pipeline « une
     * image » — le décor est composé à partir de la photo principale SEULE, les éventuelles
     * photos secondaires ne servent qu'aux vignettes posées par le code.
     */
    multi?: MultiReferenceContext | null;
    /** Analyse déjà faite (analyse groupée) : évite de réanalyser la photo principale. */
    productAnalysis?: ProductAnalysis | null;
  }
): Promise<{
  backgroundBuffer: Buffer;
  imageError: string | null;
  usedCutout: boolean;
  qualityRetried: boolean;
  layout: LayoutVariant;
  accentGradient: { from: string; to: string } | null;
  creativeBrief: CreativeBrief;
  sellingPoints: string[];
}> {
  const layout = forcedLayout ?? pickLayoutVariant();
  const extras = extraPhotos ?? [];
  const multi = opts?.multi && extras.length > 0 ? opts.multi : null;
  const thumbCount = showSecondaryPhotos ? Math.min(2, extras.length) : 0;
  const creativeBrief = buildCreativeBrief();

  const [analysis, cutoutOutcome] = await Promise.all([
    opts?.productAnalysis ? Promise.resolve(opts.productAnalysis) : analyzeProduct(photoBase64, mediaType, productName),
    removeBackground(photoBuffer)
      .then((buf) => ({ ok: true as const, buf }))
      .catch((err) => ({ ok: false as const, err })),
  ]);

  const isCutout = cutoutOutcome.ok;
  const hero = isCutout
    ? { base64: cutoutOutcome.buf.toString("base64"), mediaType: "image/png" as AllowedMediaType }
    : { base64: photoBase64, mediaType };
  // Multi-image : principale (détourée si possible) en 1re position, secondaires brutes ensuite —
  // elles restent de simples références, pas besoin de les détourer.
  const referencesFor = (h: { base64: string; mediaType: AllowedMediaType }) => (multi ? [h, ...extras] : [h]);

  const baseOpts = { industryKey: industry, layout, analysis, customInstructions, creativeBrief, thumbCount, multi };

  let genResult = await generateComposedPoster(referencesFor(hero), { ...baseOpts, isCutout });

  // Repli si le détourage a réussi mais que la composition IA échoue quand même : retente avec la photo brute.
  let usedCutoutHero = isCutout;
  if (!genResult.imageBase64 && isCutout) {
    genResult = await generateComposedPoster(referencesFor({ base64: photoBase64, mediaType }), { ...baseOpts, isCutout: false });
    usedCutoutHero = false;
  }

  let finalImageBase64 = genResult.imageBase64;
  let qualityRetried = false;

  if (finalImageBase64) {
    const { passed, issues } = multi
      ? await checkMultiReferenceFidelity({ base64: photoBase64, mediaType }, extras, finalImageBase64, multi.analysis.critical_features)
      : await checkPosterQuality(photoBase64, mediaType, finalImageBase64, false);
    if (!passed) {
      // Un seul nouvel essai, qui reçoit les défauts relevés pour les corriger précisément.
      const retryHero = usedCutoutHero ? hero : { base64: photoBase64, mediaType };
      const retry = await generateComposedPoster(referencesFor(retryHero), {
        ...baseOpts,
        isCutout: usedCutoutHero,
        retryIssues: issues,
      });
      if (retry.imageBase64) {
        finalImageBase64 = retry.imageBase64;
        qualityRetried = true;
      }
    }
  }

  const backgroundBuffer = finalImageBase64 ? Buffer.from(finalImageBase64, "base64") : photoBuffer;
  return {
    backgroundBuffer,
    imageError: genResult.imageError,
    usedCutout: usedCutoutHero,
    qualityRetried,
    layout,
    accentGradient: analysis?.accentGradient ?? getIndustryAccent(industry),
    creativeBrief,
    sellingPoints: analysis?.sellingPoints ?? [],
  };
}

/**
 * Brief orchestrator pour un service SANS photo de référence : au lieu de composer autour
 * d'une photo, l'IA imagine une scène entière à partir du nom, de la description et des
 * items proposés — text-to-image plutôt qu'édition d'image. Utilisé quand la photo est
 * facultative (création de type service) et que le marchand n'en fournit pas.
 */
function buildServicePosterPrompt(params: {
  industryKey: string | null;
  layout: LayoutVariant;
  serviceName: string;
  serviceDescription: string | null;
  serviceItems: string[];
  customInstructions?: string | null;
  creativeBrief: CreativeBrief;
}): string {
  const industry = getIndustry(params.industryKey ?? undefined);
  const seasonalNote = getSeasonalVisualNote(new Date());
  const itemsLine = params.serviceItems.length
    ? `Items/offerings included in this service: ${params.serviceItems.join(", ")}.`
    : "";

  return `${CREATIVE_DIRECTOR_OPENING}

You are working on premium marketing visuals for local services in Senegal / West Africa (e.g. car rental, cleaning services, car detailing).

There is no reference photo for this brief — imagine and compose an entirely original, professional advertising visual from scratch that convincingly represents this exact service.

${CONCEPT_FIRST_INSTRUCTION}

Service: "${params.serviceName}"
${params.serviceDescription ? `Description: ${params.serviceDescription}` : ""}
${itemsLine}

${formatCreativeBrief(params.creativeBrief)}

${formatLightingInstruction(params.creativeBrief.lightingStrategy)}

${COLOR_HIERARCHY_INSTRUCTION}

${CREATIVITY_RULES}

${VISUAL_SURPRISE_RULE}

${ASYMMETRY_RULE}

${DESIGN_PRINCIPLES}

Do NOT include: text, logos, prices, numbers, watermarks, QR codes, buttons or UI elements — those are added separately.

Category: ${industry ? `${industry.labelFr} — typical scene elements to draw inspiration from: ${industry.visualDirection}.` : "General local service."}
${getCulturalHeritageInstruction(industry)}

Distribution channels: Facebook, Instagram and WhatsApp — the visual must read clearly even as a small thumbnail.
${seasonalNote ? `\n${seasonalNote}` : ""}
${getNegativeSpaceInstruction(params.layout)}
${params.customInstructions ? `\nThe merchant asked for these specific changes compared to the previous version: "${params.customInstructions}"` : ""}

${SELF_CRITIQUE_INSTRUCTION}`;
}

async function generateServiceImage(params: {
  serviceName: string;
  serviceDescription: string | null;
  serviceItems: string[];
  industryKey: string | null;
  layout: LayoutVariant;
  customInstructions?: string | null;
  creativeBrief: CreativeBrief;
}) {
  try {
    const prompt = buildServicePosterPrompt(params);

    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        aspect_ratio: "1:1",
        resolution: "2K",
      }),
    });

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Aucune image générée.");
    return { imageBase64: b64, imageError: null as string | null };
  } catch (err) {
    return { imageBase64: null, imageError: err instanceof Error ? err.message : "Erreur lors de la génération de l'image." };
  }
}

/**
 * Pipeline pour un service sans photo : pas de détourage, pas d'analyse vision (rien à
 * comparer), pas de contrôle qualité (rien dont vérifier la fidélité) — juste une génération
 * text-to-image à partir du brief (nom, description, items). Repli sur un fond en dégradé uni
 * si la génération échoue totalement : contrairement au flux produit, il n'y a pas de photo
 * d'origine vers laquelle se replier, donc le bandeau satori doit toujours avoir un fond.
 */
export async function buildServiceBackground(
  serviceName: string,
  serviceDescription: string | null,
  serviceItems: string[],
  industry: string | null,
  customInstructions?: string | null,
  forcedLayout?: LayoutVariant
): Promise<{
  backgroundBuffer: Buffer;
  imageError: string | null;
  layout: LayoutVariant;
  accentGradient: { from: string; to: string } | null;
  creativeBrief: CreativeBrief;
}> {
  const layout = forcedLayout ?? pickLayoutVariant();
  const creativeBrief = buildCreativeBrief();
  const genResult = await generateServiceImage({
    serviceName,
    serviceDescription,
    serviceItems,
    industryKey: industry,
    layout,
    customInstructions,
    creativeBrief,
  });

  const accentGradient = getIndustryAccent(industry);
  const backgroundBuffer = genResult.imageBase64
    ? Buffer.from(genResult.imageBase64, "base64")
    : await buildPlainBackground(accentGradient);

  return { backgroundBuffer, imageError: genResult.imageError, layout, accentGradient, creativeBrief };
}

interface FinalPosterParams {
  layout: LayoutVariant;
  productName: string;
  price: number | null;
  phone: string;
  industry: string | null;
  accentGradient?: { from: string; to: string } | null;
  businessName?: string | null;
  logoBuffer?: Buffer | null;
  customInstructions?: string | null;
  serviceItems?: string[] | null;
  creativeBrief?: CreativeBrief | null;
  /** Points forts propres au produit, issus de l'analyse IA (utilisés si le commerçant n'en a pas saisi). */
  benefits?: string[] | null;
  /** Photos secondaires (max 2) posées en vignettes sur l'affiche finale, dans le coin réservé. */
  secondaryPhotos?: Buffer[] | null;
}

/**
 * Filet de sécurité fiable : notre bandeau satori (texte garanti correct, car rendu par nous,
 * pas par un modèle génératif) composité sur le fond IA.
 */
async function renderSatoriOverlay(origin: string, backgroundBuffer: Buffer, params: FinalPosterParams): Promise<Buffer> {
  const overlayUrl = new URL("/api/render-overlay", origin);
  overlayUrl.searchParams.set("layout", params.layout);
  overlayUrl.searchParams.set("productName", params.productName);
  overlayUrl.searchParams.set("price", params.price != null ? `${params.price.toLocaleString("fr-FR")} FCFA` : "Sur devis");
  overlayUrl.searchParams.set("phone", params.phone);
  // Points forts : ceux du commerçant en priorité, sinon ceux de l'analyse du produit. Jamais de
  // liste figée (l'ancienne valeur par défaut affichait toujours « Livraison rapide à Dakar »).
  const benefits =
    params.serviceItems && params.serviceItems.length > 0
      ? params.serviceItems.slice(0, 3)
      : (params.benefits ?? []).map((b) => b.trim()).filter(Boolean).slice(0, 3);
  overlayUrl.searchParams.set("benefits", benefits.join("|"));
  if (params.accentGradient) {
    overlayUrl.searchParams.set("accentFrom", params.accentGradient.from);
    overlayUrl.searchParams.set("accentTo", params.accentGradient.to);
  }
  if (params.businessName) {
    overlayUrl.searchParams.set("businessName", params.businessName);
  }

  const overlayRes = await fetch(overlayUrl.toString());
  if (!overlayRes.ok) throw new Error("Échec du rendu de l'overlay.");
  const overlayBuffer = Buffer.from(await overlayRes.arrayBuffer());

  return compositeOverlay(backgroundBuffer, overlayBuffer, params.logoBuffer);
}

/**
 * Demande à GPT Image 2 de dessiner directement la mise en page complète (texte, prix, contact,
 * CTA, tags) sur l'image déjà composée — au lieu d'un gabarit fixe qu'on superpose nous-mêmes.
 * Plus créatif et varié, mais le texte est produit par un modèle génératif, donc jamais garanti
 * exact : c'est à `checkTextAccuracy` de trancher si le résultat est fiable (repli sur le
 * bandeau satori sinon, voir `renderFinalPoster`).
 */
async function generateTemplatedPoster(backgroundBuffer: Buffer, params: FinalPosterParams) {
  try {
    const priceLabel = params.price != null ? `${params.price.toLocaleString("fr-FR")} FCFA` : null;
    const showContact = !!params.phone;
    const industry = getIndustry(params.industry ?? undefined);

    const requirements = [`Product name: "${params.productName}"`];
    if (priceLabel) {
      requirements.push(`Price: "${priceLabel}"`);
    } else {
      requirements.push(`No fixed price — instead include a short "Prix sur devis" / "Contactez-nous pour le prix" call-to-action in place of a price`);
    }
    const phonesLabel = params.phone
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean)
      .join(" / ");
    if (showContact) requirements.push(`WhatsApp contact (afficher chaque numéro): "${phonesLabel}"`);
    if (params.businessName) requirements.push(`Business name: "${params.businessName}"`);
    requirements.push(`A short call-to-action, e.g. "Commander sur WhatsApp"`);

    const hasServiceItems = !!params.serviceItems && params.serviceItems.length > 0;

    const creativeBenefitsInstruction = hasServiceItems
      ? `\n\nBenefit tags: the merchant specifically listed these as what this service includes — use them (pick the best 3 if there are more) as the benefit tags on the poster: ${params.serviceItems!.join(", ")}. You may lightly polish the wording for a clean, professional look (capitalize, tighten phrasing, remove redundancy) but do NOT invent different tags or change their meaning — these are the merchant's real offerings, not generic filler.`
      : `\n\nBenefit tags: choose 1 to 3 short selling-point tags that fit THIS specific product — what genuinely makes it desirable (material, finish, craftsmanship, comfort, style, use, occasion, freshness...).${
          params.benefits && params.benefits.length > 0
            ? ` Suggested from an analysis of the product photo (use them, or better ones of the same nature): ${params.benefits.join(", ")}.`
            : ""
        } NEVER claim anything the merchant did not state: no delivery, no payment method, no guarantee, no stock or promotion claim. No generic filler that would fit any product.${(() => {
          const inspiration = getIndustryInspiration(params.industry);
          return inspiration.length > 0 ? ` For inspiration only, not mandatory — typical angles for this category: ${inspiration.join(", ")}.` : "";
        })()}`;

    const hasMerchantLogo = !!params.logoBuffer;

    const merchantLogoInstruction = hasMerchantLogo
      ? `\n\nBrand logo: a second reference image is provided — the merchant's own business logo. Place it tastefully as a real brand mark on the poster (e.g. a corner, near the CTA, or integrated into the layout) — clearly visible and legible, but not dominating the product.`
      : "";

    const thumbCount = Math.min(2, params.secondaryPhotos?.length ?? 0);
    const reservedZoneBlock = thumbCount > 0 ? `\n\n${thumbnailZoneInstruction(thumbCount)}` : "";

    const customInstructionsBlock = params.customInstructions
      ? `\n\nThe merchant asked for these specific changes compared to the previous version — prioritize honoring this request while still respecting the accuracy rules below: "${params.customInstructions}"`
      : "";

    // Point corrigé après retour utilisateur : imposer l'accent SANS dire quoi faire du panneau/
    // fond derrière le texte produisait des combinaisons qui juraient (ex: panneau noir brut +
    // accent bleu vif, sans lien de teinte entre les deux) — l'instruction précise maintenant
    // que le fond du bloc de texte doit être choisi EN FONCTION de cet accent, pas indépendamment.
    let accent = params.accentGradient ?? null;
    if (hasMerchantLogo && params.logoBuffer) {
      const logoAccent = await analyzeLogoColors(params.logoBuffer.toString("base64"));
      if (logoAccent) accent = logoAccent;
    }
    const colorInstruction = accent
      ? `\n\nColor palette (mandatory): use this exact 2-color accent — ${accent.from} to ${accent.to} — as the dominant/accent colors for the CTA button, benefit tags and typography highlights. This was chosen specifically for this ${hasMerchantLogo ? "merchant's brand" : "product/service"} — do NOT default to a generic neutral, beige or pastel scheme instead. Critically, whatever panel, strip or backdrop sits BEHIND the text must be chosen to harmonize with this exact accent — e.g. a deep, desaturated tint of the same hue family, rather than a plain, unrelated black or grey. Treat the background, the accent and the typography as ONE deliberate color story, never as independent, clashing choices.`
      : "";

    const toneInstruction = industry ? `\n\nOverall tone to match this category: ${industry.toneHint}` : "";

    // Même brief créatif que l'étape de décor (si disponible) pour que la mise en page reste
    // cohérente avec la scène déjà composée, plus une humeur typographique tirée indépendamment
    // pour que la typographie elle-même varie d'une génération à l'autre.
    const typographyMood = pickTypographyMood();
    const creativeBriefBlock = params.creativeBrief
      ? `\n\nThe scene behind you was already composed with this exact Creative DNA — the layout, typography and finishing touches you add now must feel like they belong to the SAME unified vision, not a mismatched addition:\n${formatCreativeBrief(params.creativeBrief, { typographyMood })}`
      : `\n\nTypography mood for this generation: ${typographyMood}.`;

    const prompt = `${CREATIVE_DIRECTOR_OPENING}

You are designing the flagship, top-of-the-line tier of this product — the client paid a premium price specifically for a breathtaking result, and expects it to look like it came from a top international ad agency, not a template. You are given a professional, already-composed product photo${hasMerchantLogo ? " as the first reference image" : ""}.

${CONCEPT_FIRST_INSTRUCTION}

Add a complete, professional marketing poster layout on top of this exact image — do not alter the photo itself, only add design elements around/over it (price tag, contact info, typography). Do NOT add any badge, ribbon, tier label or stamp of any kind.

This must be genuinely stunning — the kind of visual that stops someone mid-scroll on Instagram, not a safe or generic composition. Take a bold, memorable creative risk: striking typography, a considered color story, confident use of space. Never settle for "good enough."
${creativeBriefBlock}

${CREATIVITY_RULES}

${VISUAL_SURPRISE_RULE}

${ASYMMETRY_RULE}

${DESIGN_PRINCIPLES}

${LAYOUT_FREEDOM_INSTRUCTION}
${colorInstruction}

${COLOR_HIERARCHY_INSTRUCTION}
${toneInstruction}

Text that MUST appear, spelled and written EXACTLY as given below (this is real business information — accuracy is critical, never invent, alter or truncate any digit or character):
${requirements.map((r) => `- ${r}`).join("\n")}
${creativeBenefitsInstruction}
${merchantLogoInstruction}${reservedZoneBlock}
${customInstructionsBlock}

Design rules:
- Choose typography and finer layout details that genuinely complement this specific image — elegant, modern, magazine-cover quality, like a real advertising agency poster — while strictly respecting the mandatory color palette above.
- All the text listed above as "MUST appear" must be 100% accurate and fully legible.
- Do not add any other invented text, numbers or logos beyond what's explicitly requested above.
- No badge, ribbon, tier name or stamp anywhere on the poster.
- Keep the product itself fully visible, not obstructed by text or UI elements.

${SELF_CRITIQUE_INSTRUCTION}`;

    const backgroundBase64 = backgroundBuffer.toString("base64");
    const inputReferences: { type: "image_url"; image_url: { url: string } }[] = [
      { type: "image_url", image_url: { url: `data:image/png;base64,${backgroundBase64}` } },
    ];
    if (hasMerchantLogo && params.logoBuffer) {
      inputReferences.push({ type: "image_url", image_url: { url: `data:image/png;base64,${params.logoBuffer.toString("base64")}` } });
    }

    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        input_references: inputReferences,
        resolution: "2K",
        aspect_ratio: "1:1",
      }),
    });

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Aucune affiche générée.");
    return { imageBase64: b64, imageError: null as string | null };
  } catch (err) {
    return { imageBase64: null, imageError: err instanceof Error ? err.message : "Erreur lors de la génération de l'affiche." };
  }
}

/**
 * Étape "Export" / mise en page finale : GPT Image 2 dessine la mise en page en priorité
 * (créative, varie à chaque génération). Si le texte généré (prix, contact) n'est pas
 * vérifié exact, repli automatique sur le bandeau satori fiable.
 */
export async function renderFinalPoster(
  origin: string,
  backgroundBuffer: Buffer,
  params: FinalPosterParams
): Promise<{ finalBuffer: Buffer; usedAiTemplate: boolean }> {
  const result = await renderFinalPosterBase(origin, backgroundBuffer, params);
  const secondaries = params.secondaryPhotos ?? [];
  if (secondaries.length === 0) return result;
  try {
    const accent = params.accentGradient?.from ?? "#6D28D9";
    const finalBuffer = await insetSecondaryPhotos(result.finalBuffer, secondaries, params.layout, accent, params.productName);
    return { ...result, finalBuffer };
  } catch {
    return result; // en cas d'échec des vignettes, l'affiche reste livrée
  }
}

async function renderFinalPosterBase(
  origin: string,
  backgroundBuffer: Buffer,
  params: FinalPosterParams
): Promise<{ finalBuffer: Buffer; usedAiTemplate: boolean }> {
  const { imageBase64 } = await generateTemplatedPoster(backgroundBuffer, params);

  if (imageBase64) {
    const check = await checkTextAccuracy(imageBase64, {
      price: params.price != null ? params.price.toLocaleString("fr-FR") : undefined,
      phone: params.phone ? params.phone.split("|")[0].trim() || undefined : undefined,
      productName: params.productName,
      businessName: params.businessName ?? undefined,
    });
    if (check.passed) {
      const finalBuffer = await finalizeJpeg(Buffer.from(imageBase64, "base64"));
      return { finalBuffer, usedAiTemplate: true };
    }
  }

  const finalBuffer = await renderSatoriOverlay(origin, backgroundBuffer, params);
  return { finalBuffer, usedAiTemplate: false };
}

/** Assombrit une couleur hex (amt négatif) — pour dériver un dégradé d'accent. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  const r = clamp((n >> 16) & 255);
  const g = clamp((n >> 8) & 255);
  const b = clamp(n & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

/**
 * Chemin "artisan" — décor à motifs africains (bogolan / adinkra / kente) rendu
 * par sharp, SANS aucun appel IA image. Le produit est détouré (pixels intacts,
 * comme le reste du pipeline) et posé sur le décor, puis le texte prix/contact est
 * ajouté par le bandeau satori fiable (texte toujours exact). Alternative rapide et
 * économique à buildPosterBackground + renderFinalPoster, réservée aux catégories
 * artisanales (mode, sacs, chaussures...). Lève une erreur si le détourage n'est pas
 * disponible (REMOVEBG_API_KEY absent) — l'appelant retombe alors sur le flux standard.
 */
export async function buildArtisanPoster(
  origin: string,
  photoBuffer: Buffer,
  params: {
    productName: string;
    price: number | null;
    phone: string;
    industry: string | null;
    businessName?: string | null;
    logoBuffer?: Buffer | null;
    seed?: number;
    /** Photos secondaires (max 2) : posées en vignettes à droite du produit principal. */
    secondaryPhotos?: Buffer[];
  }
): Promise<{ finalBuffer: Buffer; layout: LayoutVariant }> {
  // Analyse vision (couleurs du sujet) en parallèle du détourage : la palette du décor
  // et du texte est dérivée du produit lui-même plutôt que d'un preset figé. Si l'analyse
  // échoue, repli sur le preset curaté par catégorie. Le détourage est laissé remonter en
  // cas d'échec (voir docstring) — comme avant.
  const [analysis, cutout] = await Promise.all([
    analyzeProduct(photoBuffer.toString("base64"), "image/jpeg", params.productName),
    removeBackground(photoBuffer),
  ]);

  const dir = analysis?.accentGradient
    ? artDirectionFromAnalysis(analysis.accentGradient, params.industry, params.seed ?? 1)
    : pickArtDirection(params.industry, params.seed ?? 1);

  // Décor 1024×1024 (format du pipeline satori) + produit dans la moitié haute,
  // bande basse laissée calme pour le bandeau texte (layout bottom-bar).
  let bg = await buildDesignedBackground(dir, 1024, 1024);
  const secondaries = (params.secondaryPhotos ?? []).slice(0, 2);
  // Avec photos secondaires, le produit est un peu plus petit pour laisser de l'air ; l'IA décide
  // ensuite où poser les vignettes en regardant l'affiche finie.
  bg =
    secondaries.length > 0
      ? await placeProduct(bg, cutout, { width: 660, top: 130, left: 182 })
      : await placeProduct(bg, cutout, { width: 760, top: 120, left: 132 });

  let finalBuffer = await renderSatoriOverlay(origin, bg, {
    layout: "bottom-bar",
    productName: params.productName,
    price: params.price,
    phone: params.phone,
    industry: params.industry,
    accentGradient: { from: dir.palette.accent, to: shade(dir.palette.accent, -0.35) },
    businessName: params.businessName ?? null,
    logoBuffer: params.logoBuffer ?? null,
    creativeBrief: null,
    benefits: analysis?.sellingPoints ?? [],
  });

  if (secondaries.length > 0) {
    try {
      finalBuffer = await insetSecondaryPhotos(finalBuffer, secondaries, "bottom-bar", dir.palette.accent, params.productName);
    } catch {
      // vignettes indisponibles : l'affiche reste livrée
    }
  }
  return { finalBuffer, layout: "bottom-bar" };
}

