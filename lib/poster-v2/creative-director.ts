import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { LAYOUTS, productFamily, type ProductFamily } from "@/lib/poster-v2/layouts";
import { layoutTryOrder, type ScoredLayout } from "@/lib/poster-v2/eligibility";
import { contrast, luminance } from "@/lib/poster-v2/color";
import { TYPE_PAIRS, type LayoutId, type Palette, type TypePairKey } from "@/lib/poster-v2/types";
import type { KeptSecondary, RawAnalysis } from "@/lib/poster-v2/analysis";

// Étape 2 de la V2 : direction artistique (1 appel Sonnet, miniature de la photo principale).
//
// Le directeur artistique CHOISIT ; il n'invente rien d'affiché :
//  - mise en page : uniquement parmi les mises en page autorisées par le code (éligibilité) ;
//  - paire typographique : T1-T5 ; palette : 4 couleurs (contrastes recalculés par le renderer) ;
//  - titre = nom donné par le vendeur (il peut seulement le raccourcir en gardant ses mots, et
//    choisir le mot mis en valeur) ;
//  - surtitre et points forts : choisis par NUMÉRO dans des listes fournies par le code (vendeur +
//    analyse des photos) — jamais de texte libre, donc jamais de promesse ou d'info inventée ;
//  - ambiance / décor / lumière (anglais) : servent seulement au prompt de la scène.
// Toute réponse hors cadre est corrigée par le code. Si l'appel échoue, une direction par défaut
// déterministe est utilisée (la V2 continue).

export const DIRECTOR_PROMPT_VERSION = "cd-v2.0";
export const DIRECTOR_MODEL = "claude-sonnet-5";

export interface DirectorInput {
  productName: string;
  industry?: string | null;
  /** Catégorie saisie par le vendeur (si elle existe). */
  category?: string | null;
  description?: string | null;
  price: number | null;
  businessName?: string | null;
  /** Points forts saisis par le vendeur (prioritaires). */
  vendorBenefits?: string[];
  /** Surtitre saisi par le vendeur (ex. « Nouvelle collection »). */
  vendorKicker?: string | null;
  /** Couleurs du logo (dégradé), si connues. */
  brandColors?: { from: string; to: string } | null;
  analysis: Pick<RawAnalysis, "identity" | "selling_points" | "positioning" | "accent_gradient" | "visual_notes">;
  secondaries: KeptSecondary[];
  eligible: ScoredLayout[];
  /** Photo principale (une miniature est envoyée au modèle). */
  heroImage: Buffer;
}

export interface Direction {
  model: string;
  prompt_version: string;
  /** "ai" = choisie par Sonnet (puis validée) ; "default" = direction de secours déterministe. */
  source: "ai" | "default";
  layout: LayoutId;
  /** Ordre d'essai : la mise en page choisie, puis les autres autorisées (qualité d'abord). */
  tryOrder: LayoutId[];
  typePair: TypePairKey;
  palette: Palette;
  copy: { title: string; titleAccent: string | null; kicker: string | null; benefits: string[] };
  scene: { mood: string; environment: string; lighting: string };
  /** Corrections appliquées par le code (journal). */
  corrections: string[];
  rationale: string;
}

const HEX = z.string();

const RawDirectionSchema = z.object({
  layout: z.string(),
  type_pair: z.string(),
  palette: z.object({ dark: HEX, light: HEX, accent: HEX, muted: HEX }),
  title: z.string(),
  title_accent: z.string(),
  kicker_choice: z.number().int(),
  benefit_choices: z.array(z.number().int()),
  mood: z.string(),
  environment: z.string(),
  lighting: z.string(),
  rationale: z.string(),
});
export type RawDirection = z.infer<typeof RawDirectionSchema>;

// ——— Repères déterministes ———

/** Paire typographique par défaut selon la famille de produit (repli et suggestion). */
export const DEFAULT_PAIR: Record<ProductFamily, TypePairKey> = {
  auto: "T5",
  mode: "T3",
  chaussures: "T2",
  accessoires: "T1",
  beaute: "T4",
  electronique: "T5",
  maison: "T4",
  food: "T4",
  service: "T3",
  autre: "T3",
};

const PAIR_HINTS: Record<TypePairKey, string> = {
  T1: "Éditorial luxe — serif fin + italique (bijoux, montres, lunettes, parfums, auto premium)",
  T2: "Affirmé — capitales condensées très fortes (sport, sneakers, promo, électronique grand public)",
  T3: "Moderne premium — géométrique large (mode urbaine, tech, services)",
  T4: "Chaleureux — serif doux + italique (artisanat, cosmétique, food, déco)",
  T5: "Précis — sans-serif gras net (auto, électroménager, téléphones, B2B)",
};

/** Mots interdits dans tout texte affiché (promesses / infos que le code ne peut pas vérifier). */
const FORBIDDEN = /(livraison|gratuit|garanti|promo|solde|remise|réduction|offert|stock|%|fcfa|cfa|€|\$|prix|meilleur|n°\s*1|numéro 1|paiement|crédit)/i;

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
const words = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Surtitres candidats (numérotés à partir de 1 ; 0 = aucun). Jamais inventés par l'IA. */
export function kickerCandidates(input: Pick<DirectorInput, "vendorKicker" | "category" | "analysis" | "businessName">): string[] {
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    const s = (t ?? "").replace(/\s+/g, " ").trim();
    if (s && s.length <= 28 && !FORBIDDEN.test(s) && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  add(input.vendorKicker);
  add(input.category);
  add(input.analysis.identity.category);
  return out.slice(0, 4);
}

/** Points forts candidats : ceux du vendeur d'abord, puis ceux de l'analyse (vérifiables sur les photos). */
export function benefitCandidates(input: Pick<DirectorInput, "vendorBenefits" | "analysis">): string[] {
  const out: string[] = [];
  for (const b of [...(input.vendorBenefits ?? []), ...input.analysis.selling_points]) {
    const s = b.replace(/\s+/g, " ").trim();
    if (!s || s.length > 32 || FORBIDDEN.test(s)) continue;
    const t = s.charAt(0).toLocaleUpperCase("fr") + s.slice(1);
    if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 6);
}

// ——— Validation (pure, testée) ———

/**
 * Titre : le nom du vendeur, ou une version raccourcie qui n'utilise QUE ses mots (dans l'ordre).
 * Sinon → nom du vendeur.
 */
export function validateTitle(proposed: string, productName: string): { title: string; corrected: boolean } {
  const name = productName.replace(/\s+/g, " ").trim();
  const p = proposed.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  if (!p || FORBIDDEN.test(p)) return { title: name, corrected: p !== name };
  const nameWords = words(name);
  const pWords = words(p);
  let j = 0;
  for (const w of pWords) {
    while (j < nameWords.length && nameWords[j] !== w) j++;
    if (j >= nameWords.length) return { title: name, corrected: true };
    j++;
  }
  // Raccourci trop pauvre (un seul mot alors que le nom en a plusieurs) : on garde le nom.
  if (pWords.length < Math.min(2, nameWords.length)) return { title: name, corrected: true };
  return { title: p, corrected: false };
}

/** Le mot mis en valeur doit être une suite de mots entiers du titre (sinon : aucun). */
export function validateAccent(accent: string, title: string): string | null {
  const a = accent.replace(/\s+/g, " ").trim();
  if (!a) return null;
  const tw = title.split(/\s+/);
  const aw = a.split(/\s+/);
  if (aw.length >= tw.length) return null;
  for (let i = 0; i + aw.length <= tw.length; i++) {
    if (aw.every((w, k) => tw[i + k].toLowerCase() === w.toLowerCase())) return tw.slice(i, i + aw.length).join(" ");
  }
  return null;
}

/** Palette : hex valides, un vrai sombre, un vrai clair, un accent distinct des deux. */
export function validatePalette(p: Partial<Palette> | null | undefined, fallback: Palette): { palette: Palette; corrections: string[] } {
  const corrections: string[] = [];
  const pick = (k: keyof Palette) => {
    const v = p?.[k];
    if (typeof v === "string" && isHex(v)) return v.toUpperCase();
    corrections.push(`palette.${k} invalide`);
    return fallback[k];
  };
  let dark = pick("dark");
  let light = pick("light");
  let accent = pick("accent");
  const muted = pick("muted");
  if (luminance(dark) > 0.12) (corrections.push("palette.dark trop clair"), (dark = fallback.dark));
  if (luminance(light) < 0.6) (corrections.push("palette.light trop sombre"), (light = fallback.light));
  if (contrast(accent, dark) < 1.6 && contrast(accent, light) < 1.6) (corrections.push("palette.accent sans contraste"), (accent = fallback.accent));
  return { palette: { dark, light, accent, muted }, corrections };
}

/** Texte de décor (anglais) : court, sans demande de texte / logo / prix dans l'image. */
export function sanitizeSceneText(t: string, fallback: string): string {
  let s = t.replace(/[\r\n"]+/g, " ").replace(/\s+/g, " ").trim();
  // Coupe propre (au mot) au-delà de 160 caractères.
  if (s.length > 160) s = s.slice(0, 160).replace(/[\s,;]+\S*$/, "");
  if (!s || /(text|word|letter|logo|sign|price|label|caption|typography|watermark|poster)/i.test(s)) return fallback;
  return s;
}

/** Direction par défaut (déterministe) : sert de repli ET de base aux corrections. */
export function defaultDirection(input: DirectorInput): Direction {
  const family = productFamily(input.industry, input.category);
  const accent = input.brandColors?.from && isHex(input.brandColors.from) ? input.brandColors.from : input.analysis.accent_gradient.from;
  const premium = input.analysis.positioning === "premium / haut de gamme";
  const palette: Palette = {
    dark: premium ? "#0E0F12" : "#16181D",
    light: "#F4F1EC",
    accent: isHex(accent) ? accent.toUpperCase() : "#C9A45C",
    muted: "#6B6258",
  };
  const benefits = benefitCandidates(input).slice(0, 2);
  const kicker = kickerCandidates(input)[0] ?? null;
  const order = layoutTryOrder(input.eligible);
  return {
    model: "none",
    prompt_version: DIRECTOR_PROMPT_VERSION,
    source: "default",
    layout: order[0],
    tryOrder: order,
    typePair: DEFAULT_PAIR[family],
    palette,
    copy: { title: input.productName.replace(/\s+/g, " ").trim(), titleAccent: null, kicker, benefits },
    scene: {
      mood: premium ? "premium, refined, confident" : "warm, inviting, trustworthy",
      environment: "clean studio set with soft gradient backdrop",
      lighting: "soft key light with gentle rim light",
    },
    corrections: [],
    rationale: "direction par défaut",
  };
}

/** Applique les règles du code à la réponse brute du modèle. */
export function validateDirection(raw: RawDirection, input: DirectorInput): Direction {
  const base = defaultDirection(input);
  const corrections: string[] = [];
  const allowed = input.eligible.map((e) => e.id);

  let layout = raw.layout as LayoutId;
  if (!allowed.includes(layout)) {
    corrections.push(`mise en page « ${raw.layout} » non autorisée → ${base.layout}`);
    layout = base.layout;
  }
  let typePair = raw.type_pair as TypePairKey;
  if (!(TYPE_PAIRS as readonly string[]).includes(typePair)) {
    corrections.push(`paire « ${raw.type_pair} » inconnue → ${base.typePair}`);
    typePair = base.typePair;
  }
  // T1 (Cormorant) a des chiffres « elzéviriens » (hauteurs variables) : illisible pour un titre
  // avec des chiffres (modèle, année, référence).
  const title0 = validateTitle(raw.title, input.productName).title;
  if (typePair === "T1" && /\d/.test(title0)) {
    const fallbackPair = base.typePair === "T1" ? "T3" : base.typePair;
    corrections.push(`T1 remplacée par ${fallbackPair} (titre avec chiffres)`);
    typePair = fallbackPair;
  }
  const pal = validatePalette(raw.palette, base.palette);
  corrections.push(...pal.corrections);

  const t = { title: title0, corrected: validateTitle(raw.title, input.productName).corrected };
  if (t.corrected) corrections.push(`titre « ${raw.title} » remplacé par le nom du produit`);
  const titleAccent = validateAccent(raw.title_accent, t.title);

  const kickers = kickerCandidates(input);
  const kicker = raw.kicker_choice >= 1 && raw.kicker_choice <= kickers.length ? kickers[raw.kicker_choice - 1] : null;
  const benefitsAll = benefitCandidates(input);
  const benefits: string[] = [];
  for (const n of raw.benefit_choices) {
    const b = benefitsAll[n - 1];
    if (b && !benefits.includes(b) && benefits.length < 3) benefits.push(b);
  }
  if (raw.benefit_choices.some((n) => !benefitsAll[n - 1])) corrections.push("point(s) fort(s) hors liste ignoré(s)");

  return {
    model: DIRECTOR_MODEL,
    prompt_version: DIRECTOR_PROMPT_VERSION,
    source: "ai",
    layout,
    tryOrder: layoutTryOrder(input.eligible, layout),
    typePair,
    palette: pal.palette,
    copy: { title: t.title, titleAccent, kicker, benefits },
    scene: {
      mood: sanitizeSceneText(raw.mood, base.scene.mood),
      environment: sanitizeSceneText(raw.environment, base.scene.environment),
      lighting: sanitizeSceneText(raw.lighting, base.scene.lighting),
    },
    corrections,
    rationale: raw.rationale.slice(0, 400),
  };
}

// ——— Appel Sonnet ———

function buildPrompt(input: DirectorInput): string {
  const family = productFamily(input.industry, input.category);
  const layouts = input.eligible
    .map((e) => {
      const s = LAYOUTS[e.id];
      return `- ${e.id} « ${s.name} » (place pour le texte : ${s.textRoom}, fond du texte : ${s.tone === "dark" ? "sombre" : "clair"}, score du code : ${e.score}${e.reasons.length ? ` — ${e.reasons.join(", ")}` : ""})`;
    })
    .join("\n");
  const kickers = kickerCandidates(input);
  const benefits = benefitCandidates(input);
  const secondaries = input.secondaries.map((s, i) => `- photo ${i + 1} : ${s.role}, « ${s.caption} »${s.wholeProduct ? " (vue d'ensemble)" : ""}`).join("\n");
  const id = input.analysis.identity;
  return `Tu es directeur artistique d'affiches publicitaires pour des commerçants en Afrique de l'Ouest (Sénégal). L'affiche est composée ainsi : un modèle d'image crée une SCÈNE où le produit principal est intégré, puis le code pose par-dessus les vraies photos secondaires et TOUT le texte (titre, prix, téléphone, logo, bouton). Tu choisis ; tu n'écris pas de texte publicitaire libre.

Produit : « ${input.productName} »${input.description ? ` — ${input.description.slice(0, 300)}` : ""}
Secteur : ${input.industry ?? "non précisé"} (famille : ${family}) ; catégorie : ${id.category} ; positionnement : ${input.analysis.positioning}
Identité : forme ${id.shape} ; couleurs ${id.colors.join(", ")} ; matières ${id.materials.join(", ")}
Notes visuelles : ${input.analysis.visual_notes}
Prix : ${input.price ? `${input.price} FCFA` : "sur devis"}${input.businessName ? ` ; boutique : ${input.businessName}` : ""}
${input.brandColors ? `Couleurs du logo : ${input.brandColors.from}, ${input.brandColors.to}` : "Pas de couleurs de marque."}
Photos secondaires affichées telles quelles :
${secondaries}

Choisis :
1. layout : UNE mise en page parmi celles autorisées (identifiant exact). Le score du code tient déjà compte des photos et du texte ; tu peux en choisir une autre de la liste si elle met mieux en valeur CE produit. La qualité prime sur l'originalité.
${layouts}
2. type_pair : T1, T2, T3, T4 ou T5.
${(Object.keys(PAIR_HINTS) as TypePairKey[]).map((k) => `- ${k} : ${PAIR_HINTS[k]}`).join("\n")}
3. palette (hex #RRGGBB) : dark (fond sombre profond, jamais noir pur), light (fond clair chaud ou neutre), accent (couleur forte pour prix et bouton, harmonisée avec le produit ou le logo, jamais néon), muted (couleur douce secondaire). Elle doit flatter le produit (ex. bleu nuit + accent bleu électrique pour une voiture bleue ; ivoire + or pour un bijou).
4. title : le nom du produit tel que donné, ou une version plus courte qui garde UNIQUEMENT ses mots, dans le même ordre (ex. « BMW X4 M40i 2020 full options » → « BMW X4 M40i »). title_accent : 1 à 2 mots du titre à mettre en valeur (modèle, matière, couleur) ; "" si aucun.
5. kicker_choice : numéro du surtitre, 0 pour aucun.
${kickers.map((k, i) => `  ${i + 1}. ${k}`).join("\n") || "  (aucun candidat : réponds 0)"}
6. benefit_choices : 0 à 3 numéros de points forts, du plus vendeur au moins vendeur (les plus concrets, sans redire les légendes des photos).
${benefits.map((b, i) => `  ${i + 1}. ${b}`).join("\n") || "  (aucun candidat : [])"}
7. Pour la scène (en anglais, une courte phrase chacun, sans aucun texte, logo ni panneau dans l'image) : mood (ambiance), environment (décor crédible et valorisant pour ce produit et ce marché ; pas de foule, pas de décor qui vole la vedette), lighting (lumière).
8. rationale : 1 à 2 phrases en français expliquant tes choix.`;
}

async function heroThumb(img: Buffer): Promise<string> {
  const jpeg = await sharp(img).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return jpeg.toString("base64");
}

export async function directRaw(input: DirectorInput): Promise<RawDirection | null> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: DIRECTOR_MODEL,
      max_tokens: 900,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Photo principale du produit :" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await heroThumb(input.heroImage) } },
            { type: "text", text: buildPrompt(input) },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(RawDirectionSchema) },
    });
    return message.parsed_output ?? null;
  } catch (e) {
    console.error("[poster-v2] direction artistique en échec :", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Direction artistique validée ; direction par défaut si l'appel échoue (jamais d'exception). */
export async function directPoster(input: DirectorInput): Promise<Direction> {
  if (!input.eligible.length) throw new Error("directPoster : aucune mise en page autorisée (repli V1 attendu en amont)");
  const raw = await directRaw(input);
  return raw ? validateDirection(raw, input) : defaultDirection(input);
}
