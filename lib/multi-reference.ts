import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AllowedMediaType } from "@/lib/media-types";
import type { ProductAnalysis } from "@/lib/product-analyzer";

// Multi-image (réservé aux offres payantes) : UNE analyse de vision groupée de 2-3 photos du
// même produit. Elle remplace, sur ce chemin, analyzeProduct (photo principale seule) ET
// selectHeroAndSecondaries — même nombre d'appels qu'avant, mais une vraie compréhension du
// produit : ce qui doit rester identique, à quoi sert chaque photo secondaire, et si une photo
// montre en fait un AUTRE produit (elle est alors écartée, jamais fusionnée).

export type ReferenceImage = { base64: string; mediaType: AllowedMediaType };

const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const ReferenceAnalysisSchema = z.object({
  subject_type: z.enum(["product", "service"]),
  same_subject_confidence: z.number(),
  main_image_index: z.number().int(),
  secondary_images: z
    .array(
      z.object({
        index: z.number().int(),
        purpose: z.enum(["detail", "alternate_angle", "texture", "usage", "other"]),
        same_subject: z.boolean(),
        note: z.string(),
      })
    )
    .max(3),
  product_identity: z.object({
    category: z.string(),
    shape: z.string(),
    dominant_colors: z.array(z.string()).max(4),
    materials: z.array(z.string()).max(4),
    textures: z.array(z.string()).max(4),
    distinctive_details: z.array(z.string()).max(6),
    visible_branding: z.array(z.string()).max(4),
  }),
  critical_features: z.array(z.string()).max(6),
  features_to_preserve: z.array(z.string()).max(6),
  potential_conflicts: z.array(z.string()).max(4),
  // Champs repris de l'analyse « une image » pour que la suite du pipeline ne change pas.
  positioning: z.enum(["entrée de gamme", "milieu de gamme", "premium / haut de gamme"]),
  visual_notes: z.string(),
  accent_gradient: z.object({ from: HEX_COLOR, to: HEX_COLOR }),
  selling_points: z.array(z.string()).max(3),
});

export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;
export type SecondaryPurpose = ReferenceAnalysis["secondary_images"][number]["purpose"];

/** En dessous : on ne fait pas confiance au lot de photos, repli sur la photo principale seule. */
const MIN_SAME_SUBJECT_CONFIDENCE = 0.6;

async function analyzeReferences(
  images: ReferenceImage[],
  productName: string,
  heroFixed: boolean
): Promise<ReferenceAnalysis | null> {
  try {
    const anthropic = new Anthropic();
    const content: (
      | { type: "image"; source: { type: "base64"; media_type: AllowedMediaType; data: string } }
      | { type: "text"; text: string }
    )[] = [];
    images.forEach((img, i) => {
      content.push({ type: "text", text: `Image ${i}${heroFixed && i === 0 ? " (photo PRINCIPALE choisie par le commerçant)" : ""} :` });
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
    });
    content.push({
      type: "text",
      text: `Produit ou service : "${productName}". Ces ${images.length} photos sont censées montrer UN SEUL ET MÊME sujet. Elles serviront de références à un modèle d'image qui doit composer une affiche avec UNE SEULE représentation du sujet, fidèle à la photo principale.

1. Image principale (main_image_index) : ${
        heroFixed
          ? "c'est obligatoirement l'image 0, choisie par le commerçant."
          : `choisis la meilleure (sujet net, entier, bien cadré, le plus vendeur ; une photo du produit seul est préférable à une photo portée ou en situation). Index de 0 à ${images.length - 1}.`
      }
2. secondary_images : chaque AUTRE image, avec son rôle — detail (gros plan), alternate_angle (autre vue), texture (matière), usage (produit porté / en situation / en contexte), other — et same_subject : est-ce vraiment le MÊME article que l'image principale (même modèle, mêmes couleurs, même forme, même marquage) ? Être de la même catégorie ne suffit PAS : deux montures de lunettes de formes différentes, deux sacs de modèles différents, deux robes de tissus différents sont des sujets DIFFÉRENTS. Compare forme / silhouette, couleurs, matière et marquage : un seul écart net → same_subject = false. Dans le doute, false. note : une courte phrase sur ce que cette image apprend du sujet.
3. same_subject_confidence (0 à 1) : confiance que toutes les images montrent le même sujet.
4. product_identity : catégorie précise, forme / silhouette, 2 à 4 couleurs dominantes (en anglais, ex. "deep indigo"), matières, textures, détails distinctifs (y compris ceux visibles SEULEMENT sur les photos secondaires : poche arrière, fermoir, semelle…), marquage / logo / texte visible.
5. critical_features : les caractéristiques qui définissent l'identité exacte du sujet et doivent rester IDENTIQUES dans toute représentation. En anglais, phrases courtes et concrètes.
6. features_to_preserve : les détails précis à ne pas perdre ni modifier (formes, nombre d'éléments, couleur de telle partie…). En anglais.
7. potential_conflicts : ce qu'un modèle d'image risquerait d'inventer ou de mélanger à partir de ces photos (ex. "do not add the model wearing it", "do not show front and back at the same time", "do not duplicate the bag"). En anglais.
8. positioning, visual_notes (une phrase), accent_gradient (2 couleurs hex pour boutons / badges, harmonisées avec le sujet, lisibles avec du texte blanc, jamais blanc/noir pur ni néon), selling_points (1 à 3 points forts de 2 à 4 mots en français, jamais de promesse de livraison, paiement, garantie, stock, prix ou promotion).`,
    });

    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(ReferenceAnalysisSchema) },
    });
    return message.parsed_output ?? null;
  } catch {
    return null;
  }
}

/** L'analyse multi-image au format attendu par le reste du pipeline (prompt, couleurs, points forts). */
export function toProductAnalysis(a: ReferenceAnalysis): ProductAnalysis {
  return {
    category: a.product_identity.category,
    colors: a.product_identity.dominant_colors.slice(0, 4),
    material: [...a.product_identity.materials, ...a.product_identity.textures].join(", ") || "unspecified",
    positioning: a.positioning,
    visualNotes: a.visual_notes,
    accentGradient: a.accent_gradient,
    sellingPoints: a.selling_points.slice(0, 3),
  };
}

/** Ce que le décor multi-image reçoit : l'analyse + le rôle de chaque référence secondaire, dans l'ordre d'envoi. */
export interface MultiReferenceContext {
  analysis: ReferenceAnalysis;
  secondaries: { purpose: SecondaryPurpose; note: string }[];
}

export interface ResolvedReferences {
  /** Index (dans le tableau d'entrée) de la photo principale. */
  heroIndex: number;
  /** Photos secondaires retenues (même sujet), dans l'ordre d'utilité. Servent de références ET de vignettes. */
  secondaryIndexes: number[];
  /** Contexte multi-image si ce chemin est utilisable ; null = pipeline « une image ». */
  multi: MultiReferenceContext | null;
  /** Analyse réutilisable par le pipeline (évite un 2e appel d'analyse) ; null = à refaire sur la principale. */
  productAnalysis: ProductAnalysis | null;
}

/**
 * Détermine la photo principale, les secondaires compatibles et le contexte multi-image.
 * Comportement sûr :
 *  - analyse en échec → principale = celle du commerçant (ou la 1re), secondaires gardées en
 *    vignettes comme avant, mais le décor est généré à partir de la principale seule ;
 *  - lot peu fiable (confiance basse) → principale seule, aucune secondaire (ni référence ni vignette) ;
 *  - secondaire d'un autre produit → écartée, jamais fusionnée.
 */
export async function resolveReferences(
  images: ReferenceImage[],
  productName: string,
  opts: { heroFixed: boolean }
): Promise<ResolvedReferences> {
  const n = images.length;
  const all = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return { heroIndex: 0, secondaryIndexes: [], multi: null, productAnalysis: null };

  // Un échec ponctuel (réseau, format) ne doit pas faire passer des photos non vérifiées : 1 nouvel essai.
  const analysis =
    (await analyzeReferences(images, productName, opts.heroFixed)) ?? (await analyzeReferences(images, productName, opts.heroFixed));
  if (!analysis) {
    return { heroIndex: 0, secondaryIndexes: all.slice(1), multi: null, productAnalysis: null };
  }

  const aiHero = analysis.main_image_index;
  const heroIndex = opts.heroFixed || !Number.isInteger(aiHero) || aiHero < 0 || aiHero >= n ? 0 : aiHero;

  // Photos probablement de produits différents : l'analyse elle-même peut mélanger leurs couleurs,
  // on ne la réutilise pas (le pipeline « une image » réanalysera la principale seule).
  if (analysis.same_subject_confidence < MIN_SAME_SUBJECT_CONFIDENCE) {
    return { heroIndex, secondaryIndexes: [], multi: null, productAnalysis: null };
  }

  const seen = new Set<number>([heroIndex]);
  const kept: { index: number; purpose: SecondaryPurpose; note: string }[] = [];
  for (const s of analysis.secondary_images) {
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= n || seen.has(s.index)) continue;
    seen.add(s.index);
    if (s.same_subject) kept.push({ index: s.index, purpose: s.purpose, note: s.note });
  }
  const productAnalysis = toProductAnalysis(analysis);
  // Une photo oubliée par l'analyse n'est pas vérifiée : on ne l'utilise pas.
  if (kept.length === 0) return { heroIndex, secondaryIndexes: [], multi: null, productAnalysis };

  return {
    heroIndex,
    secondaryIndexes: kept.map((k) => k.index),
    multi: { analysis, secondaries: kept.map(({ purpose, note }) => ({ purpose, note })) },
    productAnalysis,
  };
}
