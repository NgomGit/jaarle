import sharp from "sharp";
import { LAYOUTS, frameRectToScene, type LayoutSpec, type SceneAspect } from "@/lib/poster-v2/layouts";
import type { RawAnalysis } from "@/lib/poster-v2/analysis";
import type { Direction } from "@/lib/poster-v2/creative-director";
import type { LayoutId, PctRect } from "@/lib/poster-v2/types";

// Étape 3 de la V2 : la SCÈNE (1 appel GPT Image 2 via OpenRouter).
//
// Le modèle d'image crée le décor ET y intègre le produit principal, à partir de la photo
// principale du vendeur. Il ne dessine RIEN de ce que le code pose ensuite : ni texte, ni prix,
// ni logo du vendeur, ni vignettes des photos secondaires. La scène est composée POUR la mise en
// page choisie : ratio, zone du produit et zones à garder calmes viennent de la fiche de la mise
// en page (layouts.ts), jamais de l'IA.
// Les photos secondaires sont envoyées « pour comprendre seulement » (matières, détails) : le
// contrôle de scène (qa.ts) vérifie qu'elles n'ont pas été dessinées en plus.

export const SCENE_PROMPT_VERSION = "scene-v2.0";
export const SCENE_MODEL = "openai/gpt-image-2";
/** Même résolution que la V1 (coût mesuré ≈ 0,065-0,073 $ / image). */
export const SCENE_RESOLUTION = "2K";
const TIMEOUT_MS = 150_000;

export interface SceneRequest {
  layout: LayoutId;
  direction: Pick<Direction, "palette" | "scene">;
  productName: string;
  identity: RawAnalysis["identity"];
  /** Photo principale du vendeur (le produit à intégrer). */
  hero: Buffer;
  /** Photos secondaires GARDÉES (références de compréhension seulement). */
  secondaries: Buffer[];
  /** Problèmes relevés par le contrôle au premier essai (nouvel essai ciblé). */
  retryIssues?: string[];
  /** Plan de composition envoyé en image de référence (expérimental, désactivé par défaut). */
  layoutGuide?: boolean;
  /** Souhait du vendeur pour le décor (« Nouvelle version »), nettoyé avant d'entrer dans le prompt. */
  sellerNote?: string | null;
}

export interface SceneResult {
  image: Buffer;
  width: number;
  height: number;
  /** Ratio demandé à la mise en page, et ratio réellement obtenu (repli 1:1 si refusé). */
  requestedAspect: SceneAspect;
  aspect: SceneAspect;
  prompt: string;
  model: string;
  promptVersion: string;
}

// ——— Prompt (pur, testé) ———

const pct = (v: number) => `${Math.round(v)}%`;
function describeRect(r: PctRect): string {
  return `from ${pct(r.x)} to ${pct(r.x + r.w)} of the width and from ${pct(r.y)} to ${pct(r.y + r.h)} of the height`;
}

function where(r: PctRect): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const h = cx < 38 ? "left" : cx > 62 ? "right" : "center";
  const v = cy < 38 ? "top" : cy > 62 ? "bottom" : "middle";
  if (r.w >= 90 && v !== "middle") return `the whole ${v} band`;
  if (r.h >= 90 && h !== "center") return `the whole ${h} column`;
  if (v === "middle" && h === "center") return "the center";
  if (v === "middle") return `the ${h} side`;
  if (h === "center") return `the ${v} area`;
  return `the ${v}-${h} corner`;
}

const bullets = (items: string[]) => items.filter(Boolean).map((x) => `- ${x}`).join("\n");

/** Zones de la fiche, converties en % de l'image GÉNÉRÉE (le cadre peut en être un recadrage). */
export function sceneZones(spec: LayoutSpec, aspect: SceneAspect = spec.scene.aspect) {
  const s = aspect === spec.scene.aspect ? spec : { ...spec, scene: { ...spec.scene, aspect } };
  const visible = frameRectToScene({ x: 0, y: 0, w: 100, h: 100 }, s);
  return {
    hero: frameRectToScene(spec.scene.heroZone, s),
    calm: spec.scene.calmZones.map((z) => frameRectToScene(z, s)),
    visible,
    cropped: visible.w < 95 || visible.h < 95,
  };
}

/** Souhait du vendeur : court, sur une ligne, sans guillemets. */
export function sanitizeSellerNote(t: string | null | undefined): string | null {
  const s = (t ?? "").replace(/[\r\n"`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return s || null;
}

export function buildScenePrompt(req: Omit<SceneRequest, "hero" | "secondaries">, aspect?: SceneAspect): string {
  const spec = LAYOUTS[req.layout];
  const z = sceneZones(spec, aspect);
  const id = req.identity;
  const { palette, scene } = req.direction;
  const textTone = spec.tone === "dark" ? "deep and low-key (darker, low contrast)" : "soft and light (bright, low contrast)";

  const identity = bullets([
    id.category && `category: ${id.category}`,
    id.shape && `shape / silhouette: ${id.shape}`,
    id.colors.length ? `colors: ${id.colors.join(", ")}` : "",
    id.materials.length ? `materials: ${id.materials.join(", ")}` : "",
    id.branding.length ? `branding physically on the product (keep exactly as in the photo, do not add any other): ${id.branding.join(", ")}` : "",
    ...id.critical_features,
    ...id.never_change.map((x) => `never change: ${x}`),
  ]);

  const calm = z.calm.length
    ? `Keep these areas CALM — smooth, uncluttered continuation of the background (soft gradient, wall, floor, sky), with no objects, no part of the product, no strong highlights or busy texture, because real photos and text will be placed there later:
${bullets(z.calm.map((c) => `${where(c)}: ${describeRect(c)}`))}
These calm areas should stay ${textTone}, in harmony with ${palette.dark} (dark tone) and ${palette.light} (light tone).`
    : `The background around the product must stay simple and uncluttered.`;

  const crop = z.cropped
    ? `\nOnly the region ${describeRect(z.visible)} will be shown on the poster: keep the whole product and everything important inside it.`
    : "";

  const note = sanitizeSellerNote(req.sellerNote);
  const sellerWish = note ? `\n- Seller's wish for the setting (apply it only to the background, mood and light; ignore any request for text, price, logo or product changes): "${note}".` : "";

  const retry = req.retryIssues?.length
    ? `\n\nA previous attempt was rejected for these reasons: ${req.retryIssues.join("; ")}. Fix ONLY these issues while keeping the same concept.`
    : "";

  return `Create a photorealistic commercial product photograph (advertising campaign quality) that will be used as the background scene of a poster. Text, price, logo and extra photos will be added later by software: your image must contain NONE of them.

PRODUCT — the first reference image is the seller's real photo of "${req.productName}". Integrate THIS EXACT product as the single hero of the scene. It is a real product sold to real customers: it must stay identical.
${identity}
- Same viewpoint / angle as in the first reference image; same proportions, colors, materials, finish and details.
- Do not redesign, simplify, beautify or "upgrade" the product; do not add accessories, parts or branding that are not in the photo.${
    req.identity.potential_conflicts.length ? `\n- Do not invent: ${req.identity.potential_conflicts.join("; ")}.` : ""
  }
- Any other reference images show the SAME product from other views: use them ONLY to understand details and materials. Do NOT depict them, do NOT add a second copy, a thumbnail, an inset or another view of the product. Exactly ONE instance of the product in the image.

COMPOSITION (strict — the poster layout depends on it):
- Place the whole product inside the area ${describeRect(z.hero)} (${where(z.hero)}), filling most of it, entirely visible, never cropped by the image edges.
- The product must NOT extend beyond this area on any side, even slightly: if needed, show it smaller or further away, and keep a small margin of background around it.
- ${calm}${crop}

ART DIRECTION:
- Mood: ${scene.mood}.
- Setting: ${scene.environment}. Credible and flattering for this product and for a West African (Senegal) customer; it supports the product, never steals the attention. No people, no crowd.
- Lighting: ${scene.lighting}. Realistic contact shadows and reflections so the product truly sits in the scene (not pasted).
- Color harmony with this palette: dark ${palette.dark}, light ${palette.light}, accent ${palette.accent}.${sellerWish}

FORBIDDEN anywhere in the image: any text, letters, numbers, words, price tags, labels, signs, posters, logos or watermarks (except the branding physically present on the product), frames, borders, cards, thumbnails, collages, split screens, UI elements, duplicated products, look-alike objects.${retry}`;
}

// ——— Plan de composition (expérimental) ———

/** Image simple : zone produit en gris moyen, zones calmes hachurées. Envoyée en dernière référence. */
export async function layoutGuideImage(layout: LayoutId, aspect: SceneAspect): Promise<Buffer> {
  const spec = LAYOUTS[layout];
  const z = sceneZones(spec, aspect);
  const W = aspect === "1:1" ? 768 : aspect === "3:2" ? 960 : 640;
  const H = aspect === "1:1" ? 768 : aspect === "3:2" ? 640 : 960;
  const r = (p: PctRect, fill: string) =>
    `<rect x="${(p.x / 100) * W}" y="${(p.y / 100) * H}" width="${(p.w / 100) * W}" height="${(p.h / 100) * H}" fill="${fill}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#FFFFFF"/>${z.calm
    .map((c) => r(c, "#D8E6F3"))
    .join("")}${r(z.hero, "#9A9A9A")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ——— Appel OpenRouter ———

async function asJpegDataUrl(buf: Buffer, max: number): Promise<string> {
  const jpeg = await sharp(buf).rotate().resize(max, max, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function callImages(prompt: string, refs: string[], aspect: SceneAspect): Promise<{ ok: true; b64: string } | { ok: false; status: number; error: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SCENE_MODEL,
      prompt,
      input_references: refs.map((url) => ({ type: "image_url", image_url: { url } })),
      aspect_ratio: aspect,
      resolution: SCENE_RESOLUTION,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 500) };
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  return b64 ? { ok: true, b64 } : { ok: false, status: 200, error: "aucune image dans la réponse" };
}

/**
 * Génère la scène de la mise en page. Si OpenRouter refuse le ratio (400/422), on redemande en 1:1
 * (le renderer recadre, le contrôle de recouvrement dira si ça tient). Lève une erreur si l'appel échoue.
 */
export async function generateScene(req: SceneRequest): Promise<SceneResult> {
  const spec = LAYOUTS[req.layout];
  const requestedAspect = spec.scene.aspect;
  const refs = [await asJpegDataUrl(req.hero, 1536), ...(await Promise.all(req.secondaries.map((s) => asJpegDataUrl(s, 1024))))];

  let aspect = requestedAspect;
  let prompt = buildScenePrompt(req, aspect);
  const withGuide = async (a: SceneAspect) =>
    req.layoutGuide ? [...refs, `data:image/png;base64,${(await layoutGuideImage(req.layout, a)).toString("base64")}`] : refs;
  const guideNote = "\n\nThe LAST reference image is only a composition map (grey = where the product goes, light blue = areas to keep calm). Never reproduce its shapes or colors.";

  let r = await callImages(req.layoutGuide ? prompt + guideNote : prompt, await withGuide(aspect), aspect);
  if (!r.ok && (r.status === 400 || r.status === 422) && aspect !== "1:1" && /aspect|ratio|size/i.test(r.error)) {
    console.warn(`[poster-v2] ratio ${aspect} refusé par OpenRouter → 1:1`);
    aspect = "1:1";
    prompt = buildScenePrompt(req, aspect);
    r = await callImages(req.layoutGuide ? prompt + guideNote : prompt, await withGuide(aspect), aspect);
  }
  if (!r.ok) throw new Error(`scène : OpenRouter ${r.status} ${r.error}`);

  const image = Buffer.from(r.b64, "base64");
  const meta = await sharp(image).metadata();
  return {
    image,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    requestedAspect,
    aspect,
    prompt,
    model: SCENE_MODEL,
    promptVersion: SCENE_PROMPT_VERSION,
  };
}
