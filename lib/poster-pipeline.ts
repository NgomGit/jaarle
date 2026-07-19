import { compositeOverlay, finalizeJpeg } from "@/lib/image-compose";
import { removeBackground } from "@/lib/background-removal";
import { analyzeProduct, type ProductAnalysis } from "@/lib/product-analyzer";
import { checkPosterQuality, checkTextAccuracy } from "@/lib/quality-checker";
import { getIndustry } from "@/lib/knowledge/industries";
import { getRelevantEvents } from "@/lib/knowledge/events";
import { deliveryPhrasesFr, paymentPhrasesFr } from "@/lib/knowledge/business-practices";
import { getTierConfig, type Tier } from "@/lib/pricing";
import { ALLOWED_MEDIA_TYPES, type AllowedMediaType } from "@/lib/media-types";

export { ALLOWED_MEDIA_TYPES, type AllowedMediaType };

const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux.2-pro";

/**
 * "chooseBestModel()" : route vers le modèle le plus adapté au secteur. Choix de départ basé
 * sur le positionnement documenté de chaque modèle, vérifié par un test direct avant activation
 * (pas une comparaison A/B exhaustive, mais pas non plus une pure hypothèse) :
 * - FLUX.2 Pro : édition d'image forte, fidélité du produit de référence — défaut sûr.
 * - GPT Image 2 : très bon en mise en scène/ambiance narrative — vérifié sur "restaurant",
 *   résultat net (scène de cuisine chaleureuse, produit fidèle). Activé.
 * - Recraft V4.1 Pro : testé sur "furniture" — résultat raté (fond quasi blanc, flou, probable
 *   mésentente sur le paramètre resolution). PAS activé tant que ce n'est pas corrigé.
 */
const MODEL_BY_INDUSTRY: Record<string, string> = {
  restaurant: "openai/gpt-image-2",
  hotel: "openai/gpt-image-2",
  travel: "openai/gpt-image-2",
  events: "openai/gpt-image-2",
};

function chooseImageModel(industryKey: string | null): string {
  if (!industryKey) return DEFAULT_IMAGE_MODEL;
  return MODEL_BY_INDUSTRY[industryKey] ?? DEFAULT_IMAGE_MODEL;
}

export type LayoutVariant = "bottom-bar" | "side-panel";

/**
 * Bascule le gabarit du bandeau de texte pour éviter que toutes les affiches se ressemblent.
 * Le palier Basique reste toujours sur le gabarit le plus simple.
 */
function pickLayoutVariant(tier: Tier): LayoutVariant {
  if (tier === "basic") return "bottom-bar";
  return Math.random() < 0.5 ? "bottom-bar" : "side-panel";
}

export function getBenefitTags(industryKey: string | null): string[] {
  const industry = getIndustry(industryKey ?? undefined);
  if (industry) return industry.ctaExamples.slice(0, 2);
  return [deliveryPhrasesFr[0], paymentPhrasesFr[0]];
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
function getNegativeSpaceInstruction(tier: Tier, layout: LayoutVariant): string {
  if (layout === "side-panel") {
    return "Composition constraint: keep the left third of the frame visually calm and uncluttered — a dark text panel with the name, price and contact will be added there programmatically. Compose and frame the product mainly within the right two-thirds of the image.";
  }
  if (tier === "premium") {
    return "Composition constraint: keep the top-left corner (small badge), the top-right corner (two short benefit tags) and a generous strip along the bottom ~25% of the frame visually calm and uncluttered — marketing text, price and contact info will be added programmatically in those zones afterward.";
  }
  if (tier === "medium") {
    return "Composition constraint: keep the top-left corner (small badge) and a strip along the bottom ~20% of the frame visually calm and uncluttered — a name, price and contact pill will be added programmatically in those zones afterward.";
  }
  return "Composition constraint: keep a strip along the bottom ~15% of the frame visually calm and uncluttered — a name and price will be added programmatically in that zone afterward.";
}

/**
 * Prompt orchestrator ("Marketing Engine" + "Prompt Builder") : assemble l'analyse produit,
 * le secteur, la saison, les canaux de diffusion et l'espace réservé au texte en un brief de
 * directeur artistique. L'IA choisit elle-même le style, les couleurs et l'ambiance, mais en
 * s'appuyant sur des faits explicites (couleurs/matière du produit) plutôt qu'en devinant.
 */
function buildComposedPosterPrompt(params: {
  industryKey: string | null;
  tier: Tier;
  layout: LayoutVariant;
  isCutout: boolean;
  analysis: ProductAnalysis | null;
}): string {
  const industry = getIndustry(params.industryKey ?? undefined);
  const seasonalNote = getSeasonalVisualNote(new Date());

  const subjectLine = params.isCutout
    ? "You are given the product completely isolated on a transparent background — no original scene, no props, no distracting context. Everything visible in the reference image is the product itself."
    : "You are given a photo of the product in its original setting.";

  const analysisBlock = params.analysis
    ? `Product analysis (from a vision pass on the original photo):
- Category: ${params.analysis.category}
- Dominant colors: ${params.analysis.colors.join(", ")}
- Material / texture: ${params.analysis.material}
- Positioning: ${params.analysis.positioning}
- Distinctive detail: ${params.analysis.visualNotes}

Use this analysis to choose a background, palette and mood that genuinely complement these specific colors and materials — not a generic look.`
    : "";

  return `You are an award-winning advertising creative director specialized in premium commercial product photography and social media marketing for African markets.

${subjectLine}

Your task: design a complete, professional advertising visual around this exact product to sell it — as if shot and art-directed by a top-tier advertising agency.

Rules:
- The product shown is the absolute hero of the composition — preserve its exact colors, proportions, textures, and any text or logo already printed on it. Never redesign, restyle or reinterpret the product itself — no exceptions.
- Analyze the product's own colors, materials and character, and choose the visual style, mood, lighting and color palette that fits it best yourself. Don't default to one generic look — every product deserves a scene designed specifically for it.
- Always aim for: elegant, modern, attractive and very clean — never cluttered, never gimmicky, never a generic AI stock-photo look.
- Build a coherent, realistic professional environment around the product — proper lighting, depth, shadows and composition, using colors and materials that genuinely complement the product's own palette.
- Adapt the visual to the Senegalese / West African market while remaining internationally premium.

Avoid generic AI-background clichés: no draped fabric, no bedsheets or cloth backdrops, no floating pedestal wrapped in cloth, no plain pastel gradient with a soft cast shadow and nothing else. Build a genuine, specific scene appropriate to this product's category.

Do NOT include: text, logos other than what's already printed on the product, prices, numbers, watermarks, QR codes, buttons or UI elements.

${analysisBlock}

Category: ${industry ? `${industry.labelFr} — typical scene elements to draw inspiration from: ${industry.visualDirection}.` : "General Senegalese retail."}

Distribution channels: Facebook, Instagram and WhatsApp — the visual must read clearly even as a small thumbnail.
${seasonalNote ? `\n${seasonalNote}` : ""}
${getNegativeSpaceInstruction(params.tier, params.layout)}`;
}

/**
 * Étape "Image Generator" (+ "Upscaler" via la résolution demandée directement à la
 * génération, plutôt qu'un service de post-traitement séparé).
 */
async function generateComposedPoster(
  imageBase64: string,
  mediaType: AllowedMediaType,
  industryKey: string | null,
  tier: Tier,
  layout: LayoutVariant,
  isCutout: boolean,
  analysis: ProductAnalysis | null
) {
  try {
    const prompt = buildComposedPosterPrompt({ industryKey, tier, layout, isCutout, analysis });

    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chooseImageModel(industryKey),
        prompt,
        input_references: [{ type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } }],
        resolution: "2K",
        aspect_ratio: "1:1",
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
 */
export async function buildPosterBackground(
  photoBuffer: Buffer,
  photoBase64: string,
  mediaType: AllowedMediaType,
  productName: string,
  industry: string | null,
  tier: Tier
): Promise<{
  backgroundBuffer: Buffer;
  imageError: string | null;
  usedCutout: boolean;
  qualityRetried: boolean;
  layout: LayoutVariant;
  accentGradient: { from: string; to: string } | null;
}> {
  const layout = pickLayoutVariant(tier);

  const [analysis, cutoutOutcome] = await Promise.all([
    analyzeProduct(photoBase64, mediaType, productName),
    removeBackground(photoBuffer)
      .then((buf) => ({ ok: true as const, buf }))
      .catch((err) => ({ ok: false as const, err })),
  ]);

  const isCutout = cutoutOutcome.ok;
  const primaryImageBase64 = isCutout ? cutoutOutcome.buf.toString("base64") : photoBase64;
  const primaryMediaType: AllowedMediaType = isCutout ? "image/png" : mediaType;

  let genResult = await generateComposedPoster(primaryImageBase64, primaryMediaType, industry, tier, layout, isCutout, analysis);

  // Repli si le détourage a réussi mais que la composition IA échoue quand même : retente avec la photo brute.
  if (!genResult.imageBase64 && isCutout) {
    genResult = await generateComposedPoster(photoBase64, mediaType, industry, tier, layout, false, analysis);
  }

  let finalImageBase64 = genResult.imageBase64;
  let qualityRetried = false;

  if (finalImageBase64) {
    const { passed } = await checkPosterQuality(photoBase64, mediaType, finalImageBase64);
    if (!passed) {
      const retry = await generateComposedPoster(primaryImageBase64, primaryMediaType, industry, tier, layout, isCutout, analysis);
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
    usedCutout: isCutout,
    qualityRetried,
    layout,
    accentGradient: analysis?.accentGradient ?? null,
  };
}

interface FinalPosterParams {
  tier: Tier;
  layout: LayoutVariant;
  productName: string;
  price: number;
  phone: string;
  industry: string | null;
  accentGradient?: { from: string; to: string } | null;
}

/**
 * Filet de sécurité fiable : notre bandeau satori (texte garanti correct, car rendu par nous,
 * pas par un modèle génératif) composité sur le fond IA.
 */
async function renderSatoriOverlay(origin: string, backgroundBuffer: Buffer, params: FinalPosterParams): Promise<Buffer> {
  const tierConfig = getTierConfig(params.tier);
  const overlayUrl = new URL("/api/render-overlay", origin);
  overlayUrl.searchParams.set("tier", params.tier);
  overlayUrl.searchParams.set("layout", params.layout);
  overlayUrl.searchParams.set("productName", params.productName);
  overlayUrl.searchParams.set("price", params.price.toLocaleString("fr-FR"));
  overlayUrl.searchParams.set("phone", params.phone);
  overlayUrl.searchParams.set("badge", tierConfig.labelFr === "Basique" ? "" : tierConfig.labelFr);
  if (params.tier === "premium") {
    overlayUrl.searchParams.set("benefits", getBenefitTags(params.industry).join("|"));
  }
  if (params.accentGradient) {
    overlayUrl.searchParams.set("accentFrom", params.accentGradient.from);
    overlayUrl.searchParams.set("accentTo", params.accentGradient.to);
  }

  const overlayRes = await fetch(overlayUrl.toString());
  if (!overlayRes.ok) throw new Error("Échec du rendu de l'overlay.");
  const overlayBuffer = Buffer.from(await overlayRes.arrayBuffer());

  return compositeOverlay(backgroundBuffer, overlayBuffer);
}

/**
 * Demande à GPT Image 2 de dessiner directement la mise en page complète (texte, prix, contact,
 * badges, CTA) sur l'image déjà composée — au lieu d'un gabarit fixe qu'on superpose nous-mêmes.
 * Plus créatif et varié, mais le texte est produit par un modèle génératif, donc jamais garanti
 * exact : c'est à `checkTextAccuracy` de trancher si le résultat est fiable.
 */
async function generateTemplatedPoster(backgroundBuffer: Buffer, params: FinalPosterParams) {
  try {
    const tierConfig = getTierConfig(params.tier);
    const priceLabel = params.price.toLocaleString("fr-FR");
    const showContact = params.tier !== "basic" && !!params.phone;
    const benefits = params.tier === "premium" ? getBenefitTags(params.industry) : [];

    const requirements = [`Product name: "${params.productName}"`, `Price: "${priceLabel} FCFA"`];
    if (showContact) requirements.push(`WhatsApp contact: "${params.phone}"`);
    if (tierConfig.labelFr !== "Basique") requirements.push(`A small badge/tag reading "${tierConfig.labelFr}"`);
    if (params.tier === "premium" && benefits.length > 0) {
      requirements.push(`Up to two short benefit tags: ${benefits.join(" / ")}`);
    }
    if (params.tier === "premium") requirements.push(`A short call-to-action, e.g. "Commander sur WhatsApp"`);

    const prompt = `You are an award-winning advertising creative director. You are given a professional, already-composed product photo.

Add a complete, professional marketing poster layout on top of this exact image — do not alter the photo itself, only add design elements around/over it (badges, price tag, contact info, typography).

Text that MUST appear, spelled and written EXACTLY as given below (this is real business information — accuracy is critical, never invent, alter or truncate any digit or character):
${requirements.map((r) => `- ${r}`).join("\n")}

Design rules:
- Choose typography, color accents and layout that genuinely complement this specific image — elegant, modern, very clean, like a real advertising agency poster.
- Vary your layout choices creatively — don't default to a generic template.
- All the text above must be 100% accurate and fully legible — no other invented text, numbers or logos.
- Keep the product itself fully visible, not obstructed by text or UI elements.`;

    const backgroundBase64 = backgroundBuffer.toString("base64");
    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        input_references: [{ type: "image_url", image_url: { url: `data:image/png;base64,${backgroundBase64}` } }],
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
  const { imageBase64 } = await generateTemplatedPoster(backgroundBuffer, params);

  if (imageBase64) {
    const check = await checkTextAccuracy(imageBase64, {
      price: params.price.toLocaleString("fr-FR"),
      phone: params.tier !== "basic" ? params.phone : undefined,
      productName: params.productName,
    });
    if (check.passed) {
      const finalBuffer = await finalizeJpeg(Buffer.from(imageBase64, "base64"));
      return { finalBuffer, usedAiTemplate: true };
    }
  }

  const finalBuffer = await renderSatoriOverlay(origin, backgroundBuffer, params);
  return { finalBuffer, usedAiTemplate: false };
}
