import { describe, expect, it } from "vitest";
import { cropRectFor } from "@/lib/poster-v2/photos";
import { formatPhone, formatPrice } from "@/lib/poster-v2/format";
import { LAYOUTS, LAYOUT_IDS, frameRectToScene, productFamily } from "@/lib/poster-v2/layouts";
import { eligibleLayouts, layoutTryOrder } from "@/lib/poster-v2/eligibility";
import { fitTitle, tokenizeTitle } from "@/lib/poster-v2/text-fit";
import { TYPE_PAIR_DEFS } from "@/lib/poster-v2/fonts";
import { contrast, veilAlphaFor, accentOn, mix } from "@/lib/poster-v2/color";
import { VARIANT_DEFS } from "@/lib/poster-v2/render/variants";

describe("format", () => {
  it("prix FCFA avec espace insécable, ou Sur devis", () => {
    const p = formatPrice(185000);
    expect(p.amount?.replace(/\u00a0/g, " ")).toBe("185 000");
    expect(p.label.replace(/\u00a0/g, " ")).toBe("185 000 FCFA");
    expect(formatPrice(null).label).toBe("Sur devis");
    expect(formatPrice(0).amount).toBeNull();
  });
  it("téléphone : premier numéro, format sénégalais", () => {
    // Espaces insécables : le numéro ne se coupe jamais en fin de ligne.
    const n = (s: string) => s.replace(/\u00a0/g, " ");
    expect(n(formatPhone("771234567|781112233"))).toBe("+221 77 123 45 67");
    expect(n(formatPhone("+221 77 123 45 67"))).toBe("+221 77 123 45 67");
    expect(formatPhone("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78");
  });
});

describe("cropRectFor", () => {
  it("respecte le ratio et reste dans l'image", () => {
    const r = cropRectFor(4000, 3000, 1, { x: 80, y: 80, w: 15, h: 15 });
    expect(Math.abs(r.width / r.height - 1)).toBeLessThan(0.01);
    expect(r.left + r.width).toBeLessThanOrEqual(4000);
    expect(r.top + r.height).toBeLessThanOrEqual(3000);
  });
  it("contient la zone utile", () => {
    const r = cropRectFor(2000, 2000, 0.8, { x: 40, y: 10, w: 20, h: 30 });
    expect(r.left).toBeLessThanOrEqual(800);
    expect(r.left + r.width).toBeGreaterThanOrEqual(1200);
    expect(r.top).toBeLessThanOrEqual(200);
    expect(r.top + r.height).toBeGreaterThanOrEqual(800);
  });
  it("sans zone : image entière au ratio", () => {
    const r = cropRectFor(3000, 2000, 1);
    expect(r.width).toBe(2000);
    expect(r.height).toBe(2000);
  });
});

describe("layouts", () => {
  it("9 mises en page, slots cohérents", () => {
    expect(LAYOUT_IDS).toHaveLength(9);
    for (const id of LAYOUT_IDS) {
      expect(LAYOUTS[id].slots).toHaveLength(LAYOUTS[id].secondaryCount);
      expect(VARIANT_DEFS[id]).toBeDefined();
    }
  });
  it("frameRectToScene : cadre plein = identité, cadre recadré = rétréci et centré", () => {
    expect(frameRectToScene({ x: 0, y: 0, w: 100, h: 100 }, LAYOUTS["HERO_DETAIL.A"])).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    const r = frameRectToScene({ x: 0, y: 0, w: 100, h: 100 }, LAYOUTS["HERO_DETAIL.C"]);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + r.w).toBeCloseTo(100 - r.x, 0);
  });
  it("familles de produits", () => {
    expect(productFamily("fashion", "Baskets montantes")).toBe("chaussures");
    expect(productFamily("automotive")).toBe("auto");
    expect(productFamily(null)).toBe("autre");
  });
});

describe("eligibility", () => {
  const base = { heroQuality: 0.9, industry: "fashion", title: "Robe wax", benefitsCount: 1 };
  it("0 photo secondaire → repli V1", () => {
    expect(eligibleLayouts({ ...base, secondaries: [] })).toEqual([]);
  });
  it("1 photo → HERO_DETAIL uniquement", () => {
    const ids = eligibleLayouts({ ...base, secondaries: [{ role: "detail", quality: 0.8 }] }).map((s) => s.id);
    expect(ids.length).toBe(3);
    expect(ids.every((i) => i.startsWith("HERO_DETAIL"))).toBe(true);
  });
  it("2 photos moyennes → pas de COLLAGE", () => {
    const ids = eligibleLayouts({ ...base, secondaries: [{ role: "detail", quality: 0.8 }, { role: "alternate_angle", quality: 0.5 }] }).map((s) => s.id);
    expect(ids.some((i) => i.startsWith("COLLAGE"))).toBe(false);
    expect(ids.every((i) => i.startsWith("DETAIL_STRIP"))).toBe(true);
  });
  it("2 bonnes photos → DETAIL_STRIP et COLLAGE", () => {
    const ids = eligibleLayouts({ ...base, secondaries: [{ role: "detail", quality: 0.8 }, { role: "alternate_angle", quality: 0.8 }] }).map((s) => s.id);
    expect(ids.some((i) => i.startsWith("COLLAGE"))).toBe(true);
  });
  it("photo portée → jamais dans une petite case", () => {
    const ids = eligibleLayouts({ ...base, secondaries: [{ role: "usage", quality: 0.9, hasPerson: true }] }).map((s) => s.id);
    expect(ids).not.toContain("HERO_DETAIL.A");
  });
  it("rotation : la même mise en page 2 fois de suite est exclue", () => {
    const ids = eligibleLayouts({ ...base, secondaries: [{ role: "detail", quality: 0.8 }], recentLayouts: ["HERO_DETAIL.B", "HERO_DETAIL.B"] }).map((s) => s.id);
    expect(ids).not.toContain("HERO_DETAIL.B");
  });
  it("texte long → variante roomy en tête", () => {
    const out = eligibleLayouts({ ...base, title: "Robe longue en wax imprimé avec ceinture assortie", benefitsCount: 3, secondaries: [{ role: "detail", quality: 0.8 }] });
    expect(out[0].id).toBe("HERO_DETAIL.C");
  });
  it("choix du directeur hors liste ignoré", () => {
    const el = eligibleLayouts({ ...base, secondaries: [{ role: "detail", quality: 0.8 }] });
    expect(layoutTryOrder(el, "COLLAGE.B")[0]).toBe(el[0].id);
    expect(layoutTryOrder(el, "HERO_DETAIL.B")[0]).toBe("HERO_DETAIL.B");
  });
});

describe("text-fit", () => {
  it("marque le groupe mis en valeur", () => {
    const t = tokenizeTitle("Montre automatique Héritage", "Héritage");
    expect(t.map((x) => x.accent)).toEqual([false, false, true]);
  });
  it("tient dans la largeur, sinon null", async () => {
    const pair = TYPE_PAIR_DEFS.T4;
    const ok = await fitTitle({ title: "Canapé velours", pair, maxWidth: 600, maxLines: 2, maxSize: 80, minSize: 40 });
    expect(ok).not.toBeNull();
    expect(ok!.lines.length).toBeLessThanOrEqual(2);
    const ko = await fitTitle({ title: "Un titre beaucoup trop long pour une seule petite ligne étroite", pair, maxWidth: 300, maxLines: 1, maxSize: 60, minSize: 40 });
    expect(ko).toBeNull();
  });
});

describe("color", () => {
  it("voile : contraste visé atteint", () => {
    const under = { r: 200, g: 120, b: 60 };
    const a = veilAlphaFor(under, "#141414", "#FFFFFF");
    expect(contrast(mix(under, "#141414", a), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
  it("accent ajusté lisible", () => {
    expect(contrast(accentOn("#B5683F", "#2A2A2A"), "#2A2A2A")).toBeGreaterThanOrEqual(3);
  });
});

describe("mesure du texte (toutes les polices)", () => {
  it("chaque paire mesure sans erreur et de façon cohérente", async () => {
    const { loadMetrics } = await import("@/lib/poster-v2/fonts");
    const { textWidth } = await import("@/lib/poster-v2/text-fit");
    for (const pair of Object.values(TYPE_PAIR_DEFS)) {
      for (const face of [pair.display, ...(pair.accent ? [pair.accent] : [])]) {
        const font = await loadMetrics(face);
        const short = textWidth(font, "M40i", 60);
        const long = textWidth(font, "BMW X4 M40i fi", 60);
        expect(short).toBeGreaterThan(0);
        expect(long).toBeGreaterThan(short);
      }
    }
  });
});

describe("eligibility : vue d'ensemble", () => {
  it("pénalise les petites cases et la loupe", () => {
    const base = { heroQuality: 0.9, industry: "automotive", title: "BMW X4 M40i", benefitsCount: 2 };
    const two = eligibleLayouts({ ...base, secondaries: [{ role: "detail", quality: 0.8 }, { role: "alternate_angle", quality: 0.8, wholeProduct: true }] });
    const score = (id: string) => two.find((s) => s.id === id)!.score;
    expect(score("DETAIL_STRIP.B")).toBeLessThan(score("DETAIL_STRIP.A"));
    const one = eligibleLayouts({ ...base, secondaries: [{ role: "alternate_angle", quality: 0.8, wholeProduct: true }] });
    expect(one[one.length - 1].id).toBe("HERO_DETAIL.A");
  });
});
