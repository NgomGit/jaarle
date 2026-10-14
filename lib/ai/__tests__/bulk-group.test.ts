import { describe, expect, it } from "vitest";
import { buildGroupingPrompt, checkCoverage, normalizeGrouping, type GroupingOutput } from "@/lib/ai/bulk-group";
import { colorDistance, exactDuplicatePairs, hammingHex, nearDuplicatePairs } from "@/lib/ai/bulk-group-hash";
import { expandTruth, LotTruthSchema, scoreLot, summarize, verdict, type CallRecord } from "@/lib/ai/bulk-group-eval";

// Bulk Upload, phase 0 : la normalisation ne perd jamais un média et ne fusionne jamais un doute ;
// les mesures comptent correctement fusions, séparations, non rangées, variantes et doublons.

const out = (p: Partial<GroupingOutput>): GroupingOutput => ({ groups: [], unsure: [], duplicates: [], variants: [], ...p });
const g = (key: string, items: number[], main = items[0], confidence: "high" | "medium" | "low" = "high") => ({ key, items, main, confidence, label: key, reason: "" });

describe("normalizeGrouping", () => {
  it("convertit les numéros #1…#N en indices 0-based", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2]), g("G2", [3])] }), 3);
    expect(r.groups.map((x) => x.items)).toEqual([[0, 1], [2]]);
    expect(r.unsorted).toEqual([]);
    expect(r.issues.missing).toBe(0);
  });

  it("place les médias oubliés dans « non rangées » au lieu de les perdre", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2])] }), 5);
    expect(r.unsorted.map((u) => [u.item, u.source])).toEqual([[2, "missing"], [3, "missing"], [4, "missing"]]);
    expect(r.issues.missing).toBe(3);
    expect(checkCoverage(r)).toEqual({ missing: [], repeated: [] });
  });

  it("ignore et compte les indices invalides (0, hors limites, décimaux)", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [0, 1, 7, 2.5 as number])], unsure: [{ item: 9, candidates: [], reason: "" }] }), 2);
    expect(r.groups[0].items).toEqual([0]);
    expect(r.issues.invalidIndices).toBe(4);
    expect(checkCoverage(r).missing).toEqual([]);
  });

  it("un média dans deux groupes reste dans le premier ; doute + groupe → non rangé", () => {
    const r = normalizeGrouping(
      out({ groups: [g("G1", [1, 2]), g("G2", [2, 3])], unsure: [{ item: 3, candidates: ["G2"], reason: "flou" }] }),
      3
    );
    expect(r.groups.map((x) => x.items)).toEqual([[0, 1]]); // G2 vidé : 2 déjà pris, 3 incertain
    expect(r.issues.duplicateAssignments).toBe(1);
    expect(r.issues.inGroupAndUnsure).toBe(1);
    expect(r.issues.emptyGroups).toBe(1);
    expect(r.unsorted).toEqual([{ item: 2, candidates: [], reason: "flou", source: "ai" }]); // G2 n'existe plus
    expect(r.issues.invalidGroupRefs).toBe(1);
  });

  it("corrige une photo principale hors du groupe", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [2, 3], 1)] }), 3);
    expect(r.groups[0].main).toBe(1);
    expect(r.issues.invalidMain).toBe(1);
  });

  it("marque « à vérifier » : confiance moyenne, doublon entre deux groupes, variante", () => {
    const r = normalizeGrouping(
      out({
        groups: [g("G1", [1]), g("G2", [2], 2, "medium"), g("G3", [3]), g("G4", [4])],
        variants: [{ groups: ["G3", "G4", "G9"], option: "Couleur", values: ["Rouge", "Bleu"], reason: "" }],
      }),
      4,
      { nearDuplicates: [[0, 1]] }
    );
    expect(r.groups.every((x) => x.needsReview)).toBe(true);
    expect(r.duplicates).toEqual([{ a: 0, b: 1, source: "hash" }]);
    expect(r.variants[0].groups).toEqual(["G3", "G4"]);
    expect(r.issues.invalidGroupRefs).toBe(1);
  });

  it("fusionne les doublons IA et calculés (source both) et refuse a = b", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2])], duplicates: [{ a: 2, b: 1 }, { a: 1, b: 1 }] }), 2, { nearDuplicates: [[0, 1]] });
    expect(r.duplicates).toEqual([{ a: 0, b: 1, source: "both" }]);
    expect(r.issues.invalidDuplicates).toBe(1);
  });

  it("couverture garantie même avec une sortie absurde", () => {
    const r = normalizeGrouping(
      out({ groups: [g("G1", [5, 5, 5]), g("G1", [1, 1]), g("", [])], unsure: [{ item: 1, candidates: ["X"], reason: "" }] }),
      6
    );
    expect(checkCoverage(r)).toEqual({ missing: [], repeated: [] });
  });

  it("la consigne cite le nombre de photos, les vidéos et les doublons certains", () => {
    const p = buildGroupingPrompt(3, [{}, { videoRef: "v1" }, {}], { exactDuplicates: [[0, 2]] });
    expect(p).toContain("#1 à #3");
    expect(p).toContain("#2 : image tirée de la vidéo « v1 »");
    expect(p).toContain("Fichiers identiques (doublons certains, même article) : #1 et #3");
    expect(p).not.toContain("Paires très proches");
    expect(buildGroupingPrompt(3, [{}, {}, {}], { similarPairs: [[1, 2]] })).toContain("Paires très proches selon un calcul d'image (ATTENTION");
  });
});

describe("empreintes", () => {
  it("distance de Hamming et couleur", () => {
    expect(hammingHex("0000000000000000", "0000000000000003")).toBe(2);
    expect(hammingHex("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(colorDistance([0, 0, 0], [3, 4, 0])).toBe(5);
  });
  it("même forme, autre couleur → pas un doublon", () => {
    const pairs = nearDuplicatePairs([
      { sha256: "a", dhash: "00ff00ff00ff00ff", rgb: [200, 30, 30] },
      { sha256: "b", dhash: "00ff00ff00ff00ff", rgb: [30, 30, 200] },
      { sha256: "c", dhash: "00ff00ff00ff00fe", rgb: [202, 31, 29] },
      { sha256: "d", dhash: "00ff00ff00ff0000", rgb: [200, 30, 30] },
    ]);
    expect(pairs).toEqual([[0, 2]]);
  });
  it("doublons certains : fichiers identiques", () => {
    expect(exactDuplicatePairs([{ sha256: "x" }, { sha256: "y" }, { sha256: "x" }])).toEqual([[0, 2]]);
  });
});

const truthJson = {
  lot: "t",
  groups: [
    { id: "robe-rouge", items: ["a.jpg", "b.jpg", "c.jpg"] },
    { id: "robe-bleue", items: ["d.jpg", "e.jpg"] },
    { id: "sac", items: ["f.jpg", "v.mp4"] },
  ],
  ambiguous: ["c.jpg"],
  duplicates: [["a.jpg", "b.jpg"]],
  variants: [["robe-rouge", "robe-bleue"]],
};
const files = ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg", "v__f50.jpg"];

describe("expandTruth", () => {
  it("rattache les images extraites d'une vidéo au groupe de la vidéo", () => {
    const r = expandTruth(LotTruthSchema.parse(truthJson), files, { "v__f50.jpg": "v.mp4" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.groupOf).toEqual(["robe-rouge", "robe-rouge", "robe-rouge", "robe-bleue", "robe-bleue", "sac", "sac"]);
  });
  it("signale les fichiers non classés, absents ou dans deux groupes", () => {
    const bad = { ...truthJson, groups: [...truthJson.groups, { id: "x", items: ["a.jpg", "zz.jpg"] }] };
    const r = expandTruth(LotTruthSchema.parse(bad), [...files, "orphelin.jpg"], { "v__f50.jpg": "v.mp4" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/deux groupes[\s\S]*orphelin\.jpg[\s\S]*zz\.jpg/);
  });
});

describe("scoreLot", () => {
  const truth = (() => {
    const r = expandTruth(LotTruthSchema.parse(truthJson), files, { "v__f50.jpg": "v.mp4" });
    if (!r.ok) throw new Error(r.errors.join());
    return r.value;
  })();

  it("résultat parfait", () => {
    const r = normalizeGrouping(
      out({
        groups: [g("G1", [1, 2, 3]), g("G2", [4, 5]), g("G3", [6, 7])],
        duplicates: [{ a: 1, b: 2 }],
        variants: [{ groups: ["G1", "G2"], option: "Couleur", values: [], reason: "" }],
      }),
      7
    );
    const s = scoreLot(truth, r);
    expect(s).toMatchObject({ wrongMergeItems: 0, splitExtraFragments: 0, unsortedTotal: 0, exactGroups: 3, pairPrecision: 1, pairRecall: 1, corrections: 0, variantsFound: 1, duplicatesFound: 1, lostAfterNormalize: 0 });
  });

  it("compte fusion, séparation, non rangée évitable et ambiguë acceptée", () => {
    // Rouge + bleue fusionnées (d, e mal placés), sac éclaté en 2, c (ambiguë) non rangée, f oubliée.
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2, 4, 5]), g("G2", [7])], unsure: [{ item: 3, candidates: [], reason: "" }] }), 7);
    const s = scoreLot(truth, r);
    expect(s.wrongMergeGroups).toBe(1);
    expect(s.wrongMergeItems).toBe(2);
    expect(s.unsortedAmbiguous).toBe(1);
    expect(s.unsortedClear).toBe(1); // f.jpg oubliée
    expect(s.missingFromRaw).toBe(1);
    expect(s.wrongSplitGroups).toBe(0); // f non rangée : le sac n'est pas « éclaté » entre deux groupes
    expect(s.corrections).toBe(3);
    expect(s.pairPrecision).toBeLessThan(1);
    expect(s.lostAfterNormalize).toBe(0);
  });

  it("verdict et agrégation", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2, 3]), g("G2", [4, 5]), g("G3", [6, 7])] }), 7);
    const rec: CallRecord = { lot: "t", model: "m", run: 1, ok: true, score: scoreLot(truth, r), durationMs: 5000, inputTokens: 3000, outputTokens: 500, costUsd: 0.005 };
    const [summary] = summarize([rec, { ...rec, run: 2 }]);
    expect(summary.calls).toBe(2);
    expect(summary.maxCorrectionSpread).toBe(0);
    expect(verdict(summary).pass).toBe(true);
  });
});
