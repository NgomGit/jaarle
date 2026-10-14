import { z } from "zod";
import { checkCoverage, issueCount, type NormalizedGrouping } from "@/lib/ai/bulk-group";

// Bulk Upload — PHASE 0 : vérité terrain des lots de référence et mesure de la qualité du
// regroupement. Logique pure (testée dans lib/ai/__tests__/bulk-group-eval.test.ts).

// ─── Format de truth.json (un par dossier de lot) ───────────────────────────────────────────────
export const LotTruthSchema = z.object({
  lot: z.string().min(1),
  description: z.string().optional(),
  /** Lot généré par scripts/bulk-group-fixtures.ts (aucune donnée réelle). */
  synthetic: z.boolean().default(false),
  /** Obligatoire pour un lot réel : qui a autorisé l'usage de ces photos, et quand. */
  consent: z.string().optional(),
  shopContext: z.string().optional(),
  /** Cas couverts : angles, similaires, couleurs, doublons, flou, multi-categories, video, mix. */
  cases: z.array(z.string()).default([]),
  /** Groupes corrects : un id lisible + les fichiers (photos ou vidéos) de CE seul article. */
  groups: z.array(z.object({ id: z.string().min(1), items: z.array(z.string().min(1)).min(1) })).min(1),
  /** Photos qu'il est acceptable de laisser « non rangées » (floues, trop serrées, dos sans détail). */
  ambiguous: z.array(z.string()).default([]),
  /** Paires de photos quasi identiques (même groupe). */
  duplicates: z.array(z.tuple([z.string(), z.string()])).default([]),
  /** Paires de groupes = même modèle, autre couleur (ids de groupes). */
  variants: z.array(z.tuple([z.string(), z.string()])).default([]),
});
export type LotTruth = z.infer<typeof LotTruthSchema>;

export interface ExpandedTruth {
  /** Fichier de chaque média, dans l'ordre d'envoi. */
  files: string[];
  /** Groupe correct de chaque média (id). */
  groupOf: string[];
  ambiguous: Set<number>;
  duplicates: [number, number][];
  variants: [string, string][];
}

/**
 * Vérifie la cohérence de truth.json par rapport aux fichiers du dossier.
 * `mediaFiles` : médias réellement présents (après extraction éventuelle des images de vidéos,
 * `frameSource[f]` = vidéo d'origine d'une image extraite).
 */
export function expandTruth(
  truth: LotTruth,
  mediaFiles: string[],
  frameSource: Record<string, string> = {}
): { ok: true; value: ExpandedTruth } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const groupOfFile = new Map<string, string>();
  const ids = new Set<string>();
  for (const g of truth.groups) {
    if (ids.has(g.id)) errors.push(`Groupe en double : ${g.id}`);
    ids.add(g.id);
    for (const f of g.items) {
      if (groupOfFile.has(f)) errors.push(`${f} est dans deux groupes (${groupOfFile.get(f)}, ${g.id}).`);
      groupOfFile.set(f, g.id);
    }
  }
  const files = [...mediaFiles];
  const groupOf: string[] = [];
  for (const f of files) {
    const g = groupOfFile.get(f) ?? (frameSource[f] ? groupOfFile.get(frameSource[f]) : undefined);
    if (!g) errors.push(`${f} n'est dans aucun groupe de truth.json.`);
    groupOf.push(g ?? "?");
  }
  const present = new Set([...files, ...Object.values(frameSource)]);
  for (const f of groupOfFile.keys()) if (!present.has(f)) errors.push(`${f} est cité dans truth.json mais absent du dossier.`);
  const index = (f: string) => files.indexOf(f);
  const ambiguous = new Set<number>();
  for (const f of truth.ambiguous) {
    const idx = files.filter((x) => x === f || frameSource[x] === f).map(index);
    if (idx.length === 0) errors.push(`ambiguous : ${f} absent.`);
    idx.forEach((i) => ambiguous.add(i));
  }
  const duplicates: [number, number][] = [];
  for (const [a, b] of truth.duplicates) {
    const ia = index(a);
    const ib = index(b);
    if (ia < 0 || ib < 0) errors.push(`duplicates : ${a} / ${b} absent.`);
    else if (groupOf[ia] !== groupOf[ib]) errors.push(`duplicates : ${a} et ${b} ne sont pas dans le même groupe.`);
    else duplicates.push(ia < ib ? [ia, ib] : [ib, ia]);
  }
  for (const [a, b] of truth.variants) {
    if (!ids.has(a) || !ids.has(b)) errors.push(`variants : groupe ${a} ou ${b} inconnu.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: { files, groupOf, ambiguous, duplicates, variants: truth.variants } };
}

// ─── Mesures ────────────────────────────────────────────────────────────────────────────────────

export interface LotScore {
  photos: number;
  truthGroups: number;
  predictedGroups: number;
  /** Groupes proposés qui mélangent des articles différents (fusions incorrectes). */
  wrongMergeGroups: number;
  /** Photos rangées avec un autre article (hors article majoritaire de leur groupe). */
  wrongMergeItems: number;
  /** Articles éclatés entre plusieurs groupes (séparations incorrectes). */
  wrongSplitGroups: number;
  /** Fragments en trop (un article en 3 groupes = 2). */
  splitExtraFragments: number;
  unsortedTotal: number;
  /** Non rangées acceptables (photos marquées ambiguës). */
  unsortedAmbiguous: number;
  /** Non rangées évitables (photo claire laissée de côté). */
  unsortedClear: number;
  /** Photos ambiguës forcées dans le MAUVAIS groupe. */
  ambiguousMisplaced: number;
  /** Articles retrouvés exactement (même ensemble de photos, hors ambiguës non rangées). */
  exactGroups: number;
  pairPrecision: number;
  pairRecall: number;
  pairF1: number;
  /** Gestes de correction estimés pour le vendeur. */
  corrections: number;
  variantsExpected: number;
  variantsFound: number;
  variantsFalse: number;
  duplicatesExpected: number;
  duplicatesFound: number;
  duplicatesFoundByHash: number;
  duplicatesFalse: number;
  /** Anomalies de la sortie brute (indices invalides, oublis, doubles attributions…). */
  rawIssues: number;
  missingFromRaw: number;
  /** Médias perdus APRÈS normalisation (doit toujours valoir 0). */
  lostAfterNormalize: number;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function majority(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export function scoreLot(truth: ExpandedTruth, result: NormalizedGrouping): LotScore {
  const n = truth.files.length;
  const unsortedSet = new Set(result.unsorted.map((u) => u.item));
  const predOf = new Map<number, string>();
  for (const g of result.groups) for (const i of g.items) predOf.set(i, g.key);

  // Fusions : groupes proposés mélangeant plusieurs articles.
  let wrongMergeGroups = 0;
  let wrongMergeItems = 0;
  let ambiguousMisplaced = 0;
  const groupMajority = new Map<string, string>();
  for (const g of result.groups) {
    const labels = g.items.map((i) => truth.groupOf[i]);
    const maj = majority(labels);
    groupMajority.set(g.key, maj);
    const wrong = g.items.filter((i) => truth.groupOf[i] !== maj);
    if (wrong.length) wrongMergeGroups++;
    wrongMergeItems += wrong.length;
    ambiguousMisplaced += wrong.filter((i) => truth.ambiguous.has(i)).length;
  }

  // Séparations : un article réparti dans plusieurs groupes proposés.
  const truthIds = [...new Set(truth.groupOf)];
  let wrongSplitGroups = 0;
  let splitExtraFragments = 0;
  let exactGroups = 0;
  for (const id of truthIds) {
    const members = truth.groupOf.map((g, i) => (g === id ? i : -1)).filter((i) => i >= 0);
    const placed = members.filter((i) => !unsortedSet.has(i));
    const preds = new Set(placed.map((i) => predOf.get(i)));
    if (preds.size > 1) {
      wrongSplitGroups++;
      splitExtraFragments += preds.size - 1;
    }
    // Exact : un seul groupe proposé, qui contient tous les membres non rangés-ambigus et rien d'autre.
    const required = members.filter((i) => !(unsortedSet.has(i) && truth.ambiguous.has(i)));
    if (preds.size === 1 && required.every((i) => !unsortedSet.has(i))) {
      const key = [...preds][0]!;
      const g = result.groups.find((x) => x.key === key)!;
      const sameSet = g.items.length === required.length && required.every((i) => g.items.includes(i));
      if (sameSet) exactGroups++;
    }
  }

  // Paires (les non rangées comptent comme seules).
  let tp = 0;
  let predPairs = 0;
  let truthPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameTruth = truth.groupOf[i] === truth.groupOf[j];
      const samePred = predOf.has(i) && predOf.get(i) === predOf.get(j);
      if (sameTruth) truthPairs++;
      if (samePred) predPairs++;
      if (sameTruth && samePred) tp++;
    }
  }
  const pairPrecision = predPairs ? tp / predPairs : 1;
  const pairRecall = truthPairs ? tp / truthPairs : 1;
  const pairF1 = pairPrecision + pairRecall ? (2 * pairPrecision * pairRecall) / (pairPrecision + pairRecall) : 0;

  const unsortedAmbiguous = result.unsorted.filter((u) => truth.ambiguous.has(u.item)).length;
  const unsortedClear = result.unsorted.length - unsortedAmbiguous;

  // Variantes : paire de groupes proposés dont les articles majoritaires forment une paire attendue.
  const expectedVariants = new Set(truth.variants.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  const foundVariants = new Set<string>();
  let variantsFalse = 0;
  for (const v of result.variants) {
    const ids = [...new Set(v.groups.map((k) => groupMajority.get(k)).filter((x): x is string => !!x))];
    let matched = false;
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const k = ids[a] < ids[b] ? `${ids[a]}|${ids[b]}` : `${ids[b]}|${ids[a]}`;
        if (expectedVariants.has(k)) {
          foundVariants.add(k);
          matched = true;
        }
      }
    }
    if (!matched) variantsFalse++;
  }

  // Doublons.
  const expectedDups = new Set(truth.duplicates.map(([a, b]) => pairKey(a, b)));
  let duplicatesFound = 0;
  let duplicatesFoundByHash = 0;
  let duplicatesFalse = 0;
  for (const d of result.duplicates) {
    const k = pairKey(d.a, d.b);
    if (expectedDups.has(k)) {
      duplicatesFound++;
      if (d.source !== "ai") duplicatesFoundByHash++;
    } else if (truth.groupOf[d.a] !== truth.groupOf[d.b]) {
      duplicatesFalse++;
    }
  }

  const coverage = checkCoverage(result);
  return {
    photos: n,
    truthGroups: truthIds.length,
    predictedGroups: result.groups.length,
    wrongMergeGroups,
    wrongMergeItems,
    wrongSplitGroups,
    splitExtraFragments,
    unsortedTotal: result.unsorted.length,
    unsortedAmbiguous,
    unsortedClear,
    ambiguousMisplaced,
    exactGroups,
    pairPrecision,
    pairRecall,
    pairF1,
    corrections: wrongMergeItems + splitExtraFragments + unsortedClear,
    variantsExpected: expectedVariants.size,
    variantsFound: foundVariants.size,
    variantsFalse,
    duplicatesExpected: expectedDups.size,
    duplicatesFound,
    duplicatesFoundByHash,
    duplicatesFalse,
    rawIssues: issueCount(result.issues),
    missingFromRaw: result.issues.missing,
    lostAfterNormalize: coverage.missing.length + coverage.repeated.length,
  };
}

// ─── Agrégation et critères de passage en phase 1 ───────────────────────────────────────────────

export interface CallRecord {
  lot: string;
  model: string;
  run: number;
  ok: boolean;
  error?: string;
  score?: LotScore;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ModelSummary {
  model: string;
  calls: number;
  failedCalls: number;
  photos: number;
  wrongMergeItemRate: number;
  unsortedClearRate: number;
  pairPrecision: number;
  pairRecall: number;
  correctionsPer10Photos: number;
  exactGroupRate: number;
  variantsRecall: number | null;
  duplicatesRecall: number | null;
  rawIssueCalls: number;
  lost: number;
  costPer30PhotosUsd: number;
  durationP50Ms: number;
  durationP95Ms: number;
  /** Écart max de corrections entre deux passages d'un même lot (stabilité). */
  maxCorrectionSpread: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

export function summarize(records: CallRecord[]): ModelSummary[] {
  const byModel = new Map<string, CallRecord[]>();
  for (const r of records) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);
  return [...byModel.entries()].map(([model, rs]) => {
    const ok = rs.filter((r) => r.ok && r.score);
    const sum = (f: (s: LotScore) => number) => ok.reduce((a, r) => a + f(r.score!), 0);
    const photos = sum((s) => s.photos);
    const truthGroups = sum((s) => s.truthGroups);
    const pairs = ok.length || 1;
    const vExp = sum((s) => s.variantsExpected);
    const dExp = sum((s) => s.duplicatesExpected);
    const byLot = new Map<string, number[]>();
    for (const r of ok) byLot.set(r.lot, [...(byLot.get(r.lot) ?? []), r.score!.corrections]);
    const spread = Math.max(0, ...[...byLot.values()].map((v) => Math.max(...v) - Math.min(...v)));
    const costTotal = rs.reduce((a, r) => a + r.costUsd, 0);
    return {
      model,
      calls: rs.length,
      failedCalls: rs.length - ok.length,
      photos,
      wrongMergeItemRate: photos ? sum((s) => s.wrongMergeItems) / photos : 0,
      unsortedClearRate: photos ? sum((s) => s.unsortedClear) / photos : 0,
      pairPrecision: sum((s) => s.pairPrecision) / pairs,
      pairRecall: sum((s) => s.pairRecall) / pairs,
      correctionsPer10Photos: photos ? (10 * sum((s) => s.corrections)) / photos : 0,
      exactGroupRate: truthGroups ? sum((s) => s.exactGroups) / truthGroups : 0,
      variantsRecall: vExp ? sum((s) => s.variantsFound) / vExp : null,
      duplicatesRecall: dExp ? sum((s) => s.duplicatesFound) / dExp : null,
      rawIssueCalls: ok.filter((r) => r.score!.rawIssues > 0).length,
      lost: sum((s) => s.lostAfterNormalize),
      costPer30PhotosUsd: photos ? (costTotal / Math.max(photos, 1)) * 30 : 0,
      durationP50Ms: percentile(rs.map((r) => r.durationMs), 50),
      durationP95Ms: percentile(rs.map((r) => r.durationMs), 95),
      maxCorrectionSpread: spread,
    };
  });
}

/** Seuils proposés pour passer en phase 1 (sur des lots RÉELS). Modifiables ici. */
export const PHASE1_THRESHOLDS = {
  maxWrongMergeItemRate: 0.03,
  maxUnsortedClearRate: 0.1,
  minPairPrecision: 0.95,
  minPairRecall: 0.85,
  maxCorrectionsPer10Photos: 2,
  maxFailedCallRate: 0.02,
  maxDurationP95Ms: 30_000,
  maxCostPer30PhotosUsd: 0.03,
} as const;

export function verdict(s: ModelSummary, t = PHASE1_THRESHOLDS): { pass: boolean; checks: { label: string; ok: boolean; value: string; target: string }[] } {
  const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
  const checks = [
    { label: "Aucun média perdu", ok: s.lost === 0, value: String(s.lost), target: "0" },
    { label: "Photos mal fusionnées", ok: s.wrongMergeItemRate <= t.maxWrongMergeItemRate, value: pct(s.wrongMergeItemRate), target: `≤ ${pct(t.maxWrongMergeItemRate)}` },
    { label: "Non rangées évitables", ok: s.unsortedClearRate <= t.maxUnsortedClearRate, value: pct(s.unsortedClearRate), target: `≤ ${pct(t.maxUnsortedClearRate)}` },
    { label: "Précision (paires)", ok: s.pairPrecision >= t.minPairPrecision, value: s.pairPrecision.toFixed(3), target: `≥ ${t.minPairPrecision}` },
    { label: "Rappel (paires)", ok: s.pairRecall >= t.minPairRecall, value: s.pairRecall.toFixed(3), target: `≥ ${t.minPairRecall}` },
    { label: "Corrections / 10 photos", ok: s.correctionsPer10Photos <= t.maxCorrectionsPer10Photos, value: s.correctionsPer10Photos.toFixed(2), target: `≤ ${t.maxCorrectionsPer10Photos}` },
    { label: "Appels en échec", ok: s.calls === 0 || s.failedCalls / s.calls <= t.maxFailedCallRate, value: `${s.failedCalls}/${s.calls}`, target: `≤ ${pct(t.maxFailedCallRate)}` },
    { label: "Durée p95", ok: s.durationP95Ms <= t.maxDurationP95Ms, value: `${(s.durationP95Ms / 1000).toFixed(1)} s`, target: `≤ ${t.maxDurationP95Ms / 1000} s` },
    { label: "Coût / 30 photos", ok: s.costPer30PhotosUsd <= t.maxCostPer30PhotosUsd, value: `$${s.costPer30PhotosUsd.toFixed(4)}`, target: `≤ $${t.maxCostPer30PhotosUsd}` },
  ];
  return { pass: checks.every((c) => c.ok), checks };
}
