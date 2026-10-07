import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import type { RawAnalysis } from "@/lib/poster-v2/analysis";
import type { PctRect } from "@/lib/poster-v2/types";

// Contrôle de la scène (1 appel Sonnet) : compare la photo principale du vendeur et la scène.
//  - fidélité du produit (même produit, angle, couleurs, détails critiques, pas redessiné) ;
//  - un seul exemplaire, pas de vignette / vue en plus, pas de sosie ;
//  - aucun texte, prix ou logo ajouté ;
//  - et il MESURE où est le produit dans la scène (boîte en %), pour que le code vérifie qu'aucune
//    vraie photo ni aucun texte de la mise en page ne le recouvre (overlays.ts).
// Contrairement au contrôle V1 (qui laisse passer en cas de panne), ce contrôle est FERMÉ : s'il
// ne répond pas, la scène n'est pas utilisée (repli V1). La fidélité passe avant tout.

export const QA_PROMPT_VERSION = "qa-v2.0";
export const QA_MODEL = "claude-sonnet-5";

const SceneCheckSchema = z.object({
  same_product: z.boolean(),
  same_angle: z.boolean(),
  colors_preserved: z.boolean(),
  details_preserved: z.boolean(),
  not_redesigned: z.boolean(),
  single_instance: z.boolean(),
  no_lookalikes: z.boolean(),
  no_added_text_or_logo: z.boolean(),
  product_fully_visible: z.boolean(),
  clean_realistic: z.boolean(),
  product_box: z.object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() }),
  issues: z.array(z.string()),
});
export type RawSceneCheck = z.infer<typeof SceneCheckSchema>;

/** Points bloquants : un seul en échec → nouvel essai (puis repli V1). */
export const BLOCKING_CHECKS = [
  "same_product",
  "same_angle",
  "colors_preserved",
  "details_preserved",
  "not_redesigned",
  "single_instance",
  "no_lookalikes",
  "no_added_text_or_logo",
  "product_fully_visible",
  "clean_realistic",
] as const satisfies readonly (keyof RawSceneCheck)[];

export type SceneCheck =
  | { status: "checked"; passed: boolean; failed: string[]; issues: string[]; heroBox: PctRect | null; raw: RawSceneCheck }
  | { status: "error"; error: string };

/** Boîte du produit : bornée à l'image, au moins 8 % de côté ; null si incohérente. */
export function sanitizeProductBox(b: RawSceneCheck["product_box"]): PctRect | null {
  const c = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
  let l = c(b.left);
  let t = c(b.top);
  let r = c(b.right);
  let btm = c(b.bottom);
  // Certains modèles répondent en 0-1 : on remet à l'échelle.
  if (r <= 1 && btm <= 1 && (r > 0 || btm > 0)) [l, t, r, btm] = [l * 100, t * 100, r * 100, btm * 100];
  if (r - l < 8 || btm - t < 8) return null;
  const q = (v: number) => Math.round(v * 10) / 10;
  return { x: q(l), y: q(t), w: q(r - l), h: q(btm - t) };
}

/** Interprétation de la réponse (pure, testée). */
export function interpretCheck(raw: RawSceneCheck): Extract<SceneCheck, { status: "checked" }> {
  const failed = BLOCKING_CHECKS.filter((k) => raw[k] !== true);
  const heroBox = sanitizeProductBox(raw.product_box);
  const issues = raw.issues.map((s) => s.trim()).filter(Boolean).slice(0, 5);
  if (!heroBox) {
    failed.push("product_box" as never);
    issues.push("the product position could not be measured; keep one clear, fully visible product inside the requested area");
  }
  if (failed.length && !issues.length) issues.push(...failed.map((f) => `check failed: ${f}`));
  return { status: "checked", passed: failed.length === 0, failed: [...failed], issues, heroBox, raw };
}

async function b64Jpeg(buf: Buffer, max: number): Promise<string> {
  return (await sharp(buf).rotate().resize(max, max, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString("base64");
}

function prompt(identity: RawAnalysis["identity"]): string {
  const features = [...identity.critical_features, ...identity.never_change];
  return `Tu contrôles une SCÈNE publicitaire générée par IA à partir de la photo du vendeur. Le produit doit être EXACTEMENT celui de la photo (c'est un vrai produit vendu à de vrais clients). Réponds true quand tout va bien :
1. same_product : c'est le même produit (même modèle, pas un produit voisin).
2. same_angle : il est montré sous la même vue / le même angle que sur la photo (une légère variation de perspective est acceptable).
3. colors_preserved : couleurs principales conservées.
4. details_preserved : détails caractéristiques conservés${features.length ? ` (${features.join(" ; ")})` : ""}.
5. not_redesigned : ni redessiné, ni simplifié, ni « amélioré » ; aucune pièce, accessoire ou marquage ajouté${identity.branding.length ? ` (marquage d'origine : ${identity.branding.join(", ")})` : ""}.
6. single_instance : UN seul exemplaire du produit (pas de copie, de reflet trompeur en double, de vignette, d'encart, d'autre vue).
7. no_lookalikes : aucun objet supplémentaire qui ressemble au produit.
8. no_added_text_or_logo : aucun texte, chiffre, prix, étiquette, panneau ou logo ajouté (seul le marquage présent sur le vrai produit est permis).
9. product_fully_visible : le produit est entier, pas coupé par les bords de l'image.
10. clean_realistic : rendu photoréaliste propre, sans artefact, produit bien posé dans le décor (ombres cohérentes, pas « collé »).
product_box : boîte SERRÉE autour du produit dans la SCÈNE, en pourcentage de la largeur (left, right) et de la hauteur (top, bottom) de la scène, de 0 à 100.
issues : pour chaque point en échec, une phrase courte EN ANGLAIS, précise et actionnable (ex. "the grille shape was changed", "a second smaller copy of the bag appears on the right", "text appears on the wall behind the car").`;
}

/** Contrôle de la scène ; ne lève jamais d'exception (status "error" = scène refusée). */
export async function checkScene(args: { hero: Buffer; scene: Buffer; identity: RawAnalysis["identity"] }): Promise<SceneCheck> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: QA_MODEL,
      max_tokens: 700,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Photo du vendeur (référence du produit) :" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await b64Jpeg(args.hero, 1024) } },
            { type: "text", text: "Scène générée :" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await b64Jpeg(args.scene, 1280) } },
            { type: "text", text: prompt(args.identity) },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(SceneCheckSchema) },
    });
    const raw = message.parsed_output;
    if (!raw) return { status: "error", error: "réponse vide" };
    return interpretCheck(raw);
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
