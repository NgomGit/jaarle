import { LAYOUTS } from "@/lib/poster-v2/layouts";
import { evaluateFit, type FitReport } from "@/lib/poster-v2/overlays";
import { generateScene, type SceneRequest, type SceneResult } from "@/lib/poster-v2/scene";
import { checkScene, type SceneCheck } from "@/lib/poster-v2/qa";
import type { Direction } from "@/lib/poster-v2/creative-director";
import type { RawAnalysis } from "@/lib/poster-v2/analysis";
import type { LayoutId, PctRect } from "@/lib/poster-v2/types";

// Étape 3 complète : scène → contrôle → choix de la mise en page qui laisse le produit dégagé.
//
//  1. Scène générée pour la mise en page choisie par le directeur artistique.
//  2. Contrôle Sonnet (fidélité + position du produit). Échec → 1 nouvel essai avec les problèmes.
//  3. Recouvrement (code) : pour chaque mise en page autorisée du MÊME ratio, le produit reste-t-il
//     entier et non recouvert par une photo ou du texte ? On garde celles qui passent, dans l'ordre
//     d'essai. Aucune → nouvel essai avec une consigne de placement (s'il en reste un).
//  4. Au plus 2 scènes. Sinon → repli V1 1 photo (pipeline actuel, éprouvé).
// Le contrôle est fermé : s'il ne répond pas, on ne prend pas le risque (repli V1).

export const MAX_SCENE_ATTEMPTS = 2;

export interface SceneStepInput {
  direction: Direction;
  analysis: Pick<RawAnalysis, "identity">;
  productName: string;
  hero: Buffer;
  secondaries: Buffer[];
  layoutGuide?: boolean;
  sellerNote?: string | null;
  /** Heure limite (ms epoch) : pas de nouvel essai s'il ne peut pas finir avant (durée max de la route). */
  deadline?: number;
}

/** Durée prudente d'un essai (scène + contrôle), pour décider d'un nouvel essai avant l'heure limite. */
export const ATTEMPT_BUDGET_MS = 95_000;

export interface SceneAttemptLog {
  layout: LayoutId;
  aspect: string;
  ms: number;
  outcome: "generation_error" | "qa_error" | "qa_failed" | "placement_failed" | "ok";
  issues: string[];
  heroBox?: PctRect | null;
  fits?: FitReport[];
}

export type SceneStepResult =
  | {
      status: "ok";
      scene: SceneResult;
      heroBox: PctRect;
      /** Mises en page utilisables avec CETTE scène (produit dégagé), dans l'ordre d'essai. */
      layouts: LayoutId[];
      fits: FitReport[];
      attempts: SceneAttemptLog[];
      /** Appels faits (suivi du coût). */
      calls: { image: number; qa: number };
    }
  | { status: "fallback_v1"; reason: string; attempts: SceneAttemptLog[]; calls: { image: number; qa: number } };

export interface SceneStepDeps {
  generate: (req: SceneRequest) => Promise<SceneResult>;
  check: (args: { hero: Buffer; scene: Buffer; identity: RawAnalysis["identity"] }) => Promise<SceneCheck>;
}

const DEFAULT_DEPS: SceneStepDeps = { generate: generateScene, check: checkScene };

/**
 * Mises en page à tester avec une scène, dans l'ordre d'essai du directeur : celles du même ratio
 * (la scène a été composée pour elles). Si OpenRouter a imposé un autre ratio que celui demandé,
 * toutes les mises en page autorisées sont testées (le recouvrement tranche).
 */
export function candidateLayouts(
  direction: Pick<Direction, "tryOrder">,
  target: LayoutId,
  scene: Pick<SceneResult, "aspect" | "requestedAspect">
): LayoutId[] {
  const order = [target, ...direction.tryOrder.filter((l) => l !== target)];
  const forced = scene.aspect !== scene.requestedAspect;
  return order.filter((l) => LAYOUTS[l] && (forced || LAYOUTS[l].scene.aspect === scene.aspect));
}

/** Consigne de placement en anglais pour le nouvel essai (déduite du rapport de recouvrement). */
export function placementIssue(fit: FitReport): string {
  const parts: string[] = [];
  if (fit.visible < 1) parts.push("the product is partly cut off: keep it entirely inside the requested area");
  if (fit.coveredByContent > 0 || fit.coveredByLogo > 0) parts.push("the product extends into the areas that must stay calm: make it smaller or move it so it stays strictly inside the requested product area");
  return parts.join("; ") || "keep the product strictly inside the requested area";
}

export async function produceScene(input: SceneStepInput, deps: SceneStepDeps = DEFAULT_DEPS): Promise<SceneStepResult> {
  const attempts: SceneAttemptLog[] = [];
  const calls = { image: 0, qa: 0 };
  const target = input.direction.layout;
  let retryIssues: string[] = [];

  for (let n = 0; n < MAX_SCENE_ATTEMPTS; n++) {
    if (n > 0 && input.deadline && Date.now() + ATTEMPT_BUDGET_MS > input.deadline) {
      console.warn("[poster-v2] pas de nouvel essai de scène : temps insuffisant");
      break;
    }
    const t0 = Date.now();
    let scene: SceneResult;
    try {
      calls.image++;
      scene = await deps.generate({
        layout: target,
        direction: input.direction,
        productName: input.productName,
        identity: input.analysis.identity,
        hero: input.hero,
        secondaries: input.secondaries,
        retryIssues,
        layoutGuide: input.layoutGuide,
        sellerNote: input.sellerNote,
      });
    } catch (e) {
      attempts.push({ layout: target, aspect: LAYOUTS[target].scene.aspect, ms: Date.now() - t0, outcome: "generation_error", issues: [e instanceof Error ? e.message : String(e)] });
      continue;
    }

    calls.qa++;
    const qa = await deps.check({ hero: input.hero, scene: scene.image, identity: input.analysis.identity });
    const base = { layout: target, aspect: scene.aspect };
    if (qa.status === "error") {
      attempts.push({ ...base, ms: Date.now() - t0, outcome: "qa_error", issues: [qa.error] });
      return { status: "fallback_v1", reason: "contrôle de scène indisponible", attempts, calls };
    }
    if (!qa.passed || !qa.heroBox) {
      attempts.push({ ...base, ms: Date.now() - t0, outcome: "qa_failed", issues: qa.issues, heroBox: qa.heroBox });
      retryIssues = qa.issues;
      continue;
    }

    const fits = candidateLayouts(input.direction, target, scene).map((l) => evaluateFit(l, qa.heroBox!, scene.width, scene.height));
    const ok = fits.filter((f) => f.ok);
    if (!ok.length) {
      const targetFit = fits.find((f) => f.layout === target) ?? fits[0];
      const issue = targetFit ? placementIssue(targetFit) : "keep the product strictly inside the requested area";
      attempts.push({ ...base, ms: Date.now() - t0, outcome: "placement_failed", issues: [issue, ...(targetFit?.reasons ?? [])], heroBox: qa.heroBox, fits });
      retryIssues = [issue];
      continue;
    }
    attempts.push({ ...base, ms: Date.now() - t0, outcome: "ok", issues: qa.issues, heroBox: qa.heroBox, fits });
    return { status: "ok", scene, heroBox: qa.heroBox, layouts: ok.map((f) => f.layout), fits, attempts, calls };
  }

  const last = attempts[attempts.length - 1];
  return { status: "fallback_v1", reason: `scène refusée après ${attempts.length} essai(s) (${last?.outcome ?? "?"})`, attempts, calls };
}
