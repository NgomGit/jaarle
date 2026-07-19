import { readFileSync } from "fs";
import path from "path";
import { compositeOverlay, finalizeJpeg, buildPlainBackground } from "@/lib/image-compose";
import { removeBackground } from "@/lib/background-removal";
import { analyzeProduct, analyzeLogoColors, type ProductAnalysis } from "@/lib/product-analyzer";
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
 * - FLUX.2 Pro : édition d'image forte, fidélité du produit de référence — défaut sûr, et
 *   nettement moins cher que GPT Image 2 (~$0.55 vs ~$0.886 par appel, coûts observés).
 * - GPT Image 2 : très bon en mise en scène/ambiance narrative — vérifié sur "restaurant",
 *   résultat net (scène de cuisine chaleureuse, produit fidèle). Activé, mais réservé au
 *   palier Premium : Basique et Medium doivent rester les plus accessibles possible, donc
 *   toujours sur FLUX.2 Pro quel que soit le secteur, pour un coût plancher prévisible.
 * - Recraft V4.1 Pro : testé sur "furniture" — résultat raté (fond quasi blanc, flou, probable
 *   mésentente sur le paramètre resolution). PAS activé tant que ce n'est pas corrigé.
 */
const MODEL_BY_INDUSTRY: Record<string, string> = {
  restaurant: "openai/gpt-image-2",
  hotel: "openai/gpt-image-2",
  travel: "openai/gpt-image-2",
  events: "openai/gpt-image-2",
};

function chooseImageModel(industryKey: string | null, tier: Tier): string {
  if (tier !== "premium") return DEFAULT_IMAGE_MODEL;
  if (!industryKey) return DEFAULT_IMAGE_MODEL;
  return MODEL_BY_INDUSTRY[industryKey] ?? DEFAULT_IMAGE_MODEL;
}

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
  electronics: { from: "#1E3A8A", to: "#0891B2" },
  furniture: { from: "#92400E", to: "#166534" },
  "real-estate": { from: "#1E3A5F", to: "#B45309" },
  automotive: { from: "#7F1D1D", to: "#1F2937" },
  grocery: { from: "#15803D", to: "#65A30D" },
  pharmacy: { from: "#0F766E", to: "#1D4ED8" },
  events: { from: "#7C3AED", to: "#B45309" },
  hotel: { from: "#0E7490", to: "#2563EB" },
  travel: { from: "#0D9488", to: "#EA580C" },
};

function getIndustryAccent(industryKey: string | null): { from: string; to: string } {
  return (industryKey && INDUSTRY_ACCENTS[industryKey]) || { from: "#6D5EF5", to: "#3B82F6" };
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
  customInstructions?: string | null;
}): string {
  const industry = getIndustry(params.industryKey ?? undefined);
  const seasonalNote = getSeasonalVisualNote(new Date());

  const subjectLine = params.isCutout
    ? "You are given the subject (a product, or something representing a service being offered — e.g. a vehicle, equipment, a person at work) completely isolated on a transparent background — no original scene, no props, no distracting context. Everything visible in the reference image is the subject itself."
    : "You are given a photo of the subject — a product, or something representing a service being offered (e.g. a vehicle, equipment, a person at work) — in its original setting.";

  const analysisBlock = params.analysis
    ? `Subject analysis (from a vision pass on the original photo):
- Category: ${params.analysis.category}
- Dominant colors: ${params.analysis.colors.join(", ")}
- Material / texture: ${params.analysis.material}
- Positioning: ${params.analysis.positioning}
- Distinctive detail: ${params.analysis.visualNotes}

Use this analysis to choose a background, palette and mood that genuinely complement these specific colors and materials — not a generic look.`
    : "";

  return `You are an award-winning advertising creative director specialized in premium commercial photography and social media marketing for African markets — for physical products as well as local services (e.g. car rental, cleaning services, car detailing).

${subjectLine}

Your task: design a complete, professional advertising visual around this exact subject to sell it — as if shot and art-directed by a top-tier advertising agency.

Rules:
- The subject shown is the absolute hero of the composition — preserve its exact colors, proportions, textures, and any text or logo already visible on it. Never redesign, restyle or reinterpret the subject itself — no exceptions.
- Analyze the subject's own colors, materials and character, and choose the visual style, mood, lighting and color palette that fits it best yourself. Don't default to one generic look — every subject deserves a scene designed specifically for it.
- Always aim for: elegant, modern, attractive and very clean — never cluttered, never gimmicky, never a generic AI stock-photo look.
- Build a coherent, realistic professional environment around the subject — proper lighting, depth, shadows and composition, using colors and materials that genuinely complement its own palette.
- Adapt the visual to the Senegalese / West African market while remaining internationally premium.

Avoid generic AI-background clichés: no draped fabric, no bedsheets or cloth backdrops, no floating pedestal wrapped in cloth, no plain pastel gradient with a soft cast shadow and nothing else. Build a genuine, specific scene appropriate to this subject's category.

Do NOT include: text, logos other than what's already visible on the subject, prices, numbers, watermarks, QR codes, buttons or UI elements.

${analysisBlock}

Category: ${industry ? `${industry.labelFr} — typical scene elements to draw inspiration from: ${industry.visualDirection}.` : "General Senegalese retail."}

Distribution channels: Facebook, Instagram and WhatsApp — the visual must read clearly even as a small thumbnail.
${seasonalNote ? `\n${seasonalNote}` : ""}
${getNegativeSpaceInstruction(params.tier, params.layout)}
${params.customInstructions ? `\nThe merchant asked for these specific changes compared to the previous version — prioritize honoring this request while still respecting the rules above (subject fidelity, no text/logos): "${params.customInstructions}"` : ""}`;
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
  analysis: ProductAnalysis | null,
  customInstructions?: string | null
) {
  try {
    const prompt = buildComposedPosterPrompt({ industryKey, tier, layout, isCutout, analysis, customInstructions });

    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chooseImageModel(industryKey, tier),
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
 *
 * Le contrôle qualité + la reprise (max 1) sont réservés au palier Premium : Basique et
 * Medium acceptent toujours la première génération, pour un coût prévisible et accessible.
 */
export async function buildPosterBackground(
  photoBuffer: Buffer,
  photoBase64: string,
  mediaType: AllowedMediaType,
  productName: string,
  industry: string | null,
  tier: Tier,
  customInstructions?: string | null
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

  let genResult = await generateComposedPoster(
    primaryImageBase64,
    primaryMediaType,
    industry,
    tier,
    layout,
    isCutout,
    analysis,
    customInstructions
  );

  // Repli si le détourage a réussi mais que la composition IA échoue quand même : retente avec la photo brute.
  if (!genResult.imageBase64 && isCutout) {
    genResult = await generateComposedPoster(photoBase64, mediaType, industry, tier, layout, false, analysis, customInstructions);
  }

  let finalImageBase64 = genResult.imageBase64;
  let qualityRetried = false;

  if (finalImageBase64 && tier === "premium") {
    const { passed } = await checkPosterQuality(photoBase64, mediaType, finalImageBase64);
    if (!passed) {
      const retry = await generateComposedPoster(
        primaryImageBase64,
        primaryMediaType,
        industry,
        tier,
        layout,
        isCutout,
        analysis,
        customInstructions
      );
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
    accentGradient: analysis?.accentGradient ?? getIndustryAccent(industry),
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
  tier: Tier;
  layout: LayoutVariant;
  serviceName: string;
  serviceDescription: string | null;
  serviceItems: string[];
  customInstructions?: string | null;
}): string {
  const industry = getIndustry(params.industryKey ?? undefined);
  const seasonalNote = getSeasonalVisualNote(new Date());
  const itemsLine = params.serviceItems.length
    ? `Items/offerings included in this service: ${params.serviceItems.join(", ")}.`
    : "";

  return `You are an award-winning advertising creative director specialized in premium marketing visuals for local services in Senegal / West Africa (e.g. car rental, cleaning services, car detailing).

There is no reference photo for this brief — imagine and compose an entirely original, professional advertising visual from scratch that convincingly represents this exact service.

Service: "${params.serviceName}"
${params.serviceDescription ? `Description: ${params.serviceDescription}` : ""}
${itemsLine}

Rules:
- Depict a realistic, specific, professional scene that genuinely evokes this exact service being performed or its result — never a generic stock-photo cliché. Draw inspiration from the category and the details given above.
- Always aim for: elegant, modern, attractive and very clean — never cluttered, never gimmicky.
- Adapt the visual to the Senegalese / West African market while remaining internationally premium.
- Do NOT include: text, logos, prices, numbers, watermarks, QR codes, buttons or UI elements — those are added separately.

Category: ${industry ? `${industry.labelFr} — typical scene elements to draw inspiration from: ${industry.visualDirection}.` : "General local service."}

Distribution channels: Facebook, Instagram and WhatsApp — the visual must read clearly even as a small thumbnail.
${seasonalNote ? `\n${seasonalNote}` : ""}
${getNegativeSpaceInstruction(params.tier, params.layout)}
${params.customInstructions ? `\nThe merchant asked for these specific changes compared to the previous version: "${params.customInstructions}"` : ""}`;
}

async function generateServiceImage(params: {
  serviceName: string;
  serviceDescription: string | null;
  serviceItems: string[];
  industryKey: string | null;
  tier: Tier;
  layout: LayoutVariant;
  customInstructions?: string | null;
}) {
  try {
    const prompt = buildServicePosterPrompt(params);

    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chooseImageModel(params.industryKey, params.tier),
        prompt,
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
  tier: Tier,
  customInstructions?: string | null
): Promise<{
  backgroundBuffer: Buffer;
  imageError: string | null;
  layout: LayoutVariant;
  accentGradient: { from: string; to: string } | null;
}> {
  const layout = pickLayoutVariant(tier);
  const genResult = await generateServiceImage({
    serviceName,
    serviceDescription,
    serviceItems,
    industryKey: industry,
    tier,
    layout,
    customInstructions,
  });

  const accentGradient = getIndustryAccent(industry);
  const backgroundBuffer = genResult.imageBase64
    ? Buffer.from(genResult.imageBase64, "base64")
    : await buildPlainBackground(accentGradient);

  return { backgroundBuffer, imageError: genResult.imageError, layout, accentGradient };
}

interface FinalPosterParams {
  tier: Tier;
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
  overlayUrl.searchParams.set("price", params.price != null ? `${params.price.toLocaleString("fr-FR")} FCFA` : "Sur devis");
  overlayUrl.searchParams.set("phone", params.phone);
  overlayUrl.searchParams.set("badge", tierConfig.labelFr === "Basique" ? "" : tierConfig.labelFr);
  if (params.tier === "premium") {
    const benefits =
      params.serviceItems && params.serviceItems.length > 0 ? params.serviceItems.slice(0, 3) : getBenefitTags(params.industry);
    overlayUrl.searchParams.set("benefits", benefits.join("|"));
  }
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
 * badges, CTA) sur l'image déjà composée — au lieu d'un gabarit fixe qu'on superpose nous-mêmes.
 * Plus créatif et varié, mais le texte est produit par un modèle génératif, donc jamais garanti
 * exact : c'est à `checkTextAccuracy` de trancher si le résultat est fiable.
 *
 * Exclusivement réservée au palier Premium (`renderFinalPoster` court-circuite Basique et
 * Medium vers le bandeau satori) — c'est le palier "effet waouh", celui où l'investissement
 * GPT Image 2 se justifie et où le design doit vraiment impressionner.
 */
const JAARLE_LOGO_PATH = path.join(process.cwd(), "public/images/logo-icon.png");

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
    if (showContact) requirements.push(`WhatsApp contact: "${params.phone}"`);
    if (params.businessName) requirements.push(`Business name: "${params.businessName}"`);
    requirements.push(`A small badge/tag reading "Premium"`);
    requirements.push(`A short call-to-action, e.g. "Commander sur WhatsApp"`);

    const hasServiceItems = !!params.serviceItems && params.serviceItems.length > 0;

    const creativeBenefitsInstruction = hasServiceItems
      ? `\n\nBenefit tags: the merchant specifically listed these as what this service includes — use them (pick the best 3 if there are more) as the benefit tags on the poster: ${params.serviceItems!.join(", ")}. You may lightly polish the wording for a clean, professional look (capitalize, tighten phrasing, remove redundancy) but do NOT invent different tags or change their meaning — these are the merchant's real offerings, not generic filler.`
      : `\n\nBenefit tags: choose up to 3 short, compelling benefit or selling-point tags yourself — whatever best fits THIS specific product and would genuinely attract customers in Senegal (delivery, guarantee, payment options, exclusivity, craftsmanship, style appeal...). You decide the exact wording and how many (1 to 3) — don't default to generic filler.${industry ? ` For inspiration only, not mandatory — typical angles for "${industry.labelFr}": ${industry.ctaExamples.join(", ")}.` : ""}`;

    const hasMerchantLogo = !!params.logoBuffer;

    const merchantLogoInstruction = hasMerchantLogo
      ? `\n\nBrand logo: a second reference image is provided — the merchant's own business logo. Place it tastefully as a real brand mark on the poster (e.g. a corner, near the CTA, or integrated into the layout) — clearly visible and legible, but not dominating the product.`
      : "";

    const customInstructionsBlock = params.customInstructions
      ? `\n\nThe merchant asked for these specific changes compared to the previous version — prioritize honoring this request while still respecting the accuracy rules below: "${params.customInstructions}"`
      : "";

    // Le placement n'est PAS laissé au libre choix du modèle : sans contrainte explicite, GPT
    // Image 2 converge presque toujours vers la même composition (texte à gauche/en bas). On
    // impose le gabarit déjà tiré au hasard en amont pour garantir une vraie variété 50/50.
    const layoutInstruction =
      params.layout === "side-panel"
        ? `Layout (mandatory, this is a deliberate art-direction choice — follow it exactly): place the product name, price, contact and CTA in a solid or dark panel occupying roughly the LEFT THIRD of the frame, vertically stacked. Compose and frame the product within the RIGHT two-thirds of the image, not centered.`
        : `Layout (mandatory, this is a deliberate art-direction choice — follow it exactly): place the product name, price, contact and CTA in a horizontal band along the BOTTOM of the frame (roughly the bottom quarter). Keep the product the main focus of the upper two-thirds.`;

    // Sans direction de couleur explicite, le modèle retombe souvent sur une teinte neutre/beige
    // par défaut. On lui impose la palette déjà calculée (logo du marchand si disponible, sinon
    // l'analyse du produit, sinon une teinte propre au secteur) pour une vraie diversité visuelle.
    let accent = params.accentGradient ?? null;
    if (hasMerchantLogo && params.logoBuffer) {
      const logoAccent = await analyzeLogoColors(params.logoBuffer.toString("base64"));
      if (logoAccent) accent = logoAccent;
    }
    const colorInstruction = accent
      ? `\n\nColor palette (mandatory): use this exact 2-color accent for badges, the CTA button and typography highlights — ${accent.from} to ${accent.to}. This was chosen specifically for this ${hasMerchantLogo ? "merchant's brand" : "product/service"} — do NOT default to a generic neutral, beige or pastel scheme instead.`
      : "";

    const toneInstruction = industry ? `\n\nOverall tone to match this category: ${industry.toneHint}` : "";

    const prompt = `You are an award-winning advertising creative director designing the flagship, top-of-the-line tier of this product — the client paid a premium price specifically for a breathtaking result, and expects it to look like it came from a top international ad agency, not a template. You are given a professional, already-composed product photo${hasMerchantLogo ? " as the first reference image" : ""}.

Add a complete, professional marketing poster layout on top of this exact image — do not alter the photo itself, only add design elements around/over it (badges, price tag, contact info, typography).

This must be genuinely stunning — the kind of visual that stops someone mid-scroll on Instagram, not a safe or generic composition. Take a bold, memorable creative risk: striking typography, a considered color story, confident use of space. Never settle for "good enough."
${layoutInstruction}
${colorInstruction}
${toneInstruction}

Text that MUST appear, spelled and written EXACTLY as given below (this is real business information — accuracy is critical, never invent, alter or truncate any digit or character):
${requirements.map((r) => `- ${r}`).join("\n")}
${creativeBenefitsInstruction}
${merchantLogoInstruction}
${customInstructionsBlock}

Design rules:
- Choose typography and finer layout details that genuinely complement this specific image — elegant, modern, magazine-cover quality, like a real advertising agency poster — while strictly respecting the mandatory layout and color palette above.
- All the text listed above as "MUST appear" must be 100% accurate and fully legible.
- Do not add any other invented text, numbers or logos beyond what's explicitly requested above.
- Keep the product itself fully visible, not obstructed by text or UI elements.`;

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
 *
 * Seul le palier Premium appelle GPT Image 2 pour cette étape — c'est le palier "effet waouh",
 * celui où l'investissement se justifie. Basique et Medium restent tous les deux sur le bandeau
 * satori (fiable, gratuit à générer) pour rester les plus accessibles possible : Basique avec
 * le logo Jaarle en filigrane, Medium sans logo (pas de marque à afficher à ce palier).
 */
export async function renderFinalPoster(
  origin: string,
  backgroundBuffer: Buffer,
  params: FinalPosterParams
): Promise<{ finalBuffer: Buffer; usedAiTemplate: boolean }> {
  if (params.tier === "basic") {
    const jaarleLogo = readFileSync(JAARLE_LOGO_PATH);
    const finalBuffer = await renderSatoriOverlay(origin, backgroundBuffer, { ...params, logoBuffer: jaarleLogo });
    return { finalBuffer, usedAiTemplate: false };
  }

  if (params.tier === "medium") {
    const finalBuffer = await renderSatoriOverlay(origin, backgroundBuffer, params);
    return { finalBuffer, usedAiTemplate: false };
  }

  const { imageBase64 } = await generateTemplatedPoster(backgroundBuffer, params);

  if (imageBase64) {
    const check = await checkTextAccuracy(imageBase64, {
      price: params.price != null ? params.price.toLocaleString("fr-FR") : undefined,
      phone: params.phone || undefined,
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
