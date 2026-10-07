import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LAYOUTS, LAYOUT_IDS } from "@/lib/poster-v2/layouts";
import { OVER_SCENE, evaluateFit } from "@/lib/poster-v2/overlays";
import { coverRect } from "@/lib/poster-v2/photos";
import { buildScenePrompt, sceneZones } from "@/lib/poster-v2/scene";
import { interpretCheck, sanitizeProductBox, type RawSceneCheck } from "@/lib/poster-v2/qa";
import { candidateLayouts, produceScene, type SceneStepDeps } from "@/lib/poster-v2/scene-step";
import type { Direction } from "@/lib/poster-v2/creative-director";
import type { SceneRequest, SceneResult } from "@/lib/poster-v2/scene";

const identity = {
  category: "SUV coupé",
  shape: "sloping coupe roofline, long hood",
  colors: ["dark blue metallic", "black"],
  materials: ["painted metal", "glass", "chrome"],
  branding: ["BMW"],
  distinctive_details: ["kidney grille"],
  critical_features: ["large double kidney grille", "five-spoke black wheels"],
  never_change: ["the paint color", "the grille shape"],
  potential_conflicts: ["a different BMW model"],
};

const direction = {
  model: "test",
  prompt_version: "cd-v2.0",
  source: "ai",
  layout: "HERO_DETAIL.B",
  tryOrder: ["HERO_DETAIL.B", "HERO_DETAIL.A", "HERO_DETAIL.C"],
  typePair: "T5",
  palette: { dark: "#0E1420", light: "#F2F0EC", accent: "#2F6FE4", muted: "#6B7280" },
  copy: { title: "BMW X4 M40i", titleAccent: "M40i", kicker: null, benefits: [] },
  scene: { mood: "premium, confident", environment: "dark showroom with polished concrete floor", lighting: "low golden rim light" },
  corrections: [],
  rationale: "",
} as Direction;

describe("overlays / recouvrement", () => {
  it("chaque boîte posée sur la scène touche bien le cadre de la scène", () => {
    for (const id of LAYOUT_IDS) {
      const f = LAYOUTS[id].scene.frame;
      for (const o of OVER_SCENE[id]) {
        const w = Math.min(o.x + o.w, f.x + f.w) - Math.max(o.x, f.x);
        const h = Math.min(o.y + o.h, f.y + f.h) - Math.max(o.y, f.y);
        expect(w > 0 && h > 0, `${id} ${JSON.stringify(o)}`).toBe(true);
      }
    }
  });

  it("un produit qui remplit sa zone prévue n'est recouvert dans AUCUNE mise en page", () => {
    for (const id of LAYOUT_IDS) {
      const spec = LAYOUTS[id];
      const [sw, sh] = spec.scene.aspect === "1:1" ? [2048, 2048] : spec.scene.aspect === "3:2" ? [1536, 1024] : [1024, 1536];
      const z = sceneZones(spec).hero;
      // Produit à 92 % de sa zone, centré.
      const hero = { x: z.x + z.w * 0.04, y: z.y + z.h * 0.04, w: z.w * 0.92, h: z.h * 0.92 };
      const fit = evaluateFit(id, hero, sw, sh);
      expect(fit.ok, `${id} : ${fit.reasons.join(", ")}`).toBe(true);
    }
  });

  it("Encart débordant sur la calandre (cas BMW) → refusé", () => {
    const fit = evaluateFit("HERO_DETAIL.B", { x: 40, y: 20, w: 58, h: 70 }, 1536, 1024);
    expect(fit.ok).toBe(false);
    expect(fit.coveredByContent).toBeGreaterThan(0.05);
  });

  it("produit coupé par le recadrage → refusé", () => {
    // Pellicule : cadre 972 × 524 dans une scène 3:2 → haut et bas recadrés.
    const fit = evaluateFit("DETAIL_STRIP.C", { x: 20, y: 2, w: 60, h: 96 }, 1536, 1024);
    expect(fit.ok).toBe(false);
    expect(fit.visible).toBeLessThan(0.96);
  });

  it("coverRect : ratio respecté, borné", () => {
    const r = coverRect(1536, 1024, 972, 524, { x: 50, y: 50 });
    expect(Math.abs(r.width / r.height - 972 / 524)).toBeLessThan(0.01);
    expect(r.top + r.height).toBeLessThanOrEqual(1024);
  });
});

describe("prompt de scène", () => {
  const req = { layout: "HERO_DETAIL.B" as const, direction, productName: "BMW X4 M40i 2020", identity };
  it("contient produit, détails critiques, zone produit, zones calmes, interdits", () => {
    const p = buildScenePrompt(req);
    expect(p).toContain("BMW X4 M40i 2020");
    expect(p).toContain("large double kidney grille");
    expect(p).toContain("never change: the grille shape");
    expect(p).toMatch(/Place the whole product inside the area from \d+% to \d+% of the width/);
    expect(p).toContain("CALM");
    expect(p).toContain("FORBIDDEN");
    expect(p).toContain("Exactly ONE instance");
    expect(p).not.toContain("previous attempt");
  });
  it("nouvel essai : problèmes ajoutés", () => {
    const p = buildScenePrompt({ ...req, retryIssues: ["the grille shape was changed"] });
    expect(p).toContain("the grille shape was changed");
  });
  it("cadre recadré (Pellicule) : zone visible annoncée", () => {
    expect(buildScenePrompt({ ...req, layout: "DETAIL_STRIP.C" })).toContain("will be shown on the poster");
    expect(buildScenePrompt(req)).not.toContain("will be shown on the poster");
  });
});

const raw = (over: Partial<RawSceneCheck> = {}): RawSceneCheck => ({
  same_product: true,
  same_angle: true,
  colors_preserved: true,
  details_preserved: true,
  not_redesigned: true,
  single_instance: true,
  no_lookalikes: true,
  no_added_text_or_logo: true,
  product_fully_visible: true,
  clean_realistic: true,
  product_box: { left: 6, top: 14, right: 64, bottom: 90 },
  issues: [],
  ...over,
});

describe("contrôle de scène", () => {
  it("tout vrai → passe, boîte convertie", () => {
    const r = interpretCheck(raw());
    expect(r.passed).toBe(true);
    expect(r.heroBox).toEqual({ x: 6, y: 14, w: 58, h: 76 });
  });
  it("un point bloquant faux → échec avec problème", () => {
    const r = interpretCheck(raw({ single_instance: false, issues: ["a second car appears"] }));
    expect(r.passed).toBe(false);
    expect(r.failed).toContain("single_instance");
    expect(r.issues).toEqual(["a second car appears"]);
  });
  it("boîte absurde → échec ; boîte en 0-1 → remise en %", () => {
    expect(interpretCheck(raw({ product_box: { left: 50, top: 50, right: 52, bottom: 90 } })).passed).toBe(false);
    expect(sanitizeProductBox({ left: 0.1, top: 0.2, right: 0.6, bottom: 0.9 })).toEqual({ x: 10, y: 20, w: 50, h: 70 });
  });
});

describe("étape scène (orchestration)", () => {
  const img = sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#333" } }).jpeg().toBuffer();
  const fakeScene = async (aspect: "3:2" | "1:1" = "3:2", requested: "3:2" | "1:1" = "3:2"): Promise<SceneResult> => ({
    image: await img,
    width: 1536,
    height: 1024,
    aspect,
    requestedAspect: requested,
    prompt: "",
    model: "fake",
    promptVersion: "test",
  });
  const input = { direction, analysis: { identity }, productName: "BMW X4 M40i", hero: Buffer.from(""), secondaries: [] };
  const okCheck = async () => interpretCheck(raw());

  it("cas normal : 1 image + 1 contrôle, mise en page gardée", async () => {
    const deps: SceneStepDeps = { generate: vi.fn(() => fakeScene()), check: vi.fn(okCheck) };
    const r = await produceScene(input, deps);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.layouts[0]).toBe("HERO_DETAIL.B");
    expect(r.calls).toEqual({ image: 1, qa: 1 });
  });

  it("contrôle en échec puis OK : le 2e essai reçoit les problèmes", async () => {
    const generate = vi.fn((_req: SceneRequest) => fakeScene());
    const check = vi.fn().mockResolvedValueOnce(interpretCheck(raw({ not_redesigned: false, issues: ["the grille shape was changed"] }))).mockImplementation(okCheck);
    const r = await produceScene(input, { generate, check });
    expect(r.status).toBe("ok");
    expect(generate.mock.calls[1][0].retryIssues).toEqual(["the grille shape was changed"]);
  });

  it("2 échecs → repli V1", async () => {
    const r = await produceScene(input, { generate: () => fakeScene(), check: async () => interpretCheck(raw({ same_product: false })) });
    expect(r.status).toBe("fallback_v1");
    expect(r.calls).toEqual({ image: 2, qa: 2 });
  });

  it("contrôle indisponible → repli V1 immédiat (fermé)", async () => {
    const generate = vi.fn((_req: SceneRequest) => fakeScene());
    const r = await produceScene(input, { generate, check: async () => ({ status: "error", error: "timeout" }) });
    expect(r.status).toBe("fallback_v1");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("produit sous l'encart → nouvel essai avec consigne de placement", async () => {
    const generate = vi.fn((_req: SceneRequest) => fakeScene());
    const check = vi.fn().mockResolvedValueOnce(interpretCheck(raw({ product_box: { left: 40, top: 20, right: 98, bottom: 90 } }))).mockImplementation(okCheck);
    const r = await produceScene(input, { generate, check });
    expect(r.status).toBe("ok");
    expect(r.attempts[0].outcome).toBe("placement_failed");
    expect(generate.mock.calls[1][0].retryIssues?.[0]).toMatch(/calm/);
  });

  it("erreur de génération puis succès", async () => {
    const generate = vi.fn().mockRejectedValueOnce(new Error("502")).mockImplementation(() => fakeScene());
    const r = await produceScene(input, { generate, check: vi.fn(okCheck) });
    expect(r.status).toBe("ok");
  });

  it("heure limite proche : pas de 2e essai (repli V1 à temps)", async () => {
    const generate = vi.fn((_req: SceneRequest) => fakeScene());
    const r = await produceScene({ ...input, deadline: Date.now() + 10_000 }, { generate, check: async () => interpretCheck(raw({ same_product: false })) });
    expect(r.status).toBe("fallback_v1");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("souhait du vendeur nettoyé et ajouté au prompt", () => {
    const p = buildScenePrompt({ layout: "HERO_DETAIL.B", direction, productName: "X", identity, sellerNote: 'fond plage\n"au coucher du soleil"' });
    expect(p).toContain("Seller's wish");
    expect(p).toContain("fond plage au coucher du soleil");
  });

  it("candidats : même ratio, ou tous si le ratio a été imposé", () => {
    expect(candidateLayouts(direction, "HERO_DETAIL.B", { aspect: "3:2", requestedAspect: "3:2" })).toEqual(["HERO_DETAIL.B"]);
    expect(candidateLayouts(direction, "HERO_DETAIL.B", { aspect: "1:1", requestedAspect: "3:2" })).toHaveLength(3);
  });
});
