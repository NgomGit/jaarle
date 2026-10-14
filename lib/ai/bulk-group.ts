import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Bulk Upload — PHASE 0 (banc d'évaluation, scripts/bulk-group-eval.ts).
// Regroupement d'un lot de photos mélangées en « un groupe = un article physique », en UN appel
// multimodal sur des vignettes numérotées. L'IA PROPOSE ; le code vérifie tout (normalizeGrouping) :
// indices valides, chaque média exactement une fois (groupe OU « non rangé »), aucun média perdu.
// Rien n'est enregistré ici. Pas encore branché sur une route : la phase 1 réutilisera ce module.

export const DEFAULT_BULK_GROUP_MODEL = "claude-haiku-4-5-20251001";

// ─── Sortie brute de l'IA (structurée, validée par le SDK) ──────────────────────────────────────
// Numéros de médias : #1…#N (1-based, comme dans la consigne). Groupes : clés « G1 », « G2 »…
export const GroupingOutputSchema = z.object({
  groups: z.array(
    z.object({
      key: z.string(),
      items: z.array(z.number().int()),
      main: z.number().int(),
      confidence: z.enum(["high", "medium", "low"]),
      label: z.string(),
      reason: z.string(),
    })
  ),
  unsure: z.array(
    z.object({
      item: z.number().int(),
      candidates: z.array(z.string()),
      reason: z.string(),
    })
  ),
  duplicates: z.array(z.object({ a: z.number().int(), b: z.number().int() })),
  variants: z.array(
    z.object({
      groups: z.array(z.string()),
      option: z.string(),
      values: z.array(z.string()),
      reason: z.string(),
    })
  ),
});
export type GroupingOutput = z.infer<typeof GroupingOutputSchema>;

export type Confidence = "high" | "medium" | "low";

/** Image prête pour l'IA (vignette JPEG, déjà réduite). */
export interface GroupingImage {
  base64: string;
  /** Image tirée d'une vidéo (identifiant de la vidéo source), sinon null. */
  videoRef?: string | null;
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

// ─── Consigne ───────────────────────────────────────────────────────────────────────────────────

export function buildGroupingPrompt(count: number, images: Pick<GroupingImage, "videoRef">[], hints: GroupingHints = {}): string {
  const videoLines = images
    .map((img, i) => (img.videoRef ? `#${i + 1} : image tirée de la vidéo « ${img.videoRef} »` : null))
    .filter(Boolean);
  const pairs = (list?: [number, number][]) => (list ?? []).map(([a, b]) => `#${a + 1} et #${b + 1}`).join(" ; ");
  const exact = pairs(hints.exactDuplicates);
  const similar = pairs(hints.similarPairs);
  return `Tu reçois ${count} photos numérotées de #1 à #${count}, envoyées en une seule fois par un commerçant sénégalais qui veut créer les fiches de ses articles. Les photos de plusieurs articles sont MÉLANGÉES.

Contexte de la boutique : ${hints.shopContext?.trim() || "(non renseigné)"}
${videoLines.length ? `\nImages tirées de vidéos :\n${videoLines.join("\n")}\n` : ""}${exact ? `\nFichiers identiques (doublons certains, même article) : ${exact}\n` : ""}${similar ? `\nPaires très proches selon un calcul d'image (ATTENTION : peut aussi être deux articles différents photographiés de la même façon, vérifie les détails) : ${similar}\n` : ""}
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

// ─── Appel IA ───────────────────────────────────────────────────────────────────────────────────

export interface GroupingCallResult {
  raw: GroupingOutput;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export async function groupMediaWithAi(
  images: GroupingImage[],
  hints: GroupingHints = {},
  { model = process.env.BULK_GROUP_MODEL || DEFAULT_BULK_GROUP_MODEL, client }: { model?: string; client?: Anthropic } = {}
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
  content.push({ type: "text", text: buildGroupingPrompt(images.length, images, hints) });

  const started = Date.now();
  const message = await anthropic.messages.parse({
    model,
    max_tokens: 6000,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(GroupingOutputSchema) },
  });
  const durationMs = Date.now() - started;
  if (!message.parsed_output) throw new Error("Réponse IA invalide (regroupement).");
  return {
    raw: message.parsed_output,
    model,
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    durationMs,
  };
}

// ─── Normalisation (pure, testée) ───────────────────────────────────────────────────────────────

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

export interface NormalizedGrouping {
  count: number;
  groups: NormalizedGroup[];
  unsorted: UnsortedItem[];
  duplicates: { a: number; b: number; source: "ai" | "hash" | "both" }[];
  variants: { groups: string[]; option: string; values: string[]; reason: string }[];
  issues: GroupingIssues;
}

export function emptyIssues(): GroupingIssues {
  return { invalidIndices: 0, duplicateAssignments: 0, inGroupAndUnsure: 0, missing: 0, emptyGroups: 0, invalidMain: 0, invalidGroupRefs: 0, invalidDuplicates: 0 };
}

/** Somme des anomalies de la sortie brute (0 = sortie parfaitement conforme). */
export function issueCount(i: GroupingIssues): number {
  return Object.values(i).reduce((a, b) => a + b, 0);
}

/**
 * Transforme la sortie brute de l'IA en un résultat sûr :
 *  - chaque média 0…count-1 apparaît EXACTEMENT une fois (groupe ou non rangé) — jamais perdu ;
 *  - indices invalides ignorés et comptés ; doute → non rangé (jamais fusionné d'office) ;
 *  - doublons IA + calculés fusionnés ; doublon entre deux groupes → les deux « à vérifier ».
 */
export function normalizeGrouping(
  raw: GroupingOutput,
  count: number,
  /** Paires calculées localement (exactes + très proches) : ajoutées aux doublons, signal « à vérifier ». */
  hints: { nearDuplicates?: [number, number][] } = {}
): NormalizedGrouping {
  const issues = emptyIssues();
  const toIndex = (n: number): number | null => {
    if (!Number.isInteger(n) || n < 1 || n > count) {
      issues.invalidIndices++;
      return null;
    }
    return n - 1;
  };

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
      reviewReasons: confidence !== "high" ? [`confiance ${confidence === "low" ? "faible" : "moyenne"}`] : [],
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
  const groupOf = new Map<number, NormalizedGroup>();
  for (const g of groups) for (const i of g.items) groupOf.set(i, g);
  const flag = (g: NormalizedGroup | undefined, why: string) => {
    if (!g) return;
    g.needsReview = true;
    if (!g.reviewReasons.includes(why)) g.reviewReasons.push(why);
  };
  for (const d of dup.values()) {
    const ga = groupOf.get(d.a);
    const gb = groupOf.get(d.b);
    if (ga && gb && ga !== gb) {
      flag(ga, "photo presque identique dans un autre produit");
      flag(gb, "photo presque identique dans un autre produit");
    }
  }

  // 5. Variantes : seulement entre groupes existants et distincts. Suggestion, jamais appliquée.
  const variants: NormalizedGrouping["variants"] = [];
  for (const v of raw.variants ?? []) {
    const refs = [...new Set(v.groups ?? [])];
    const valid = refs.filter((k) => keys.has(k));
    issues.invalidGroupRefs += refs.length - valid.length;
    if (valid.length < 2) continue;
    variants.push({ groups: valid, option: (v.option ?? "").trim().slice(0, 30) || "Couleur", values: (v.values ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 20), reason: (v.reason ?? "").trim().slice(0, 300) });
    for (const k of valid) flag(groups.find((g) => g.key === k), "même modèle dans une autre couleur ?");
  }

  return { count, groups, unsorted, duplicates: [...dup.values()].sort((x, y) => x.a - y.a || x.b - y.b), variants, issues };
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
