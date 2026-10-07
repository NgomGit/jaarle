import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import type { AllowedMediaType } from "@/lib/media-types";
import type { ProductAnalysis } from "@/lib/product-analyzer";
import { MIN_SHARPNESS, sharpness } from "@/lib/poster-v2/photos";
import type { PctRect, SecondaryRole } from "@/lib/poster-v2/types";

// Étape 1 de la V2 : analyse des photos du vendeur (1 appel Sonnet pour toutes les photos), puis
// PORTE DE SÉCURITÉ en code. L'IA décrit ; le code décide quelles photos sont utilisées.
//
// Règles (architecture validée, section F.1) :
//  - identité incertaine (confiance < 0,8) ou analyse en échec → repli V1 1 photo ;
//  - une photo secondaire n'est gardée que si : même produit, confiance ≥ 0,85, qualité ≥ 0,45,
//    rôle utile, nette, assez grande, et pas un doublon de la photo principale ;
//  - aucune photo secondaire gardée → repli V1 1 photo (l'analyse reste réutilisable) ;
//  - jamais de photo secondaire non vérifiée.
// N'utilise pas lib/multi-reference.ts (chemin V1, inchangé).

export const ANALYSIS_PROMPT_VERSION = "ref-v2.0";
export const ANALYSIS_MODEL = "claude-sonnet-5";

export const MIN_IDENTITY_CONFIDENCE = 0.8;
export const MIN_PHOTO_CONFIDENCE = 0.85;
export const MIN_PHOTO_QUALITY = 0.45;
/** Plus petit côté utile d'une photo secondaire (px). */
export const MIN_SHORT_SIDE = 360;
/** Distance de Hamming (dHash 64 bits) en dessous de laquelle deux photos sont des doublons. */
export const DUPLICATE_HASH_DISTANCE = 6;
/** Au plus 2 photos secondaires affichées (mises en page retenues). */
export const MAX_SECONDARIES = 2;

export type AnalysisImage = { buffer: Buffer; mediaType: AllowedMediaType };

/** Cases d'une grille 3 × 3 (1 = haut-gauche … 9 = bas-droite) : bien plus fiable que des coordonnées libres. */
const CELLS = z.array(z.number().int());
const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const PhotoSchema = z.object({
  index: z.number().int(),
  role: z.enum(["hero", "detail", "alternate_angle", "usage", "texture", "irrelevant"]),
  same_subject: z.boolean(),
  confidence: z.number(),
  quality: z.number(),
  quality_issues: z.array(z.string()),
  framing: z.enum(["whole_product", "partial", "close_up"]),
  has_person: z.boolean(),
  subject_cells: CELLS,
  caption: z.string(),
  focus_cells: CELLS,
});

const RawAnalysisSchema = z.object({
  subject_type: z.enum(["product", "service"]),
  identity_confidence: z.number(),
  main_image_index: z.number().int(),
  photos: z.array(PhotoSchema),
  identity: z.object({
    category: z.string(),
    shape: z.string(),
    colors: z.array(z.string()),
    materials: z.array(z.string()),
    branding: z.array(z.string()),
    distinctive_details: z.array(z.string()),
    critical_features: z.array(z.string()),
    never_change: z.array(z.string()),
    potential_conflicts: z.array(z.string()),
  }),
  positioning: z.enum(["entrée de gamme", "milieu de gamme", "premium / haut de gamme"]),
  visual_notes: z.string(),
  accent_gradient: z.object({ from: HEX_COLOR, to: HEX_COLOR }),
  selling_points: z.array(z.string()),
});

export type RawAnalysis = z.infer<typeof RawAnalysisSchema>;
export type RawPhoto = z.infer<typeof PhotoSchema>;

/** Mesures locales d'une photo (sans IA). */
export interface LocalPhotoMetrics {
  width: number;
  height: number;
  sharpness: number;
  /** dHash 64 bits (hex). */
  hash: string;
}

export type ExclusionReason =
  | "autre_produit"
  | "confiance_basse"
  | "qualite_insuffisante"
  | "floue"
  | "trop_petite"
  | "doublon"
  | "non_analysee"
  | "inutile"
  | "en_trop";

export interface KeptSecondary {
  index: number;
  role: SecondaryRole;
  caption: string;
  /** Zone à garder au recadrage, en % de la photo. */
  focus: PctRect;
  quality: number;
  hasPerson: boolean;
  /** La photo montre le produit entier (vue d'ensemble) : se lit mal dans une petite case. */
  wholeProduct: boolean;
}

export interface PhotoRecord {
  index: number;
  role: RawPhoto["role"] | "hero";
  same_subject: boolean;
  confidence: number;
  quality: number;
  framing: RawPhoto["framing"];
  subject_bbox: PctRect;
  focus_bbox: PctRect;
  caption: string;
  width: number;
  height: number;
  sharpness: number;
  used: boolean;
  excluded_reason?: ExclusionReason;
}

export type GateResult =
  | {
      ok: true;
      heroIndex: number;
      heroQuality: number;
      /** Où se trouve le produit dans la photo principale (% ). */
      heroBox: PctRect;
      secondaries: KeptSecondary[];
      excluded: { index: number; reason: ExclusionReason }[];
      record: AnalysisRecord;
    }
  | {
      ok: false;
      reason: "analyse_en_echec" | "identite_incertaine" | "aucune_photo_secondaire" | "une_seule_photo";
      heroIndex: number;
      excluded: { index: number; reason: ExclusionReason }[];
      /** Analyse réutilisable par la V1 (évite un 2e appel) ; null si l'identité est douteuse. */
      productAnalysis: ProductAnalysis | null;
      record: AnalysisRecord | null;
    };

/** Ce qui est enregistré dans `creations.design.analysis`. */
export interface AnalysisRecord {
  model: string;
  prompt_version: string;
  identity_confidence: number;
  photos: PhotoRecord[];
  identity: RawAnalysis["identity"];
  selling_points: string[];
  positioning: RawAnalysis["positioning"];
}

// ——— Mesures locales ———

/** dHash 64 bits : empreinte de la structure de l'image (robuste au redimensionnement). */
export async function dHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let v = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (v) {
      d += v & 1;
      v >>= 1;
    }
  }
  return d;
}

export async function localMetrics(buffer: Buffer): Promise<LocalPhotoMetrics> {
  const meta = await sharp(buffer).rotate().metadata();
  // Après rotation EXIF, largeur / hauteur peuvent être inversées.
  const swap = (meta.orientation ?? 1) >= 5;
  return {
    width: (swap ? meta.height : meta.width) ?? 0,
    height: (swap ? meta.width : meta.height) ?? 0,
    sharpness: await sharpness(buffer),
    hash: await dHash(buffer),
  };
}

// ——— Normalisation ———

/** Rectangle en % borné à la photo, avec une taille minimale (sinon : photo entière). */
export function sanitizeBox(b: { x: number; y: number; w: number; h: number } | null | undefined, minSize = 8): PctRect {
  const full = { x: 0, y: 0, w: 100, h: 100 };
  if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return full;
  // Certains modèles répondent en 0-1 : on remet à l'échelle.
  const scale = b.x <= 1 && b.y <= 1 && b.w <= 1 && b.h <= 1 ? 100 : 1;
  const x = Math.min(100, Math.max(0, b.x * scale));
  const y = Math.min(100, Math.max(0, b.y * scale));
  const w = Math.min(100 - x, Math.max(0, b.w * scale));
  const h = Math.min(100 - y, Math.max(0, b.h * scale));
  if (w < minSize || h < minSize) return full;
  return { x: r1(x), y: r1(y), w: r1(w), h: r1(h) };
}

/**
 * Cases 1-9 d'une grille 3 × 3 → plus petit rectangle (en %) qui les contient. Cases invalides
 * ignorées ; aucune case valide → photo entière.
 */
export function cellsToBox(cells: number[] | null | undefined): PctRect {
  const valid = (cells ?? []).filter((c) => Number.isInteger(c) && c >= 1 && c <= 9);
  if (!valid.length) return { x: 0, y: 0, w: 100, h: 100 };
  const cols = valid.map((c) => (c - 1) % 3);
  const rows = valid.map((c) => Math.floor((c - 1) / 3));
  const x0 = Math.min(...cols);
  const x1 = Math.max(...cols) + 1;
  const y0 = Math.min(...rows);
  const y1 = Math.max(...rows) + 1;
  const third = 100 / 3;
  return { x: r1(x0 * third), y: r1(y0 * third), w: r1((x1 - x0) * third), h: r1((y1 - y0) * third) };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

const DEFAULT_CAPTION: Record<SecondaryRole, string> = {
  detail: "Détail",
  alternate_angle: "Autre vue",
  usage: "En situation",
  texture: "Matière",
};

/** Légende courte (≤ 3 mots, ≤ 22 caractères), majuscule initiale ; sinon libellé par défaut du rôle. */
export function sanitizeCaption(raw: string | null | undefined, role: SecondaryRole): string {
  const t = (raw ?? "")
    .replace(/["«»“”.!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > 22 || t.split(" ").length > 3) return DEFAULT_CAPTION[role];
  return t.charAt(0).toLocaleUpperCase("fr") + t.slice(1);
}

/** Ordre d'utilité des rôles pour l'affiche. */
const ROLE_PRIORITY: Record<SecondaryRole, number> = { detail: 0, texture: 1, usage: 2, alternate_angle: 3 };

// ——— Porte de sécurité (pure, testée) ———

export function applyGate(
  raw: RawAnalysis | null,
  metrics: LocalPhotoMetrics[],
  opts: { heroFixed: boolean }
): GateResult {
  const n = metrics.length;
  if (!raw) {
    return { ok: false, reason: "analyse_en_echec", heroIndex: 0, excluded: [], productAnalysis: null, record: null };
  }
  const aiHero = raw.main_image_index;
  const heroIndex = opts.heroFixed || !Number.isInteger(aiHero) || aiHero < 0 || aiHero >= n ? 0 : aiHero;
  const byIndex = new Map<number, RawPhoto>();
  for (const p of raw.photos) if (Number.isInteger(p.index) && p.index >= 0 && p.index < n && !byIndex.has(p.index)) byIndex.set(p.index, p);

  const identityConfidence = clamp01(raw.identity_confidence);
  const excluded: { index: number; reason: ExclusionReason }[] = [];
  const candidates: (KeptSecondary & { rank: number })[] = [];
  const photos: PhotoRecord[] = [];

  for (let i = 0; i < n; i++) {
    const p = byIndex.get(i);
    const m = metrics[i];
    const rec: PhotoRecord = {
      index: i,
      role: i === heroIndex ? "hero" : (p?.role ?? "irrelevant"),
      same_subject: p?.same_subject ?? false,
      confidence: clamp01(p?.confidence ?? 0),
      quality: clamp01(p?.quality ?? 0),
      framing: p?.framing ?? "whole_product",
      subject_bbox: cellsToBox(p?.subject_cells),
      focus_bbox: cellsToBox(p?.focus_cells),
      caption: "",
      width: m.width,
      height: m.height,
      sharpness: Math.round(m.sharpness * 10) / 10,
      used: i === heroIndex,
    };
    photos.push(rec);
    if (i === heroIndex) continue;

    let reason: ExclusionReason | null = null;
    if (!p) reason = "non_analysee";
    else if (!p.same_subject) reason = "autre_produit";
    else if (p.role === "irrelevant" || p.role === "hero") reason = "inutile";
    else if (rec.confidence < MIN_PHOTO_CONFIDENCE) reason = "confiance_basse";
    else if (rec.quality < MIN_PHOTO_QUALITY) reason = "qualite_insuffisante";
    else if (m.sharpness < MIN_SHARPNESS) reason = "floue";
    else if (Math.min(m.width, m.height) < MIN_SHORT_SIDE) reason = "trop_petite";
    else if (hammingHex(m.hash, metrics[heroIndex].hash) <= DUPLICATE_HASH_DISTANCE) reason = "doublon";
    if (reason) {
      rec.excluded_reason = reason;
      excluded.push({ index: i, reason });
      continue;
    }

    const role = p!.role as SecondaryRole;
    // Détail / matière : on cadre sur la zone utile ; vue d'ensemble / situation : sur le sujet.
    const focus = role === "detail" || role === "texture" ? rec.focus_bbox : rec.subject_bbox;
    rec.caption = sanitizeCaption(p!.caption, role);
    candidates.push({
      index: i,
      role,
      caption: rec.caption,
      focus,
      quality: rec.quality,
      hasPerson: p!.has_person,
      wholeProduct: p!.framing === "whole_product",
      rank: ROLE_PRIORITY[role] * 10 - rec.quality,
    });
  }

  // Deux photos qui se ressemblent trop : on garde la meilleure.
  candidates.sort((a, b) => a.rank - b.rank);
  const kept: KeptSecondary[] = [];
  for (const c of candidates) {
    const dup = kept.find((k) => hammingHex(metrics[k.index].hash, metrics[c.index].hash) <= DUPLICATE_HASH_DISTANCE);
    const reason: ExclusionReason | null = dup ? "doublon" : kept.length >= MAX_SECONDARIES ? "en_trop" : null;
    if (reason) {
      excluded.push({ index: c.index, reason });
      const rec = photos[c.index];
      rec.excluded_reason = reason;
      continue;
    }
    const { rank: _rank, ...k } = c;
    kept.push(k);
    photos[c.index].used = true;
  }

  const record: AnalysisRecord = {
    model: ANALYSIS_MODEL,
    prompt_version: ANALYSIS_PROMPT_VERSION,
    identity_confidence: identityConfidence,
    photos,
    identity: trimIdentity(raw.identity),
    selling_points: raw.selling_points.slice(0, 3),
    positioning: raw.positioning,
  };

  if (identityConfidence < MIN_IDENTITY_CONFIDENCE) {
    // Photos peut-être de produits différents : l'analyse elle-même peut mélanger les couleurs.
    for (const p of photos) p.used = p.index === heroIndex;
    return { ok: false, reason: "identite_incertaine", heroIndex, excluded, productAnalysis: null, record };
  }
  if (kept.length === 0) {
    return { ok: false, reason: n < 2 ? "une_seule_photo" : "aucune_photo_secondaire", heroIndex, excluded, productAnalysis: toProductAnalysis(raw), record };
  }
  const hero = byIndex.get(heroIndex);
  return {
    ok: true,
    heroIndex,
    heroQuality: clamp01(hero?.quality ?? 0.6),
    heroBox: cellsToBox(hero?.subject_cells),
    secondaries: kept,
    excluded,
    record,
  };
}

/** Listes de l'identité tronquées (le schéma ne les plafonne pas : un dépassement ferait tout échouer). */
function trimIdentity(i: RawAnalysis["identity"]): RawAnalysis["identity"] {
  return {
    category: i.category,
    shape: i.shape,
    colors: i.colors.slice(0, 4),
    materials: i.materials.slice(0, 4),
    branding: i.branding.slice(0, 4),
    distinctive_details: i.distinctive_details.slice(0, 6),
    critical_features: i.critical_features.slice(0, 6),
    never_change: i.never_change.slice(0, 6),
    potential_conflicts: i.potential_conflicts.slice(0, 4),
  };
}

/** Format attendu par le pipeline V1 (prompt, couleurs, points forts) — pour un repli sans 2e appel. */
export function toProductAnalysis(a: RawAnalysis): ProductAnalysis {
  return {
    category: a.identity.category,
    colors: a.identity.colors.slice(0, 4),
    material: a.identity.materials.join(", ") || "unspecified",
    positioning: a.positioning,
    visualNotes: a.visual_notes,
    accentGradient: a.accent_gradient,
    sellingPoints: a.selling_points.slice(0, 3),
  };
}

// ——— Appel Sonnet ———

/** Copie réduite envoyée au modèle (1024 px de côté max : moins cher, assez pour juger et cadrer). */
async function forModel(img: AnalysisImage): Promise<{ data: string; media_type: AllowedMediaType }> {
  const jpeg = await sharp(img.buffer).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { data: jpeg.toString("base64"), media_type: "image/jpeg" };
}

function buildPrompt(n: number, productName: string, heroFixed: boolean): string {
  return `Produit ou service : "${productName}". Ces ${n} photos (index 0 à ${n - 1}) sont censées montrer UN SEUL ET MÊME article. Elles serviront à une affiche publicitaire : la photo principale sera intégrée par un modèle d'image dans une scène, et les autres photos seront affichées TELLES QUELLES (vraies photos, recadrées) à côté. Ta mission : décrire chaque photo pour que le code décide lesquelles utiliser.

1. main_image_index : ${
    heroFixed
      ? "obligatoirement 0 (choisie par le commerçant)."
      : "la meilleure photo du produit ENTIER (net, bien cadré, le plus vendeur ; le produit seul est préférable à une photo portée)."
  }
2. photos : UNE entrée par photo (y compris la principale), avec :
   - role : hero (la principale), detail (gros plan d'une partie), alternate_angle (autre vue du produit), usage (porté / en situation / en contexte), texture (matière), irrelevant (sans intérêt pour vendre : flou, sombre, autre chose).
   - same_subject : est-ce EXACTEMENT le même article que la photo principale (même modèle, couleurs, forme, marquage) ? Même catégorie ne suffit pas. Un seul écart net → false. Dans le doute → false. (true pour la principale.)
   - confidence (0-1) : ta confiance dans same_subject.
   - quality (0-1) : qualité pour être montrée en grand sur une affiche — netteté, exposition, cadrage, reflets, résolution utile. 0,9 = photo pro ; 0,6 = bonne photo de téléphone ; < 0,45 = floue, sombre, coupée ou peu lisible.
   - quality_issues : problèmes courts en français (ex. « légèrement penchée », « reflets »), [] si aucun.
   - framing : whole_product (produit entier visible), partial (une partie importante), close_up (gros plan).
   - has_person : une personne (ou une partie du corps) est-elle visible ?
   - subject_cells : la photo est découpée en grille 3 × 3 (1 2 3 en haut, 4 5 6 au milieu, 7 8 9 en bas). Liste des cases qui contiennent le PRODUIT.
   - caption : légende de 1 à 3 mots en français, concrète, nommant l'élément le plus intéressant à montrer en vignette (ex. « Siège cuir », « Fermoir doré », « Semelle cousue », « Vue arrière »). Jamais de promesse ni de prix.
   - focus_cells : les cases (même grille) qui contiennent EXACTEMENT l'élément nommé par caption, et lui seulement autant que possible. La vignette sera recadrée sur ces cases : si la légende dit « Siège cuir », les cases du siège, pas celles du volant. Pour une vue d'ensemble : les cases du produit.
3. identity_confidence (0-1) : confiance que le lot entier montre le même article (la principale + celles marquées same_subject).
4. identity : category (précise), shape (silhouette), colors (2 à 4, en anglais), materials, branding (marques / logos / textes visibles SUR le produit), distinctive_details (y compris ceux visibles seulement sur les autres photos), critical_features et never_change (ce qui doit rester identique dans toute représentation, en anglais, phrases courtes et concrètes), potential_conflicts (ce qu'un modèle d'image risquerait d'inventer ou de mélanger, en anglais).
5. positioning, visual_notes (une phrase), accent_gradient (2 couleurs hex harmonisées avec le produit, lisibles avec du texte blanc, jamais blanc / noir pur ni néon), selling_points (1 à 3 points forts de 2 à 4 mots en français, vérifiables sur les photos ; jamais de promesse de livraison, paiement, garantie, stock, prix ou promotion).`;
}

/** Appel brut au modèle ; null en cas d'échec. */
export async function analyzeRaw(images: AnalysisImage[], productName: string, heroFixed: boolean): Promise<RawAnalysis | null> {
  try {
    const anthropic = new Anthropic();
    const content: (
      | { type: "image"; source: { type: "base64"; media_type: AllowedMediaType; data: string } }
      | { type: "text"; text: string }
    )[] = [];
    for (let i = 0; i < images.length; i++) {
      content.push({ type: "text", text: `Photo ${i}${heroFixed && i === 0 ? " (PRINCIPALE, choisie par le commerçant)" : ""} :` });
      content.push({ type: "image", source: { type: "base64", ...(await forModel(images[i])) } });
    }
    content.push({ type: "text", text: buildPrompt(images.length, productName, heroFixed) });
    const message = await anthropic.messages.parse({
      model: ANALYSIS_MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(RawAnalysisSchema) },
    });
    return message.parsed_output ?? null;
  } catch (e) {
    console.error("[poster-v2] analyse des photos en échec :", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Analyse + porte de sécurité. 1 appel Sonnet (1 nouvel essai si échec ponctuel). Les mesures
 * locales (taille, netteté, empreinte) sont calculées en parallèle.
 */
export async function analyzePhotos(images: AnalysisImage[], productName: string, opts: { heroFixed: boolean }): Promise<GateResult> {
  const metricsP = Promise.all(images.map((i) => localMetrics(i.buffer)));
  if (images.length < 2) {
    return { ok: false, reason: "une_seule_photo", heroIndex: 0, excluded: [], productAnalysis: null, record: null };
  }
  const raw = (await analyzeRaw(images, productName, opts.heroFixed)) ?? (await analyzeRaw(images, productName, opts.heroFixed));
  return applyGate(raw, await metricsP, opts);
}
