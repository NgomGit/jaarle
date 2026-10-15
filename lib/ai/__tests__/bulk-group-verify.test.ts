import { describe, expect, it } from "vitest";
import { normalizeGrouping, REVIEW, type GroupingOutput, type RawPhotoNote } from "@/lib/ai/bulk-group";
import { applyVerification, REVIEW_VERIFIED_MERGE, representativeItems, suspiciousPairs, verifyMode } from "@/lib/ai/bulk-group-verify";
import { checkImportInvariants, stateFromGrouping, unmergeGroup } from "@/lib/products/bulk-import";

// 2e passage ciblé : quelles paires on revérifie, et ce qu'on fait de la réponse.

const out = (p: Partial<GroupingOutput>): GroupingOutput => ({ groups: [], unsure: [], duplicates: [], variants: [], ...p });
const g = (key: string, items: number[], label = key) => ({ key, items, main: items[0], confidence: "high" as const, label, reason: "" });
const note = (n: number, type: string, view: RawPhotoNote["view"] = "face"): RawPhotoNote => ({ n, type, colors: "", pattern: "", details: "", view, identifiable: true });

// Robe (#1 face) éclatée : #2 dos + #3 gros plan dans G2. Sac (#4) sans rapport.
const split = normalizeGrouping(
  out({
    photos: [note(1, "robe"), note(2, "robe", "dos"), note(3, "robe", "gros_plan"), note(4, "sac")],
    groups: [g("G1", [1], "Robe wax"), g("G2", [2, 3], "Détail tissu"), g("G3", [4], "Sac")],
  }),
  4
);

describe("suspiciousPairs", () => {
  it("ne retient que les paires suspectes (vues partielles du même type)", () => {
    expect(suspiciousPairs(split)).toEqual([{ a: "G1", b: "G2", why: ["vues partielles du même type"] }]);
  });
  it("exclut les variantes et limite le nombre de paires", () => {
    const r = normalizeGrouping(
      out({
        groups: [g("G1", [1], "Robe"), g("G2", [2], "Robe"), g("G3", [3], "Robe")],
        variants: [{ groups: ["G1", "G2"], option: "Couleur", values: [], reason: "" }],
      }),
      3
    );
    const pairs = suspiciousPairs(r);
    expect(pairs.map((p) => `${p.a}-${p.b}`)).toEqual(["G1-G3", "G2-G3"]);
    expect(suspiciousPairs(r, [], 1)).toHaveLength(1);
  });
  it("même vidéo répartie entre deux groupes = paire prioritaire", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1], "A"), g("G2", [2], "B"), g("G3", [3], "C")] }), 3);
    expect(suspiciousPairs(r, ["v", null, "v"])[0]).toEqual({ a: "G1", b: "G3", why: ["même vidéo"] });
  });
  it("rien à vérifier → aucune paire (pas d'appel IA)", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "robe"), note(2, "sac")], groups: [g("G1", [1], "Robe"), g("G2", [2], "Sac")] }), 2);
    expect(suspiciousPairs(r)).toEqual([]);
  });
  it("photos représentatives : principale + une autre vue, vraies photos d'abord", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "robe"), note(2, "robe"), note(3, "robe", "dos")], groups: [g("G1", [1, 2, 3])] }), 3);
    expect(representativeItems(r.groups[0], r, [{}, {}, {}])).toEqual([0, 2]);
    expect(representativeItems(r.groups[0], r, [{}, {}, { videoRef: "v" }])).toEqual([0, 2]);
  });
});

describe("applyVerification", () => {
  const pairs = suspiciousPairs(split);

  it("same + high → fusion vers le groupe qui montre l'article entier, marquée à vérifier", () => {
    const v = applyVerification(split, pairs, { pairs: [{ a: "G1", b: "G2", verdict: "same", certainty: "high", reason: "même motif" }] });
    expect(v.groups.map((x) => [x.key, x.items])).toEqual([["G1", [0, 1, 2]], ["G3", [3]]]);
    expect(v.groups[0].reviewReasons).toContain(REVIEW_VERIFIED_MERGE);
    expect(v.groups[0].reviewReasons).not.toContain(REVIEW.partialOnly);
    expect(v.mergedFrom.G1).toEqual([{ key: "G2", items: [1, 2], main: 1, label: "Détail tissu" }]);
    expect(v.verification).toEqual({ pairs: 1, merged: 1, cleared: 0, unsure: 0 });
  });

  it("same + medium, unsure → aucune fusion", () => {
    for (const ans of [
      { verdict: "same" as const, certainty: "medium" as const },
      { verdict: "unsure" as const, certainty: "high" as const },
    ]) {
      const v = applyVerification(split, pairs, { pairs: [{ a: "G1", b: "G2", reason: "", ...ans }] });
      expect(v.groups).toHaveLength(3);
    }
  });

  it("different → retire l'alerte « vues partielles »", () => {
    const v = applyVerification(split, pairs, { pairs: [{ a: "G2", b: "G1", verdict: "different", certainty: "high", reason: "autre motif" }] });
    expect(v.groups.find((x) => x.key === "G2")!.reviewReasons).toEqual([]);
    expect(v.groups.find((x) => x.key === "G2")!.needsReview).toBe(false);
    expect(v.verification.cleared).toBe(1);
  });

  it("ignore une paire qu'on n'a pas demandée (jamais de fusion hors liste)", () => {
    const v = applyVerification(split, pairs, { pairs: [{ a: "G1", b: "G3", verdict: "same", certainty: "high", reason: "" }] });
    expect(v.groups).toHaveLength(3);
  });

  it("la fusion est annulable par le vendeur (« défusionner »)", () => {
    const v = applyVerification(split, pairs, { pairs: [{ a: "G1", b: "G2", verdict: "same", certainty: "high", reason: "" }] });
    const items = [1, 2, 3, 4].map((n) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, path: `u/products/${n}.webp`, videoRef: null, name: null }));
    let k = 0;
    const s = stateFromGrouping(items, v, () => `00000000-0000-4000-8000-0000000001${String(k++).padStart(2, "0")}`);
    expect(checkImportInvariants(s)).toEqual([]);
    const robe = s.groups[0];
    expect(robe.itemIds).toHaveLength(3);
    expect(robe.merged).toHaveLength(1);
    const back = unmergeGroup(s, robe.id, robe.merged[0].id);
    expect(back.groups.map((x) => x.itemIds.length)).toEqual([1, 2, 1]);
    expect(checkImportInvariants(back)).toEqual([]);
  });

  it("désactivé par défaut", () => {
    expect(verifyMode(undefined)).toBe("off");
    expect(verifyMode("ON")).toBe("on");
  });
});
