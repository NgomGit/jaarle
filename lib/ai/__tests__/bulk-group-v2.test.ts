import { describe, expect, it } from "vitest";
import {
  buildGroupingPrompt,
  captureRuns,
  checkCoverage,
  groupingPromptVersion,
  GroupingOutputSchema,
  GroupingOutputSchemaV1,
  normalizeGrouping,
  photoNoteText,
  REVIEW,
  type GroupingOutput,
  type RawPhotoNote,
} from "@/lib/ai/bulk-group";
import { groupHintsBlock } from "@/lib/ai/product-autofill";

// Bulk Upload — consigne v2 (inventaire visuel) et règles « à vérifier » explicites.

const out = (p: Partial<GroupingOutput>): GroupingOutput => ({ groups: [], unsure: [], duplicates: [], variants: [], ...p });
const g = (key: string, items: number[], label = key, confidence: "high" | "medium" | "low" = "high") => ({ key, items, main: items[0], confidence, label, reason: "" });
const note = (n: number, type: string, view: RawPhotoNote["view"] = "face", identifiable = true): RawPhotoNote => ({ n, type, colors: "rouge", pattern: "uni", details: "?", view, identifiable });

describe("consigne v2", () => {
  const p = buildGroupingPrompt(4, [{}, { videoRef: "v1" }, {}, {}], { exactDuplicates: [[0, 3]] });

  it("demande l'inventaire avant le regroupement, avec les champs attendus", () => {
    expect(p).toContain("ÉTAPE A — Inventaire");
    expect(p.indexOf("ÉTAPE A")).toBeLessThan(p.indexOf("ÉTAPE B"));
    for (const field of ['"type"', '"colors"', '"pattern"', '"details"', '"view"', '"identifiable"']) expect(p).toContain(field);
    expect(p).toContain("N'invente rien");
  });

  it("contient les règles contre les séparations ET contre les fusions", () => {
    expect(p).toContain("Ne sépare pas à tort");
    expect(p).toMatch(/changement d'angle, de cadrage, de lumière ou de fond n'est jamais une preuve/);
    expect(p).toMatch(/gros plan .* va dans le groupe de l'article dont les détails correspondent/);
    expect(p).toContain("Ne fusionne pas à tort");
    expect(p).toContain("groupes SÉPARÉS");
    expect(p).toContain("EXACTEMENT UNE FOIS");
  });

  it("garde les indices : vidéos, doublons certains", () => {
    expect(p).toContain("#2 : image tirée de la vidéo « v1 »");
    expect(p).toContain("Fichiers identiques (doublons certains, même article) : #1 et #4");
  });

  it("v1 reste disponible et inchangée (pas d'inventaire)", () => {
    const v1 = buildGroupingPrompt(3, [{}, {}, {}], {}, "v1");
    expect(v1).not.toContain("ÉTAPE A");
    expect(v1).toContain("Règles impératives");
    expect(groupingPromptVersion("v1")).toBe("v1");
    expect(groupingPromptVersion("v2")).toBe("v2");
    expect(groupingPromptVersion(undefined)).toBe("v1");
    expect(groupingPromptVersion("autre")).toBe("v1");
  });

  it("le schéma v2 exige l'inventaire, le v1 non", () => {
    const base = { groups: [], unsure: [], duplicates: [], variants: [] };
    expect(GroupingOutputSchemaV1.safeParse(base).success).toBe(true);
    expect(GroupingOutputSchema.safeParse(base).success).toBe(false);
    expect(GroupingOutputSchema.safeParse({ ...base, photos: [note(1, "robe")] }).success).toBe(true);
    expect(GroupingOutputSchema.safeParse({ ...base, photos: [{ ...note(1, "robe"), view: "profil" }] }).success).toBe(false);
  });
});

describe("ordre de prise de vue", () => {
  const t0 = 1_760_000_000_000;
  it("découpe en séries quand une pause dépasse 90 s", () => {
    const at = [t0, t0 + 10_000, t0 + 20_000, t0 + 300_000, t0 + 310_000, t0 + 900_000];
    expect(captureRuns(at)).toEqual([[0, 1, 2], [3, 4], [5]]);
  });
  it("suit l'ordre chronologique, pas l'ordre des numéros", () => {
    const at = [t0 + 400_000, t0, t0 + 5_000, t0 + 410_000];
    expect(captureRuns(at)).toEqual([[1, 2], [0, 3]]);
  });
  it("aucun indice si les dates manquent, sont identiques ou forment une seule série", () => {
    expect(captureRuns([t0, null, null, null, null])).toBeNull();
    expect(captureRuns([t0, t0, t0, t0, t0])).toBeNull();
    expect(captureRuns([t0, t0 + 1000, t0 + 2000, t0 + 3000, t0 + 60_000])).toBeNull();
    // Une série par photo : n'apporte rien.
    expect(captureRuns([t0, t0 + 200_000, t0 + 400_000, t0 + 600_000])).toBeNull();
  });
  it("la consigne v2 cite les séries, la v1 non", () => {
    const imgs = [t0, t0 + 1000, t0 + 2000, t0 + 500_000, t0 + 501_000].map((takenAt) => ({ takenAt }));
    expect(buildGroupingPrompt(5, imgs)).toContain("Séries de photos prises à la suite");
    expect(buildGroupingPrompt(5, imgs)).toContain("#1, #2, #3  |  #4, #5");
    expect(buildGroupingPrompt(5, imgs, {}, "v1")).not.toContain("Séries de photos");
  });
});

describe("normalizeGrouping — inventaire", () => {
  it("garde une note par photo, nettoie « ? » et les vues inconnues, ignore les numéros invalides", () => {
    const r = normalizeGrouping(
      out({
        photos: [note(1, "robe longue"), { ...note(2, "?"), view: "bizarre" as RawPhotoNote["view"] }, note(9, "sac"), note(1, "doublon")],
        groups: [g("G1", [1, 2])],
      }),
      2
    );
    expect(r.photos[0]).toMatchObject({ type: "robe longue", details: "", view: "face" });
    expect(r.photos[1]).toMatchObject({ type: "", view: "autre" });
    expect(r.issues.invalidIndices).toBe(0);
    expect(photoNoteText(r.photos[0])).toBe("robe longue · rouge · uni");
  });

  it("une sortie v1 (sans inventaire) reste acceptée", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2])] }), 2);
    expect(r.photos).toEqual([null, null]);
    expect(r.groups[0].needsReview).toBe(false);
    expect(r.signals).toEqual({ suspectedSplits: 0, suspectedMerges: 0, unresolved: 0 });
  });
});

describe("règles « à vérifier »", () => {
  it("un groupe d'une seule photo de face n'est PAS suspect", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "robe"), note(2, "sac")], groups: [g("G1", [1], "Robe rouge"), g("G2", [2], "Sac noir")] }), 2);
    expect(r.groups.every((x) => !x.needsReview)).toBe(true);
  });

  it("R3 : images d'une même vidéo dans deux groupes → les deux (séparation possible)", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2], "Robe"), g("G2", [3], "Robe bleue")] }), 3, { videoRefs: [null, "v1", "v1"] });
    expect(r.groups.map((x) => x.reviewReasons)).toEqual([[REVIEW.sameVideo], [REVIEW.sameVideo]]);
    expect(r.signals.suspectedSplits).toBe(2);
  });

  it("R3 : une vidéo entièrement dans un groupe n'alerte pas", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1, 2, 3], "Robe")] }), 3, { videoRefs: [null, "v1", "v1"] });
    expect(r.groups[0].needsReview).toBe(false);
  });

  it("R4 : même nom (accents, casse, pluriel) sans variante → les deux ; avec variante → seulement « variante »", () => {
    const r = normalizeGrouping(out({ groups: [g("G1", [1], "Robe wax rouge"), g("G2", [2], "robes WAX rouge")] }), 2);
    expect(r.groups.every((x) => x.reviewReasons.includes(REVIEW.sameLabel))).toBe(true);
    const v = normalizeGrouping(
      out({ groups: [g("G1", [1], "Robe wax"), g("G2", [2], "Robe wax")], variants: [{ groups: ["G1", "G2"], option: "Couleur", values: [], reason: "" }] }),
      2
    );
    expect(v.groups.map((x) => x.reviewReasons)).toEqual([[REVIEW.variant], [REVIEW.variant]]);
  });

  it("R5 : groupe fait seulement de gros plans / vues de dos alors qu'un autre article du même type existe (séparation à tort)", () => {
    const r = normalizeGrouping(
      out({
        photos: [note(1, "robe longue"), note(2, "robe longue", "dos"), note(3, "robe", "gros_plan"), note(4, "sac à main")],
        groups: [g("G1", [1], "Robe wax"), g("G2", [2, 3], "Détail de tissu"), g("G3", [4], "Sac")],
      }),
      4
    );
    expect(r.groups.find((x) => x.key === "G2")!.reviewReasons).toEqual([REVIEW.partialOnly]);
    expect(r.groups.find((x) => x.key === "G1")!.needsReview).toBe(false);
    expect(r.groups.find((x) => x.key === "G3")!.needsReview).toBe(false);
    expect(r.signals.suspectedSplits).toBe(1);
  });

  it("R5 : un gros plan seul d'un type qu'on ne retrouve nulle part n'alerte pas", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "robe"), note(2, "bracelet", "gros_plan")], groups: [g("G1", [1]), g("G2", [2], "Bracelet")] }), 2);
    expect(r.groups.every((x) => !x.needsReview)).toBe(true);
  });

  it("R6 : deux types d'article incompatibles dans un groupe → fusion possible", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "t-shirt"), note(2, "jean"), note(3, "t-shirt", "dos")], groups: [g("G1", [1, 2, 3], "Tenue")] }), 3);
    expect(r.groups[0].reviewReasons).toContain(REVIEW.mixedTypes);
    expect(r.signals.suspectedMerges).toBe(1);
  });

  it("R6 : types proches (robe / robe longue) ne déclenchent rien", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "robe"), note(2, "Robe longue", "porte")], groups: [g("G1", [1, 2])] }), 2);
    expect(r.groups[0].needsReview).toBe(false);
  });

  it("R7 : photo illisible placée dans un groupe → à vérifier ; ignorée pour R6", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "sac"), note(2, "chaussure", "autre", false)], groups: [g("G1", [1, 2])] }), 2);
    expect(r.groups[0].reviewReasons).toEqual([REVIEW.unreadable]);
  });

  it("les non rangées sont comptées, la couverture reste garantie", () => {
    const r = normalizeGrouping(out({ photos: [note(1, "robe")], groups: [g("G1", [1])], unsure: [{ item: 2, candidates: ["G1"], reason: "gros plan" }] }), 3);
    expect(r.signals.unresolved).toBe(2);
    expect(checkCoverage(r)).toEqual({ missing: [], repeated: [] });
  });
});

describe("fiche produit — contexte du groupe", () => {
  it("rien sans indice", () => {
    expect(groupHintsBlock()).toBe("");
    expect(groupHintsBlock({ label: " ", notes: [null, ""] })).toBe("");
  });
  it("nom provisoire + notes numérotées dans l'ordre des photos", () => {
    const b = groupHintsBlock({ label: "Robe wax rouge", notes: ["robe · rouge", null, "robe · dos"] });
    expect(b).toContain("« Robe wax rouge »");
    expect(b).toContain("photo 1 : robe · rouge");
    expect(b).toContain("photo 3 : robe · dos");
    expect(b).not.toContain("photo 2");
    expect(b).toContain("MÊME article");
  });
  it("notes sans nom : pas de phrase sur le nom provisoire", () => {
    expect(groupHintsBlock({ notes: ["sac"] })).not.toContain("nom provisoire :");
  });
});

describe("fiche produit — produit décliné en couleurs", () => {
  it("demande un nom sans couleur quand l'option Couleur existe", () => {
    const b = groupHintsBlock({ label: "Chemise losange vert", options: [{ name: "Couleur", values: ["Blanc", "Vert", "Noir"] }] });
    expect(b).toContain("Couleur : Blanc, Vert, Noir");
    expect(b).toContain("n'écris AUCUNE couleur");
    expect(b).toContain("MÊME modèle");
    expect(b).not.toContain("MÊME article");
  });
  it("une option à une seule valeur est ignorée", () => {
    expect(groupHintsBlock({ options: [{ name: "Couleur", values: ["Blanc"] }] })).toBe("");
  });
});
