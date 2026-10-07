import type { AllowedMediaType } from "@/lib/media-types";
import type { ProductAnalysis } from "@/lib/product-analyzer";
import {
  analyzeRaw,
  applyGate,
  localMetrics,
  toProductAnalysis,
  type AnalysisRecord,
  type ExclusionReason,
  type KeptSecondary,
} from "@/lib/poster-v2/analysis";
import { eligibleLayouts } from "@/lib/poster-v2/eligibility";
import { benefitCandidates, directPoster, type Direction } from "@/lib/poster-v2/creative-director";
import { produceScene, type SceneAttemptLog } from "@/lib/poster-v2/scene-step";
import { renderPosterV2 } from "@/lib/poster-v2/render";
import { LayoutUnfitError, type LayoutId, type PctRect } from "@/lib/poster-v2/types";

// Orchestrateur V2 multi-photos : analyse → direction → scène + contrôle → rendu.
// Chaque étape qui échoue renvoie un REPLI (status "fallback") : la route enchaîne alors sur le
// pipeline V1 avec la photo principale seule. Rien ici n'écrit en base ni dans le stockage.

export const RENDERER_VERSION = "r-2.0";
/** Même taille que la V1 (écrans, Studio et vitrine supposent 1024 × 1024). */
export const OUTPUT_SIZE = 1024;
/**
 * Temps maximal consacré à la V2 dans une génération : la route a 300 s, et un repli V1 doit encore
 * pouvoir tourner (~ 60-120 s) si la V2 échoue.
 */
export const V2_BUDGET_MS = 170_000;
/** Coût estimé (à confirmer sur les factures). */
const COST_IMAGE_USD = 0.07;
const COST_SONNET_USD = 0.015;

export interface V2Photo {
  buffer: Buffer;
  mediaType: AllowedMediaType;
  path: string;
}

export interface V2Content {
  productName: string;
  price: number | null;
  industry: string | null;
  phone: string;
  businessName: string | null;
  logo: Buffer | null;
}

export interface DesignV2 {
  schema: 1;
  pipeline: "v2";
  analysis: AnalysisRecord;
  /** Photos secondaires affichées, dans l'ordre des cases (chemins = extra_photo_paths). */
  secondaries: (KeptSecondary & { path: string })[];
  direction: Direction;
  scene: {
    model: string;
    prompt_version: string;
    aspect: string;
    requested_aspect: string;
    hero_box: PctRect;
    /** Mises en page utilisables avec cette scène (produit dégagé). */
    layouts: LayoutId[];
    attempts: Omit<SceneAttemptLog, "fits">[];
  };
  render: { renderer_version: string; layout: LayoutId; size: number; crops: { index: number; rect: PctRect }[]; warnings: string[] };
  calls: { image: number; sonnet: number };
  est_cost_usd: number;
  timings_ms: Record<string, number>;
}

export interface Excluded {
  index: number;
  path: string;
  reason: ExclusionReason;
}

export type V2Result =
  | { status: "ok"; image: Buffer; scene: Buffer; design: DesignV2; heroPath: string; secondaryPaths: string[]; excluded: Excluded[] }
  | {
      status: "fallback";
      stage: "analysis" | "direction" | "scene" | "render";
      reason: string;
      heroIndex: number;
      /** Analyse réutilisable par la V1 (évite un 2e appel) ; null si l'identité est douteuse. */
      productAnalysis: ProductAnalysis | null;
      excluded: Excluded[];
      calls: { image: number; sonnet: number };
      est_cost_usd: number;
    };

const cost = (c: { image: number; sonnet: number }) => Math.round((c.image * COST_IMAGE_USD + c.sonnet * COST_SONNET_USD) * 1000) / 1000;

/** Rend la première mise en page de la liste qui tient (titre, photos) ; null si aucune. */
async function renderFirst(
  layouts: LayoutId[],
  design: Pick<DesignV2, "direction" | "secondaries">,
  scene: Buffer,
  secondaryBuffers: Buffer[],
  content: V2Content
): Promise<{ layout: LayoutId; image: Buffer; crops: { index: number; rect: PctRect }[]; warnings: string[] } | null> {
  const d = design.direction;
  for (const layout of layouts) {
    try {
      const r = await renderPosterV2({
        layout,
        typePair: d.typePair,
        palette: d.palette,
        scene,
        secondaries: design.secondaries.map((s, i) => ({ image: secondaryBuffers[i], role: s.role, caption: s.caption, focus: s.focus, quality: s.quality })),
        content: { ...d.copy, price: content.price, phone: content.phone, businessName: content.businessName, logo: content.logo },
        size: OUTPUT_SIZE,
      });
      return { layout, image: r.image, crops: r.crops, warnings: r.warnings };
    } catch (e) {
      if (e instanceof LayoutUnfitError) {
        console.warn(`[poster-v2] ${e.message}`);
        continue;
      }
      throw e;
    }
  }
  return null;
}

/** Génération complète d'une affiche multi-photos. Ne lève pas d'exception (repli V1). */
export async function generatePosterV2(input: {
  photos: V2Photo[];
  heroFixed: boolean;
  content: V2Content;
  category?: string | null;
  recentLayouts?: LayoutId[];
}): Promise<V2Result> {
  const calls = { image: 0, sonnet: 0 };
  const timings: Record<string, number> = {};
  const started = Date.now();
  const { photos, content } = input;
  const excludedOf = (list: { index: number; reason: ExclusionReason }[]): Excluded[] =>
    list.map((e) => ({ ...e, path: photos[e.index]?.path ?? "" }));
  const fallback = (stage: Extract<V2Result, { status: "fallback" }>["stage"], reason: string, heroIndex: number, pa: ProductAnalysis | null, excl: Excluded[]): V2Result => {
    console.warn(`[poster-v2] repli V1 (${stage}) : ${reason}`);
    return { status: "fallback", stage, reason, heroIndex, productAnalysis: pa, excluded: excl, calls, est_cost_usd: cost(calls) };
  };

  try {
    // 1. Analyse + porte de sécurité.
    let t0 = Date.now();
    const images = photos.map((p) => ({ buffer: p.buffer, mediaType: p.mediaType }));
    const metricsP = Promise.all(images.map((i) => localMetrics(i.buffer)));
    calls.sonnet++;
    let raw = await analyzeRaw(images, content.productName, input.heroFixed);
    if (!raw) {
      calls.sonnet++;
      raw = await analyzeRaw(images, content.productName, input.heroFixed);
    }
    const gate = applyGate(raw, await metricsP, { heroFixed: input.heroFixed });
    timings.analysis = Date.now() - t0;
    if (!gate.ok || !raw) {
      return fallback("analysis", gate.ok ? "analyse vide" : gate.reason, gate.heroIndex, gate.ok ? null : gate.productAnalysis, excludedOf(gate.excluded));
    }
    const excluded = excludedOf(gate.excluded);
    const pa = toProductAnalysis(raw);
    const hero = photos[gate.heroIndex];
    const secondaries = gate.secondaries.map((s) => ({ ...s, path: photos[s.index].path }));
    const secondaryBuffers = gate.secondaries.map((s) => photos[s.index].buffer);

    // 2. Direction artistique (repli déterministe intégré).
    t0 = Date.now();
    const eligible = eligibleLayouts({
      heroQuality: gate.heroQuality,
      secondaries: gate.secondaries,
      industry: content.industry,
      category: input.category ?? null,
      title: content.productName,
      benefitsCount: Math.min(3, benefitCandidates({ vendorBenefits: [], analysis: raw }).length),
      recentLayouts: input.recentLayouts ?? [],
    });
    if (!eligible.length) return fallback("direction", "aucune mise en page autorisée", gate.heroIndex, pa, excluded);
    calls.sonnet++;
    const direction = await directPoster({
      productName: content.productName,
      industry: content.industry,
      category: input.category ?? null,
      price: content.price,
      businessName: content.businessName,
      analysis: raw,
      secondaries: gate.secondaries,
      eligible,
      heroImage: hero.buffer,
    });
    timings.direction = Date.now() - t0;

    // 3. Scène + contrôle + recouvrement.
    t0 = Date.now();
    const step = await produceScene({
      direction,
      analysis: { identity: gate.record.identity },
      productName: content.productName,
      hero: hero.buffer,
      secondaries: secondaryBuffers,
      deadline: started + V2_BUDGET_MS,
    });
    calls.image += step.calls.image;
    calls.sonnet += step.calls.qa;
    timings.scene = Date.now() - t0;
    if (step.status !== "ok") return fallback("scene", step.reason, gate.heroIndex, pa, excluded);

    // 4. Rendu : première mise en page compatible qui tient.
    t0 = Date.now();
    const rendered = await renderFirst(step.layouts, { direction, secondaries }, step.scene.image, secondaryBuffers, content);
    timings.render = Date.now() - t0;
    if (!rendered) return fallback("render", "aucune mise en page compatible ne tient", gate.heroIndex, pa, excluded);

    const design: DesignV2 = {
      schema: 1,
      pipeline: "v2",
      analysis: gate.record,
      secondaries,
      direction,
      scene: {
        model: step.scene.model,
        prompt_version: step.scene.promptVersion,
        aspect: step.scene.aspect,
        requested_aspect: step.scene.requestedAspect,
        hero_box: step.heroBox,
        layouts: step.layouts,
        attempts: step.attempts.map(({ fits: _fits, ...a }) => a),
      },
      render: { renderer_version: RENDERER_VERSION, layout: rendered.layout, size: OUTPUT_SIZE, crops: rendered.crops, warnings: rendered.warnings },
      calls,
      est_cost_usd: cost(calls),
      timings_ms: timings,
    };
    return {
      status: "ok",
      image: rendered.image,
      scene: step.scene.image,
      design,
      heroPath: hero.path,
      secondaryPaths: secondaries.map((s) => s.path),
      excluded,
    };
  } catch (e) {
    return fallback("render", e instanceof Error ? e.message : String(e), 0, null, []);
  }
}

/**
 * « Autre mise en page » : même scène, même direction, mise en page suivante compatible.
 * 0 appel IA. null s'il n'y a pas d'autre mise en page qui tient.
 */
export async function rerenderOtherLayout(args: {
  design: DesignV2;
  scene: Buffer;
  secondaryBuffers: Buffer[];
  content: V2Content;
}): Promise<{ image: Buffer; design: DesignV2 } | null> {
  const { design } = args;
  const list = design.scene.layouts;
  const cur = list.indexOf(design.render.layout);
  const order = [...list.slice(cur + 1), ...list.slice(0, Math.max(cur, 0))].filter((l) => l !== design.render.layout);
  if (!order.length) return null;
  const r = await renderFirst(order, design, args.scene, args.secondaryBuffers, args.content);
  if (!r) return null;
  return {
    image: r.image,
    design: { ...design, render: { ...design.render, layout: r.layout, crops: r.crops, warnings: r.warnings } },
  };
}

/** Nombre d'autres mises en page possibles avec la scène actuelle. */
export function otherLayoutsCount(design: DesignV2 | null | undefined): number {
  if (!design?.scene?.layouts) return 0;
  return design.scene.layouts.filter((l) => l !== design.render?.layout).length;
}

/**
 * « Nouvelle version » : nouvelle scène (1 GPT Image + 1 contrôle, 2 au plus), même analyse et même
 * direction ; la mise en page change si une autre est autorisée (variété). null = échec (rien n'est
 * modifié, la régénération est rendue au vendeur).
 */
export async function regenerateScene(args: {
  design: DesignV2;
  hero: Buffer;
  secondaryBuffers: Buffer[];
  content: V2Content;
  sellerNote?: string | null;
}): Promise<{ image: Buffer; scene: Buffer; design: DesignV2 } | null> {
  const { design } = args;
  const d = design.direction;
  const current = design.render.layout;
  const next = d.tryOrder.find((l) => l !== current) ?? current;
  const direction: Direction = { ...d, layout: next, tryOrder: [next, ...d.tryOrder.filter((l) => l !== next)] };
  const t0 = Date.now();
  const step = await produceScene({
    direction,
    analysis: { identity: design.analysis.identity },
    productName: args.content.productName,
    hero: args.hero,
    secondaries: args.secondaryBuffers,
    sellerNote: args.sellerNote ?? null,
    deadline: t0 + 250_000,
  });
  if (step.status !== "ok") {
    console.warn(`[poster-v2] nouvelle scène refusée : ${step.reason}`);
    return null;
  }
  const r = await renderFirst(step.layouts, { direction, secondaries: design.secondaries }, step.scene.image, args.secondaryBuffers, args.content);
  if (!r) return null;
  const calls = { image: design.calls.image + step.calls.image, sonnet: design.calls.sonnet + step.calls.qa };
  return {
    image: r.image,
    scene: step.scene.image,
    design: {
      ...design,
      direction,
      scene: {
        model: step.scene.model,
        prompt_version: step.scene.promptVersion,
        aspect: step.scene.aspect,
        requested_aspect: step.scene.requestedAspect,
        hero_box: step.heroBox,
        layouts: step.layouts,
        attempts: step.attempts.map(({ fits: _fits, ...a }) => a),
      },
      render: { ...design.render, layout: r.layout, crops: r.crops, warnings: r.warnings },
      calls,
      est_cost_usd: cost(calls),
      timings_ms: { ...design.timings_ms, regenerate_scene: Date.now() - t0 },
    },
  };
}
