import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Bulk Upload — regroupement d'un lot de photos mélangées en « un groupe = un article physique », en
// UN appel multimodal sur des vignettes numérotées. L'IA PROPOSE ; le code vérifie tout
// (normalizeGrouping) : indices valides, chaque média exactement une fois (groupe OU « non rangé »),
// aucun média perdu, et des signaux « à vérifier » calculés par des règles explicites.
//
// Deux consignes :
//  - "v2" (défaut) : inventaire visuel de CHAQUE photo d'abord (champ "photos"), puis regroupement,
//    avec des règles contre les séparations à tort (gros plans, vues de dos…) ET contre les fusions.
//  - "v1" : consigne de la phase 0 (sans inventaire), gardée pour comparer au banc et revenir en
//    arrière sans redéployer (BULK_GROUP_PROMPT=v1).

// Banc du 2026-10-15 sur un vrai lot (14 photos, 3 runs) : Sonnet 5 sans réflexion = 0 correction,
// ≈ 15 s, ≈ 0,085 $ / 30 photos ; Haiku 4.5 = 1,4 à 2,9 corrections / 10 photos. BULK_GROUP_MODEL
// permet de revenir à Haiku (claude-haiku-4-5-20251001) sans redéployer.
export const DEFAULT_BULK_GROUP_MODEL = "claude-sonnet-5";
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export type GroupingPromptVersion = "v1" | "v2";

/**
 * Réflexion interne du modèle. Coupée par défaut : pour ranger des photos, elle ne gagne rien en
 * qualité et multiplie la durée par 4 (57 s contre 15 s avec Sonnet 5). BULK_GROUP_THINKING=on la
 * laisse au modèle.
 */
export function groupingThinking(v = process.env.BULK_GROUP_THINKING): "on" | "off" {
  return v?.trim().toLowerCase() === "on" ? "on" : "off";
}

// 2026-10-15 : v2 a donné un rangement moins bon sur un vrai lot → v1 redevient la consigne par
// défaut. v2 reste disponible avec BULK_GROUP_PROMPT=v2 (banc : --prompt v1,v2).
export function groupingPromptVersion(v = process.env.BULK_GROUP_PROMPT): GroupingPromptVersion {
  return v?.trim().toLowerCase() === "v2" ? "v2" : "v1";
}

// ─── Sortie brute de l'IA (structurée, validée par le SDK) ──────────────────────────────────────
// Numéros de médias : #1…#N (1-based, comme dans la consigne). Groupes : clés « G1 », « G2 »…

export const PHOTO_VIEWS = ["face", "dos", "cote", "gros_plan", "porte", "plie", "emballe", "ensemble", "autre"] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];
/** Vues qui ne montrent pas l'article entier de face : un groupe fait uniquement de ces vues est suspect. */
export const PARTIAL_VIEWS: ReadonlySet<PhotoView> = new Set<PhotoView>(["dos", "cote", "gros_plan", "plie", "emballe"]);

const PhotoNoteSchema = z.object({
  n: z.number().int(),
  type: z.string(),
  colors: z.string(),
  pattern: z.string(),
  details: z.string(),
  view: z.enum(PHOTO_VIEWS),
  identifiable: z.boolean(),
});

const GroupSchema = z.object({
  key: z.string(),
  items: z.array(z.number().int()),
  main: z.number().int(),
  confidence: z.enum(["high", "medium", "low"]),
  label: z.string(),
  reason: z.string(),
});
const UnsureSchema = z.object({ item: z.number().int(), candidates: z.array(z.string()), reason: z.string() });
const DuplicateSchema = z.object({ a: z.number().int(), b: z.number().int() });
const VariantSchema = z.object({ groups: z.array(z.string()), option: z.string(), values: z.array(z.string()), reason: z.string() });

/** Consigne v1 (phase 0) : sans inventaire. */
export const GroupingOutputSchemaV1 = z.object({
  groups: z.array(GroupSchema),
  unsure: z.array(UnsureSchema),
  duplicates: z.array(DuplicateSchema),
  variants: z.array(VariantSchema),
});
/** Consigne v2 : l'inventaire vient EN PREMIER (l'IA décrit avant de regrouper). */
export const GroupingOutputSchema = z.object({
  photos: z.array(PhotoNoteSchema),
  groups: z.array(GroupSchema),
  unsure: z.array(UnsureSchema),
  duplicates: z.array(DuplicateSchema),
  variants: z.array(VariantSchema),
});
export type RawPhotoNote = z.infer<typeof PhotoNoteSchema>;
/** Sortie brute, v1 ou v2 (l'inventaire est facultatif). */
export type GroupingOutput = z.infer<typeof GroupingOutputSchemaV1> & { photos?: RawPhotoNote[] };

export type Confidence = "high" | "medium" | "low";

/** Image prête pour l'IA (vignette JPEG, déjà réduite). */
export interface GroupingImage {
  base64: string;
  /** Image tirée d'une vidéo (identifiant de la vidéo source), sinon null. */
  videoRef?: string | null;
  /** Date de prise de vue ou de modification du fichier (ms), si le téléphone la donne. */
  takenAt?: number | null;
}

export interface GroupingHints {
  /** Fichiers identiques octet pour octet (doublons certains), indices 0-based. */
  exactDuplicates?: [number, number][];
  /**
   * Paires très proches selon l'empreinte d'image (dHash + couleur). Peu fiable : deux articles
   * différents photographiés pareil ont la même empreinte. Envoyé à l'IA seulement si demandé.
   */
  similarPairs?: [number, number][];
  /** Contexte de la boutique (secteur, description), facultatif. */
  shopContext?: string;
}

// ─── Ordre de prise de vue ──────────────────────────────────────────────────────────────────────

/** Écart (s) au-delà duquel deux photos consécutives ouvrent une nouvelle « série ». */
export const CAPTURE_GAP_SECONDS = 90;

/**
 * Séries de photos prises à la suite, d'après les dates des fichiers (indices 0-based, ordre
 * chronologique). null si l'indice n'apporte rien : trop peu de dates, dates toutes identiques
 * (certains téléphones mettent l'heure du choix, pas de la prise), ou une seule série.
 * Les images d'une même vidéo comptent comme une seule photo (même date).
 */
export function captureRuns(takenAt: (number | null | undefined)[], gapSeconds = CAPTURE_GAP_SECONDS): number[][] | null {
  const dated = takenAt.map((t, i) => ({ t, i })).filter((x): x is { t: number; i: number } => typeof x.t === "number" && Number.isFinite(x.t) && x.t > 0);
  if (dated.length < 4 || dated.length < takenAt.length * 0.7) return null;
  const distinct = new Set(dated.map((d) => Math.round(d.t / 1000)));
  if (distinct.size < Math.max(3, dated.length * 0.5)) return null;
  const sorted = [...dated].sort((a, b) => a.t - b.t || a.i - b.i);
  if (sorted[sorted.length - 1].t - sorted[0].t < 5_000) return null;
  const runs: number[][] = [[sorted[0].i]];
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k].t - sorted[k - 1].t > gapSeconds * 1000) runs.push([]);
    runs[runs.length - 1].push(sorted[k].i);
  }
  if (runs.length < 2 || runs.length >= dated.length) return null;
  return runs;
}

// ─── Consignes ──────────────────────────────────────────────────────────────────────────────────

function hintLines(count: number, images: Pick<GroupingImage, "videoRef" | "takenAt">[], hints: GroupingHints, withRuns: boolean): string {
  const videoLines = images
    .map((img, i) => (img.videoRef ? `#${i + 1} : image tirée de la vidéo « ${img.videoRef} »` : null))
    .filter(Boolean);
  const pairs = (list?: [number, number][]) => (list ?? []).map(([a, b]) => `#${a + 1} et #${b + 1}`).join(" ; ");
  const exact = pairs(hints.exactDuplicates);
  const similar = pairs(hints.similarPairs);
  const runs = withRuns ? captureRuns(images.map((i) => i.takenAt)) : null;
  const runsLine = runs ? runs.map((r) => r.map((i) => `#${i + 1}`).join(", ")).join("  |  ") : "";
  return `Contexte de la boutique : ${hints.shopContext?.trim() || "(non renseigné)"}
${videoLines.length ? `\nImages tirées de vidéos :\n${videoLines.join("\n")}\n` : ""}${exact ? `\nFichiers identiques (doublons certains, même article) : ${exact}\n` : ""}${similar ? `\nPaires très proches selon un calcul d'image (ATTENTION : peut aussi être deux articles différents photographiés de la même façon, vérifie les détails) : ${similar}\n` : ""}${runsLine ? `\nSéries de photos prises à la suite (dans l'ordre de prise de vue, « | » = pause de plus de ${Math.round(CAPTURE_GAP_SECONDS / 60 * 10) / 10} min) : ${runsLine}\n` : ""}`;
}

/** Consigne v1 (phase 0), inchangée. */
export function buildGroupingPromptV1(count: number, images: Pick<GroupingImage, "videoRef">[], hints: GroupingHints = {}): string {
  return `Tu reçois ${count} photos numérotées de #1 à #${count}, envoyées en une seule fois par un commerçant sénégalais qui veut créer les fiches de ses articles. Les photos de plusieurs articles sont MÉLANGÉES.

${hintLines(count, images, hints, false)}
Ta tâche : regrouper les photos par ARTICLE PHYSIQUE. Un groupe = un seul objet à vendre, vu sous plusieurs angles, de près, porté, plié ou emballé.

Règles impératives :
1. Regroupe deux photos seulement si c'est clairement le MÊME objet : mêmes motifs, même coupe, même couleur, mêmes détails (logo, étiquette, couture, défaut). Une ressemblance générale ne suffit JAMAIS : deux t-shirts noirs de coupes différentes, deux bracelets dorés différents, deux paires de baskets blanches différentes = deux groupes.
2. Même modèle dans une autre couleur = groupes SÉPARÉS. Signale-les ensuite dans "variants" (ex. option "Couleur", valeurs ["Rouge", "Bleu"]).
3. Photo floue, trop serrée, sombre, ou dont l'article ne peut pas être identifié avec certitude : mets-la dans "unsure" avec les groupes possibles dans "candidates". Ne la force jamais dans un groupe.
4. Même photo ou presque (doublon, rafale) : même groupe, et liste la paire dans "duplicates".
5. Chaque numéro de #1 à #${count} doit apparaître EXACTEMENT UNE FOIS : soit dans un seul groupe, soit dans "unsure". N'oublie aucun numéro, n'en invente aucun.
6. "key" : G1, G2, G3… dans l'ordre. "items" et "main" : numéros des photos (sans #). "main" : la photo la plus claire de l'article entier, de face, sur fond net ; préfère une vraie photo à une image de vidéo.
7. "confidence" : "high" si tu es certain que toutes les photos du groupe montrent le même objet, "medium" si c'est probable, "low" s'il y a un doute.
8. "label" : nom court de l'article (2 à 5 mots, en français, sans nom de marque — sauf pour un véhicule : marque et modèle s'ils sont certains, ex. « Toyota Hilux gris »). "reason" : une phrase courte qui justifie le groupe.
9. Ne déduis jamais de taille, de prix ni de quantité.

Réponds uniquement avec l'objet structuré demandé.`;
}

/** Consigne v2 : inventaire visuel, puis regroupement par article physique. */
export function buildGroupingPromptV2(count: number, images: Pick<GroupingImage, "videoRef" | "takenAt">[], hints: GroupingHints = {}): string {
  return `Tu reçois ${count} photos numérotées de #1 à #${count}, envoyées en une seule fois par un commerçant sénégalais qui veut créer les fiches de ses articles. Les photos de plusieurs articles sont MÉLANGÉES. Les numéros suivent l'ordre où il les a choisies.

${hintLines(count, images, hints, true)}
Travaille en DEUX ÉTAPES.

ÉTAPE A — Inventaire ("photos") : une entrée par photo, de #1 à #${count}, dans l'ordre. Valeurs très courtes (1 à 6 mots), en français, "?" si ce n'est pas visible. N'invente rien.
- "type" : le type d'article, sans couleur (ex. « robe longue », « sac à main », « basket »).
- "colors" : couleur principale puis secondaires.
- "pattern" : motif, imprimé ou texture (ex. « wax à cercles », « uni », « cuir grainé »).
- "details" : ce qui distingue CET objet d'un article semblable (couture, poche, boutons, fermoir, étiquette, logo, défaut).
- "view" : face, dos, cote, gros_plan, porte (porté par quelqu'un), plie, emballe, ensemble (plusieurs articles sur la photo) ou autre.
- "identifiable" : false si la photo est trop floue, sombre ou serrée pour reconnaître l'article.

ÉTAPE B — Regroupement par ARTICLE PHYSIQUE, en t'appuyant sur l'inventaire. Un groupe = un seul objet à vendre.

Ne sépare pas à tort :
1. Une vue de face, de dos, de côté, un gros plan, l'article porté, plié ou emballé peuvent TOUS montrer le même objet. Un changement d'angle, de cadrage, de lumière ou de fond n'est jamais une preuve d'un autre article.
2. Un gros plan (motif, matière, étiquette, détail) va dans le groupe de l'article dont les détails correspondent. S'il peut appartenir à plusieurs articles, mets-le dans "unsure" avec ces groupes dans "candidates".
3. Ne crée jamais un groupe juste parce qu'une photo « a l'air différente » : compare type, couleurs, motif et détails.

Ne fusionne pas à tort :
4. Deux objets semblables restent deux groupes : deux t-shirts noirs de coupes différentes, deux bracelets dorés différents, deux paires de baskets blanches à semelles différentes. Un motif, une coupe, une couture, un logo ou un détail différent = un autre objet.
5. Une même couleur, un même fond ou une même mise en scène ne suffisent JAMAIS à regrouper.
6. Même modèle dans une autre couleur (ou un autre motif) = groupes SÉPARÉS. Signale-les dans "variants" (ex. option "Couleur", valeurs ["Rouge", "Bleu"]).

Indices de contexte (faibles, jamais une preuve) :
7. Des photos prises à la suite montrent souvent le même article, mais vérifie toujours les détails. Les images d'une même vidéo montrent souvent le même article, mais une vidéo peut en montrer plusieurs. Le contexte de la boutique aide seulement à nommer.

Doutes et contrôle :
8. Photo non identifiable, ou qui pourrait aller dans deux groupes : "unsure" avec les groupes possibles dans "candidates". Ne la force jamais dans un groupe.
9. Même photo ou presque (doublon, rafale) : même groupe, et liste la paire dans "duplicates".
10. Chaque numéro de #1 à #${count} doit apparaître EXACTEMENT UNE FOIS dans "groups" ou "unsure". N'oublie aucun numéro, n'en invente aucun.
11. "key" : G1, G2, G3… dans l'ordre. "items" et "main" : numéros des photos (sans #). "main" : la photo la plus claire de l'article entier, de face ; préfère une vraie photo à une image de vidéo.
12. "confidence" : "high" seulement si les détails prouvent que toutes les photos montrent le même objet ; "medium" si c'est probable ; "low" s'il y a un doute.
13. "label" : nom court de l'article (2 à 5 mots, en français, sans nom de marque — sauf pour un véhicule : marque et modèle s'ils sont certains, ex. « Toyota Hilux gris »). "reason" : une phrase courte qui cite les détails communs.
14. Ne déduis jamais de taille, de prix ni de quantité.

Réponds uniquement avec l'objet structuré demandé.`;
}

/** Consigne de la version demandée (v2 par défaut). */
export function buildGroupingPrompt(
  count: number,
  images: Pick<GroupingImage, "videoRef" | "takenAt">[],
  hints: GroupingHints = {},
  version: GroupingPromptVersion = "v2"
): string {
  return version === "v1" ? buildGroupingPromptV1(count, images, hints) : buildGroupingPromptV2(count, images, hints);
}

// ─── Appel IA ───────────────────────────────────────────────────────────────────────────────────

export interface GroupingCallResult {
  raw: GroupingOutput;
  model: string;
  promptVersion: GroupingPromptVersion;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export async function groupMediaWithAi(
  images: GroupingImage[],
  hints: GroupingHints = {},
  {
    model = process.env.BULK_GROUP_MODEL || DEFAULT_BULK_GROUP_MODEL,
    promptVersion = groupingPromptVersion(),
    thinking = groupingThinking(),
    client,
  }: { model?: string; promptVersion?: GroupingPromptVersion; thinking?: "on" | "off"; client?: Anthropic } = {}
): Promise<GroupingCallResult> {
  if (images.length === 0) throw new Error("Aucune image à regrouper.");
  const anthropic = client ?? new Anthropic();
  const content: (
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
    | { type: "text"; text: string }
  )[] = [];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `#${i + 1}${img.videoRef ? ` (vidéo ${img.videoRef})` : ""}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.base64 } });
  });
  content.push({ type: "text", text: buildGroupingPrompt(images.length, images, hints, promptVersion) });

  const started = Date.now();
  // Plafond large : il ne coûte rien (seuls les tokens produits sont facturés). Avec 6 000, Sonnet 5
  // coupait sa réponse au milieu du JSON (banc du 2026-10-15 : 5 appels sur 6 en échec), sa
  // réflexion interne comptant probablement dans ce plafond.
  const max_tokens = 16000;
  const extra = thinking === "off" ? { thinking: { type: "disabled" as const } } : {};
  const message =
    promptVersion === "v2"
      ? await anthropic.messages.parse({ model, max_tokens, ...extra, messages: [{ role: "user", content }], output_config: { format: zodOutputFormat(GroupingOutputSchema) } })
      : await anthropic.messages.parse({ model, max_tokens, ...extra, messages: [{ role: "user", content }], output_config: { format: zodOutputFormat(GroupingOutputSchemaV1) } });
  const durationMs = Date.now() - started;
  if (!message.parsed_output) throw new Error("Réponse IA invalide (regroupement).");
  return {
    raw: message.parsed_output,
    model,
    promptVersion,
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    durationMs,
  };
}

// ─── Normalisation (pure, testée) ───────────────────────────────────────────────────────────────

/** Inventaire d'une photo, nettoyé (champs inconnus = ""). */
export interface PhotoNote {
  type: string;
  colors: string;
  pattern: string;
  details: string;
  view: PhotoView;
  identifiable: boolean;
}

export interface NormalizedGroup {
  key: string;
  /** Indices 0-based. */
  items: number[];
  main: number;
  confidence: Confidence;
  label: string;
  reason: string;
  /** À vérifier par le vendeur (confiance < high, doublon hors groupe, variante possible…). */
  needsReview: boolean;
  reviewReasons: string[];
}

export interface UnsortedItem {
  item: number;
  candidates: string[];
  reason: string;
  /** ai = l'IA a hésité ; missing = l'IA l'a oublié ; conflict = l'IA l'a mis à deux endroits. */
  source: "ai" | "missing" | "conflict";
}

export interface GroupingIssues {
  /** Numéros hors de #1…#N ou non entiers, ignorés. */
  invalidIndices: number;
  /** Médias cités dans plusieurs groupes (gardés dans le premier). */
  duplicateAssignments: number;
  /** Médias à la fois dans un groupe et dans « unsure » (gardés dans « unsure »). */
  inGroupAndUnsure: number;
  /** Médias oubliés par l'IA (placés dans « non rangées »). */
  missing: number;
  /** Groupes vides après nettoyage, retirés. */
  emptyGroups: number;
  /** Photo principale absente du groupe (remplacée par la 1re). */
  invalidMain: number;
  /** Références de groupes inconnues (candidates, variants). */
  invalidGroupRefs: number;
  /** Paires de doublons invalides. */
  invalidDuplicates: number;
}

/** Signaux calculés par des règles explicites (voir reviewSignals). Ce ne sont pas des erreurs de sortie. */
export interface GroupingSignals {
  /** Groupes qui pourraient être une partie d'un autre article (séparation à tort ?). */
  suspectedSplits: number;
  /** Groupes qui pourraient contenir plusieurs articles (fusion à tort ?). */
  suspectedMerges: number;
  /** Photos laissées dans « non rangées ». */
  unresolved: number;
}

export interface NormalizedGrouping {
  count: number;
  groups: NormalizedGroup[];
  unsorted: UnsortedItem[];
  duplicates: { a: number; b: number; source: "ai" | "hash" | "both" }[];
  variants: { groups: string[]; option: string; values: string[]; reason: string }[];
  /** Inventaire par média (index 0-based), null si l'IA ne l'a pas donné. */
  photos: (PhotoNote | null)[];
  issues: GroupingIssues;
  signals: GroupingSignals;
}

export function emptyIssues(): GroupingIssues {
  return { invalidIndices: 0, duplicateAssignments: 0, inGroupAndUnsure: 0, missing: 0, emptyGroups: 0, invalidMain: 0, invalidGroupRefs: 0, invalidDuplicates: 0 };
}

/** Somme des anomalies de la sortie brute (0 = sortie parfaitement conforme). */
export function issueCount(i: GroupingIssues): number {
  return Object.values(i).reduce((a, b) => a + b, 0);
}

// Raisons « à vérifier » (affichées au vendeur, ≤ 200 caractères).
export const REVIEW = {
  confidenceLow: "confiance faible",
  confidenceMedium: "confiance moyenne",
  nearDuplicate: "photo presque identique dans un autre produit",
  variant: "même modèle dans une autre couleur ?",
  sameVideo: "images de la même vidéo dans un autre produit",
  sameLabel: "même nom qu'un autre produit : même article ?",
  partialOnly: "seulement des vues partielles : peut-être une photo d'un autre produit",
  mixedTypes: "photos d'articles différents ?",
  unreadable: "une photo est peu lisible",
} as const;

const clean = (s: unknown, max = 60): string => {
  const v = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return v === "?" || v === "-" ? "" : v.slice(0, max);
};

/** Mots d'un texte, sans accents ni mots vides (comparaisons de type et de nom). */
export function keywords(s: string): string[] {
  const STOP = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "en", "a", "au", "aux", "et", "avec", "pour", "sans", "sur"]);
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Deux types d'article compatibles (au moins le 1er mot significatif en commun) ? */
function sameType(a: string, b: string): boolean {
  const ka = keywords(a);
  const kb = keywords(b);
  if (!ka.length || !kb.length) return false;
  return ka[0] === kb[0] || kb.includes(ka[0]) || ka.includes(kb[0]);
}

function normLabel(s: string): string {
  return keywords(s).join(" ");
}

/**
 * Transforme la sortie brute de l'IA en un résultat sûr :
 *  - chaque média 0…count-1 apparaît EXACTEMENT une fois (groupe ou non rangé) — jamais perdu ;
 *  - indices invalides ignorés et comptés ; doute → non rangé (jamais fusionné d'office) ;
 *  - doublons IA + calculés fusionnés ; doublon entre deux groupes → les deux « à vérifier » ;
 *  - signaux « à vérifier » par règles explicites (reviewSignals), pas seulement la confiance.
 */
export function normalizeGrouping(
  raw: GroupingOutput,
  count: number,
  hints: {
    /** Paires calculées localement (exactes + très proches) : ajoutées aux doublons, signal « à vérifier ». */
    nearDuplicates?: [number, number][];
    /** Vidéo source de chaque média (index 0-based), null pour une vraie photo. */
    videoRefs?: (string | null | undefined)[];
  } = {}
): NormalizedGrouping {
  const issues = emptyIssues();
  const toIndex = (n: number): number | null => {
    if (!Number.isInteger(n) || n < 1 || n > count) {
      issues.invalidIndices++;
      return null;
    }
    return n - 1;
  };

  // 0. Inventaire : une note par média (la 1re reçue l'emporte). Pas compté dans les anomalies.
  const photos: (PhotoNote | null)[] = Array.from({ length: count }, () => null);
  for (const p of raw.photos ?? []) {
    if (!Number.isInteger(p?.n) || p.n < 1 || p.n > count || photos[p.n - 1]) continue;
    photos[p.n - 1] = {
      type: clean(p.type, 40),
      colors: clean(p.colors, 40),
      pattern: clean(p.pattern, 40),
      details: clean(p.details, 80),
      view: (PHOTO_VIEWS as readonly string[]).includes(p.view) ? p.view : "autre",
      identifiable: p.identifiable !== false,
    };
  }

  // 1. « unsure » d'abord : le doute l'emporte sur un regroupement.
  const unsureMap = new Map<number, UnsortedItem>();
  for (const u of raw.unsure ?? []) {
    const idx = toIndex(u.item);
    if (idx == null) continue;
    if (!unsureMap.has(idx)) unsureMap.set(idx, { item: idx, candidates: u.candidates ?? [], reason: u.reason ?? "", source: "ai" });
  }

  // 2. Groupes : clés uniques, médias attribués une seule fois.
  const assigned = new Set<number>();
  const usedKeys = new Set<string>();
  const groups: NormalizedGroup[] = [];
  for (const g of raw.groups ?? []) {
    const items: number[] = [];
    const seenInGroup = new Set<number>();
    for (const n of g.items ?? []) {
      const idx = toIndex(n);
      if (idx == null || seenInGroup.has(idx)) continue;
      seenInGroup.add(idx);
      if (unsureMap.has(idx)) {
        issues.inGroupAndUnsure++;
        continue;
      }
      if (assigned.has(idx)) {
        issues.duplicateAssignments++;
        continue;
      }
      assigned.add(idx);
      items.push(idx);
    }
    if (items.length === 0) {
      issues.emptyGroups++;
      continue;
    }
    let key = (g.key || "").trim() || `G${groups.length + 1}`;
    while (usedKeys.has(key)) key = `${key}'`;
    usedKeys.add(key);
    const mainIdx = Number.isInteger(g.main) ? g.main - 1 : -1;
    let main = items[0];
    if (items.includes(mainIdx)) main = mainIdx;
    else issues.invalidMain++;
    const confidence: Confidence = g.confidence === "high" || g.confidence === "low" ? g.confidence : "medium";
    groups.push({
      key,
      items,
      main,
      confidence,
      label: (g.label ?? "").trim().slice(0, 80),
      reason: (g.reason ?? "").trim().slice(0, 300),
      needsReview: confidence !== "high",
      reviewReasons: confidence !== "high" ? [confidence === "low" ? REVIEW.confidenceLow : REVIEW.confidenceMedium] : [],
    });
  }

  // 3. Médias oubliés → non rangés (jamais perdus).
  for (let i = 0; i < count; i++) {
    if (!assigned.has(i) && !unsureMap.has(i)) {
      issues.missing++;
      unsureMap.set(i, { item: i, candidates: [], reason: "Non classé par l'IA.", source: "missing" });
    }
  }
  const keys = new Set(groups.map((g) => g.key));
  const unsorted = [...unsureMap.values()]
    .map((u) => {
      const candidates = u.candidates.filter((c) => keys.has(c));
      issues.invalidGroupRefs += u.candidates.length - candidates.length;
      return { ...u, candidates };
    })
    .sort((a, b) => a.item - b.item);

  // 4. Doublons : IA + calcul local, dédupliqués.
  const dup = new Map<string, { a: number; b: number; source: "ai" | "hash" | "both" }>();
  const addDup = (a: number, b: number, source: "ai" | "hash") => {
    if (a === b) return false;
    const [x, y] = a < b ? [a, b] : [b, a];
    const k = `${x}-${y}`;
    const cur = dup.get(k);
    dup.set(k, { a: x, b: y, source: cur && cur.source !== source ? "both" : source });
    return true;
  };
  for (const d of raw.duplicates ?? []) {
    const a = toIndex(d.a);
    const b = toIndex(d.b);
    if (a == null || b == null || !addDup(a, b, "ai")) issues.invalidDuplicates++;
  }
  for (const [a, b] of hints.nearDuplicates ?? []) {
    if (a >= 0 && b >= 0 && a < count && b < count) addDup(a, b, "hash");
  }
  const duplicates = [...dup.values()].sort((x, y) => x.a - y.a || x.b - y.b);

  // 5. Variantes : seulement entre groupes existants et distincts. Suggestion, jamais appliquée.
  const variants: NormalizedGrouping["variants"] = [];
  for (const v of raw.variants ?? []) {
    const refs = [...new Set(v.groups ?? [])];
    const valid = refs.filter((k) => keys.has(k));
    issues.invalidGroupRefs += refs.length - valid.length;
    if (valid.length < 2) continue;
    variants.push({ groups: valid, option: (v.option ?? "").trim().slice(0, 30) || "Couleur", values: (v.values ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 20), reason: (v.reason ?? "").trim().slice(0, 300) });
  }

  // 6. Signaux « à vérifier » (règles explicites).
  const signals = reviewSignals({ groups, duplicates, variants, photos, videoRefs: hints.videoRefs ?? [] });
  signals.unresolved = unsorted.length;

  return { count, groups, unsorted, duplicates, variants, photos, issues, signals };
}

/**
 * Règles « à vérifier », appliquées en place sur `groups` (needsReview + reviewReasons). Chaque
 * règle est volontairement étroite pour ne pas alerter sur toute paire qui se ressemble :
 *  R1 doublon (IA ou empreinte) réparti entre deux groupes → les deux ;
 *  R2 variante suggérée → les groupes concernés ;
 *  R3 images d'une même vidéo dans deux groupes → les deux (séparation possible) ;
 *  R4 deux groupes au nom identique, non signalés comme variantes → les deux (séparation possible) ;
 *  R5 groupe fait UNIQUEMENT de vues partielles (dos, côté, gros plan, plié, emballé) alors qu'un
 *     autre groupe montre un article du même type → ce groupe (séparation possible) ;
 *  R6 groupe dont deux photos lisibles ont des types d'article incompatibles → ce groupe (fusion
 *     possible) ;
 *  R7 photo jugée illisible par l'IA mais placée dans un groupe → ce groupe.
 * Un groupe d'une seule photo n'est PAS suspect en soi : un produit peut n'avoir qu'une photo.
 */
export function reviewSignals(input: {
  groups: NormalizedGroup[];
  duplicates: { a: number; b: number }[];
  variants: { groups: string[] }[];
  photos: (PhotoNote | null)[];
  videoRefs: (string | null | undefined)[];
}): GroupingSignals {
  const { groups, duplicates, variants, photos, videoRefs } = input;
  const groupOf = new Map<number, NormalizedGroup>();
  for (const g of groups) for (const i of g.items) groupOf.set(i, g);
  const split = new Set<string>();
  const merge = new Set<string>();
  const flag = (g: NormalizedGroup | undefined, why: string, kind?: "split" | "merge") => {
    if (!g) return;
    g.needsReview = true;
    if (!g.reviewReasons.includes(why)) g.reviewReasons.push(why);
    if (kind === "split") split.add(g.key);
    if (kind === "merge") merge.add(g.key);
  };
  const variantPair = (a: string, b: string) => variants.some((v) => v.groups.includes(a) && v.groups.includes(b));

  // R1
  for (const d of duplicates) {
    const ga = groupOf.get(d.a);
    const gb = groupOf.get(d.b);
    if (ga && gb && ga !== gb) {
      flag(ga, REVIEW.nearDuplicate, "split");
      flag(gb, REVIEW.nearDuplicate, "split");
    }
  }
  // R2
  for (const v of variants) for (const k of v.groups) flag(groups.find((g) => g.key === k), REVIEW.variant);
  // R3
  const byVideo = new Map<string, Set<NormalizedGroup>>();
  videoRefs.forEach((ref, i) => {
    const g = groupOf.get(i);
    if (!ref || !g) return;
    if (!byVideo.has(ref)) byVideo.set(ref, new Set());
    byVideo.get(ref)!.add(g);
  });
  for (const set of byVideo.values()) if (set.size > 1) for (const g of set) flag(g, REVIEW.sameVideo, "split");
  // R4
  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      const la = normLabel(groups[a].label);
      if (la && la === normLabel(groups[b].label) && !variantPair(groups[a].key, groups[b].key)) {
        flag(groups[a], REVIEW.sameLabel, "split");
        flag(groups[b], REVIEW.sameLabel, "split");
      }
    }
  }
  // R5
  const typeOf = (g: NormalizedGroup) => g.items.map((i) => photos[i]?.type ?? "").filter(Boolean);
  for (const g of groups) {
    const notes = g.items.map((i) => photos[i]);
    if (notes.some((n) => !n) || !notes.every((n) => n && PARTIAL_VIEWS.has(n.view))) continue;
    const types = typeOf(g);
    const twin = groups.some((o) => o !== g && !variantPair(o.key, g.key) && typeOf(o).some((t) => types.some((u) => sameType(t, u))));
    if (twin) flag(g, REVIEW.partialOnly, "split");
  }
  // R6 + R7
  for (const g of groups) {
    const readable = g.items.map((i) => photos[i]).filter((n): n is PhotoNote => !!n && n.identifiable && !!n.type);
    let mixed = false;
    for (let a = 0; a < readable.length && !mixed; a++) for (let b = a + 1; b < readable.length && !mixed; b++) if (!sameType(readable[a].type, readable[b].type)) mixed = true;
    if (mixed) flag(g, REVIEW.mixedTypes, "merge");
    if (g.items.some((i) => photos[i] && !photos[i]!.identifiable)) flag(g, REVIEW.unreadable);
  }
  for (const g of groups) g.reviewReasons = g.reviewReasons.slice(0, 10);
  return { suspectedSplits: split.size, suspectedMerges: merge.size, unresolved: 0 };
}

/** Résumé court d'une note d'inventaire (stocké avec le média, relu pour la fiche produit). */
export function photoNoteText(n: PhotoNote | null | undefined): string {
  if (!n) return "";
  return [n.type, n.colors, n.pattern, n.details].filter(Boolean).join(" · ").slice(0, 200);
}

/** Invariant : chaque média 0…count-1 est présent exactement une fois. Renvoie les anomalies. */
export function checkCoverage(result: Pick<NormalizedGrouping, "count" | "groups" | "unsorted">): { missing: number[]; repeated: number[] } {
  const seen = new Map<number, number>();
  for (const g of result.groups) for (const i of g.items) seen.set(i, (seen.get(i) ?? 0) + 1);
  for (const u of result.unsorted) seen.set(u.item, (seen.get(u.item) ?? 0) + 1);
  const missing: number[] = [];
  const repeated: number[] = [];
  for (let i = 0; i < result.count; i++) {
    const n = seen.get(i) ?? 0;
    if (n === 0) missing.push(i);
    if (n > 1) repeated.push(i);
  }
  return { missing, repeated };
}
