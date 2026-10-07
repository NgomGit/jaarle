import { describe, expect, it } from "vitest";
import {
  benefitCandidates,
  defaultDirection,
  kickerCandidates,
  sanitizeSceneText,
  validateAccent,
  validateDirection,
  validatePalette,
  validateTitle,
  type DirectorInput,
  type RawDirection,
} from "@/lib/poster-v2/creative-director";
import { eligibleLayouts } from "@/lib/poster-v2/eligibility";

const analysis: DirectorInput["analysis"] = {
  identity: {
    category: "SUV coupé compact sportif",
    shape: "coupé",
    colors: ["dark blue"],
    materials: ["leather"],
    branding: ["BMW"],
    distinctive_details: [],
    critical_features: [],
    never_change: [],
    potential_conflicts: [],
  },
  selling_points: ["Finition M Sport", "livraison gratuite", "Sellerie cuir premium"],
  positioning: "premium / haut de gamme",
  accent_gradient: { from: "#1E40AF", to: "#3B82F6" },
  visual_notes: "",
};
const secondaries = [
  { index: 2, role: "detail" as const, caption: "Habitacle cuir", focus: { x: 0, y: 0, w: 100, h: 100 }, quality: 0.8, hasPerson: false, wholeProduct: false },
  { index: 1, role: "alternate_angle" as const, caption: "Vue arrière", focus: { x: 0, y: 0, w: 100, h: 100 }, quality: 0.85, hasPerson: false, wholeProduct: true },
];
const input: DirectorInput = {
  productName: "BMW X4 M40i 2020 full options",
  industry: "automotive",
  price: 38500000,
  analysis,
  secondaries,
  eligible: eligibleLayouts({ heroQuality: 0.88, secondaries, industry: "automotive", title: "BMW X4 M40i", benefitsCount: 2 }),
  heroImage: Buffer.alloc(0),
};
const raw = (o: Partial<RawDirection> = {}): RawDirection => ({
  layout: "DETAIL_STRIP.A",
  type_pair: "T5",
  palette: { dark: "#0B1220", light: "#F1F2F4", accent: "#3D8BFF", muted: "#5B6475" },
  title: "BMW X4 M40i",
  title_accent: "M40i",
  kicker_choice: 1,
  benefit_choices: [1, 2],
  mood: "confident, premium",
  environment: "minimal dark concrete showroom",
  lighting: "cool rim light",
  rationale: "ok",
  ...o,
});

describe("textes : jamais inventés", () => {
  it("titre raccourci avec les mots du nom, sinon le nom", () => {
    expect(validateTitle("BMW X4 M40i", "BMW X4 M40i 2020 full options")).toEqual({ title: "BMW X4 M40i", corrected: false });
    expect(validateTitle("BMW X4 M40i neuve", "BMW X4 M40i 2020").title).toBe("BMW X4 M40i 2020");
    expect(validateTitle("M40i BMW", "BMW X4 M40i").title).toBe("BMW X4 M40i");
    expect(validateTitle("BMW X4 promo", "BMW X4 promo").title).toBe("BMW X4 promo");
    expect(validateTitle("BMW", "BMW X4 M40i").title).toBe("BMW X4 M40i");
  });
  it("mot accentué = mots entiers du titre", () => {
    expect(validateAccent("m40i", "BMW X4 M40i")).toBe("M40i");
    expect(validateAccent("X4 M40i", "BMW X4 M40i")).toBe("X4 M40i");
    expect(validateAccent("Sport", "BMW X4 M40i")).toBeNull();
    expect(validateAccent("BMW X4 M40i", "BMW X4 M40i")).toBeNull();
  });
  it("candidats filtrés (pas de promesse)", () => {
    expect(benefitCandidates(input)).toEqual(["Finition M Sport", "Sellerie cuir premium"]);
    expect(kickerCandidates({ ...input, vendorKicker: "-50% ce week-end" })).toEqual(["SUV coupé compact sportif"]);
  });
  it("texte de scène : pas de texte dans l'image", () => {
    expect(sanitizeSceneText("showroom with a neon sign", "fb")).toBe("fb");
    expect(sanitizeSceneText("dark showroom", "fb")).toBe("dark showroom");
  });
});

describe("palette", () => {
  it("corrige un sombre trop clair et un hex invalide", () => {
    const fb = { dark: "#111111", light: "#F4F1EC", accent: "#C9A45C", muted: "#666666" };
    const r = validatePalette({ dark: "#888888", light: "nope", accent: "#3D8BFF", muted: "#5B6475" }, fb);
    expect(r.palette.dark).toBe("#111111");
    expect(r.palette.light).toBe("#F4F1EC");
    expect(r.corrections.length).toBe(2);
  });
});

describe("validateDirection", () => {
  it("réponse correcte : gardée", () => {
    const d = validateDirection(raw(), input);
    expect(d.layout).toBe("DETAIL_STRIP.A");
    expect(d.copy).toEqual({ title: "BMW X4 M40i", titleAccent: "M40i", kicker: "SUV coupé compact sportif", benefits: ["Finition M Sport", "Sellerie cuir premium"] });
    expect(d.tryOrder[0]).toBe("DETAIL_STRIP.A");
    expect(d.corrections).toEqual([]);
  });
  it("mise en page non autorisée / paire inconnue / numéros hors liste → corrigés", () => {
    const d = validateDirection(raw({ layout: "HERO_DETAIL.A", type_pair: "T9", benefit_choices: [9, 2] }), input);
    expect(d.layout).toBe(input.eligible[0].id);
    expect(d.typePair).toBe("T5");
    expect(d.copy.benefits).toEqual(["Sellerie cuir premium"]);
    expect(d.corrections.length).toBe(3);
  });
  it("direction par défaut : complète et autorisée", () => {
    const d = defaultDirection(input);
    expect(d.source).toBe("default");
    expect(input.eligible.map((e) => e.id)).toContain(d.layout);
    expect(d.copy.title).toBe("BMW X4 M40i 2020 full options");
  });
});

describe("texte de scène long", () => {
  it("coupé au mot, ≤ 160 caractères", () => {
    const long = "upscale modern showroom with polished concrete floor and soft architectural backdrop, minimal furniture, large glass windows, warm evening ambience everywhere around";
    const s = sanitizeSceneText(long, "fb");
    expect(s.length).toBeLessThanOrEqual(160);
    expect(long.startsWith(s)).toBe(true);
    expect(long[s.length] === " " || long[s.length] === "," || s.length === long.length).toBe(true);
  });
});

describe("paire T1 et chiffres", () => {
  it("titre avec chiffres → pas de T1", () => {
    const d = validateDirection(raw({ type_pair: "T1", title: "BMW X4 M40i 2020" }), input);
    expect(d.typePair).toBe("T5");
    const d2 = validateDirection(raw({ type_pair: "T1", title: "BMW" }), { ...input, productName: "Montre Héritage" });
    expect(d2.typePair).toBe("T1");
  });
});
