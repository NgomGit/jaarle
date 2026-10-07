import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  applyGate,
  cellsToBox,
  dHash,
  hammingHex,
  sanitizeBox,
  sanitizeCaption,
  type LocalPhotoMetrics,
  type RawAnalysis,
  type RawPhoto,
} from "@/lib/poster-v2/analysis";

const photo = (index: number, o: Partial<RawPhoto> = {}): RawPhoto => ({
  index,
  role: index === 0 ? "hero" : "detail",
  same_subject: true,
  confidence: 0.95,
  quality: 0.8,
  quality_issues: [],
  framing: index === 0 ? "whole_product" : "close_up",
  has_person: false,
  subject_cells: [4, 5, 6, 7, 8, 9],
  focus_cells: [5],
  caption: "Intérieur cuir",
  ...o,
});

const raw = (photos: RawPhoto[], o: Partial<RawAnalysis> = {}): RawAnalysis => ({
  subject_type: "product",
  identity_confidence: 0.95,
  main_image_index: 0,
  photos,
  identity: {
    category: "SUV coupé",
    shape: "coupé",
    colors: ["deep blue"],
    materials: ["metal"],
    branding: ["BMW"],
    distinctive_details: [],
    critical_features: [],
    never_change: [],
    potential_conflicts: [],
  },
  positioning: "premium / haut de gamme",
  visual_notes: "",
  accent_gradient: { from: "#1E3A8A", to: "#2563EB" },
  selling_points: ["Intérieur cuir"],
  ...o,
});

// Empreintes nettement différentes par défaut.
const m = (hash: string, o: Partial<LocalPhotoMetrics> = {}): LocalPhotoMetrics => ({ width: 1080, height: 1080, sharpness: 500, hash, ...o });
const H = ["0000000000000000", "ffffffffffffffff", "0f0f0f0f0f0f0f0f", "f0f0f0f0f0f0f0f0"];

describe("porte de sécurité", () => {
  it("analyse en échec → repli V1", () => {
    const g = applyGate(null, [m(H[0]), m(H[1])], { heroFixed: true });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe("analyse_en_echec");
  });

  it("identité incertaine → repli V1 sans réutiliser l'analyse", () => {
    const g = applyGate(raw([photo(0), photo(1)], { identity_confidence: 0.7 }), [m(H[0]), m(H[1])], { heroFixed: true });
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.reason).toBe("identite_incertaine");
      expect(g.productAnalysis).toBeNull();
    }
  });

  it("garde une bonne photo du même produit", () => {
    const g = applyGate(raw([photo(0), photo(1)]), [m(H[0]), m(H[1])], { heroFixed: true });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.secondaries).toHaveLength(1);
      expect(g.secondaries[0].caption).toBe("Intérieur cuir");
      // Détail : cadrage sur la zone utile.
      expect(g.secondaries[0].focus).toEqual({ x: 33.3, y: 33.3, w: 33.3, h: 33.3 });
    }
  });

  it("écarte : autre produit, confiance basse, qualité, floue, trop petite, doublon", () => {
    const photos = [
      photo(0),
      photo(1, { same_subject: false }),
      photo(2, { confidence: 0.8 }),
      photo(3, { quality: 0.3 }),
    ];
    const g = applyGate(raw(photos), [m(H[0]), m(H[1]), m(H[2]), m(H[3])], { heroFixed: true });
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.reason).toBe("aucune_photo_secondaire");
      expect(g.excluded.map((e) => e.reason).sort()).toEqual(["autre_produit", "confiance_basse", "qualite_insuffisante"]);
      expect(g.productAnalysis).not.toBeNull();
    }
    const g2 = applyGate(raw([photo(0), photo(1), photo(2), photo(3)]), [m(H[0]), m(H[1], { sharpness: 5 }), m(H[2], { width: 300 }), m("0000000000000001")], { heroFixed: true });
    if (!g2.ok) expect(g2.excluded.map((e) => e.reason).sort()).toEqual(["doublon", "floue", "trop_petite"]);
    else throw new Error("attendu : repli");
  });

  it("au plus 2 photos, les détails d'abord", () => {
    const photos = [photo(0), photo(1, { role: "alternate_angle", framing: "whole_product" }), photo(2, { role: "detail" }), photo(3, { role: "texture" })];
    const g = applyGate(raw(photos), [m(H[0]), m(H[1]), m(H[2]), m(H[3])], { heroFixed: true });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.secondaries.map((s) => s.role)).toEqual(["detail", "texture"]);
      expect(g.excluded).toEqual([{ index: 1, reason: "en_trop" }]);
    }
  });

  it("vue d'ensemble : cadrage sur le sujet, marquée wholeProduct", () => {
    const g = applyGate(raw([photo(0), photo(1, { role: "alternate_angle", framing: "whole_product" })]), [m(H[0]), m(H[1])], { heroFixed: true });
    if (!g.ok) throw new Error("attendu : ok");
    expect(g.secondaries[0].wholeProduct).toBe(true);
    expect(g.secondaries[0].focus).toEqual({ x: 0, y: 33.3, w: 100, h: 66.7 });
  });

  it("photo principale choisie par l'IA si non imposée, jamais hors limites", () => {
    const g = applyGate(raw([photo(0, { role: "detail" }), photo(1, { role: "hero" })], { main_image_index: 1 }), [m(H[0]), m(H[1])], { heroFixed: false });
    expect(g.heroIndex).toBe(1);
    const g2 = applyGate(raw([photo(0), photo(1)], { main_image_index: 7 }), [m(H[0]), m(H[1])], { heroFixed: false });
    expect(g2.heroIndex).toBe(0);
  });

  it("photo oubliée par l'analyse → non vérifiée, écartée", () => {
    const g = applyGate(raw([photo(0)]), [m(H[0]), m(H[1])], { heroFixed: true });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.excluded).toEqual([{ index: 1, reason: "non_analysee" }]);
  });
});

describe("normalisation", () => {
  it("cellsToBox : grille 3 × 3 → rectangle", () => {
    expect(cellsToBox([3, 6])).toEqual({ x: 66.7, y: 0, w: 33.3, h: 66.7 });
    expect(cellsToBox([1, 9])).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(cellsToBox([0, 12])).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(cellsToBox([])).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
  it("sanitizeBox : bornes, échelle 0-1, trop petit → photo entière", () => {
    expect(sanitizeBox({ x: 90, y: 90, w: 40, h: 40 })).toEqual({ x: 90, y: 90, w: 10, h: 10 });
    expect(sanitizeBox({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 })).toEqual({ x: 10, y: 20, w: 50, h: 50 });
    expect(sanitizeBox({ x: 10, y: 10, w: 3, h: 50 })).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(sanitizeBox(null)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
  it("sanitizeCaption : court, sinon libellé du rôle", () => {
    expect(sanitizeCaption("« intérieur cuir »", "detail")).toBe("Intérieur cuir");
    expect(sanitizeCaption("Une très longue légende qui ne tient pas", "alternate_angle")).toBe("Autre vue");
    expect(sanitizeCaption("", "texture")).toBe("Matière");
  });
});

describe("empreinte dHash", () => {
  it("même image redimensionnée ≈ même empreinte ; image différente ≠", async () => {
    const grad = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#000" } })
      .composite([{ input: Buffer.from('<svg width="400" height="300"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="120" cy="150" r="60" fill="#f00"/></svg>') }])
      .jpeg()
      .toBuffer();
    const small = await sharp(grad).resize(200).jpeg({ quality: 70 }).toBuffer();
    const flipped = await sharp(grad).flop().jpeg().toBuffer();
    const [a, b, c] = await Promise.all([dHash(grad), dHash(small), dHash(flipped)]);
    expect(hammingHex(a, b)).toBeLessThanOrEqual(6);
    expect(hammingHex(a, c)).toBeGreaterThan(6);
  });
});
