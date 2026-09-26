import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { OBJECTIVE_BY_KEY } from "@/lib/studio/objectives";
import { PLATFORM_BY_KEY, type StudioPlatform } from "@/lib/studio/platforms";
import { culturalContext, factsToPrompt, type StudioFacts } from "@/lib/studio/facts";
import { sanitizeVariant } from "@/lib/studio/guardrails";
import type { PostVariant } from "@/lib/studio/types";

// Pipeline texte du Studio : UN appel structuré produit 3 variantes par plateforme demandée.
// Modèle économique par défaut (Haiku), surchargeable via STUDIO_MODEL.

export const STUDIO_MODEL = process.env.STUDIO_MODEL || "claude-haiku-4-5-20251001";

const VariantSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
  headline: z.string(),
  subline: z.string(),
});

function schemaFor(platforms: StudioPlatform[]) {
  return z.object({
    posts: z.array(
      z.object({
        platform: z.enum(platforms as [StudioPlatform, ...StudioPlatform[]]),
        variants: z.array(VariantSchema),
      })
    ),
  });
}

const RULES = `RÈGLES ABSOLUES :
- N'utilise QUE les informations de la fiche de faits. N'invente JAMAIS : prix, remise, pourcentage, promotion, délai, stock, quantité limitée, livraison, garantie, matière, taille, couleur ou caractéristique non fournie.
- Si le prix est « sur demande », ne cite aucun montant.
- Si une offre est fournie, reprends ses chiffres et conditions exactement ; sinon ne parle d'aucune offre.
- Écris en français naturel, comme un bon vendeur au Sénégal (quelques mots de wolof possibles s'ils sont naturels, sans en abuser).
- Chaque plateforme a SON ton et SA longueur : ne réutilise jamais la même légende d'une plateforme à l'autre.
- Les 3 variantes d'une même plateforme doivent être vraiment différentes (angle, accroche, structure).
- headline : titre de 2 à 5 mots affiché en gros sur le visuel (sans prix, sans hashtag).
- subline : accroche de 4 à 10 mots affichée sous le titre sur le visuel (sans prix).
- cta : appel à l'action court (2 à 6 mots) adapté à la plateforme.
- hashtags : pertinents pour le produit, l'activité et le Sénégal (ex. ville), sans espaces.`;

export interface GenerationUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateVariants(
  facts: StudioFacts,
  platforms: StudioPlatform[]
): Promise<{ variants: Record<StudioPlatform, PostVariant[]>; usage: GenerationUsage }> {
  const objective = OBJECTIVE_BY_KEY[facts.objective];
  const platformBlock = platforms
    .map((key) => {
      const spec = PLATFORM_BY_KEY[key];
      return `- ${key} (${spec.label}, visuel ${spec.format === "square" ? "carré 1:1" : "vertical 9:16"}) : ${spec.guidance} Légende ≤ ${spec.captionMax} caractères. Hashtags : ${spec.hashtags[0]} à ${spec.hashtags[1]}.`;
    })
    .join("\n");

  const anthropic = new Anthropic();
  const message = await anthropic.messages.parse({
    model: STUDIO_MODEL,
    max_tokens: 6000,
    system: `${culturalContext(facts)}\n\nTu rédiges des contenus pour les réseaux sociaux d'une petite boutique sénégalaise. ${RULES}`,
    messages: [
      {
        role: "user",
        content: `FICHE DE FAITS (seule source autorisée) :\n${factsToPrompt(facts)}\n\n${objective.guidance}\n\nPLATEFORMES (3 variantes chacune) :\n${platformBlock}`,
      },
    ],
    output_config: { format: zodOutputFormat(schemaFor(platforms)) },
  });

  const parsed = message.parsed_output;
  if (!parsed) throw new Error("Réponse IA invalide.");

  const result = {} as Record<StudioPlatform, PostVariant[]>;
  for (const key of platforms) {
    const spec = PLATFORM_BY_KEY[key];
    const raw = parsed.posts.find((p) => p.platform === key)?.variants ?? [];
    const variants = raw.slice(0, 3).map((v) => sanitizeVariant(v, spec, facts)).filter((v) => v.caption || v.headline);
    if (variants.length === 0) throw new Error(`Aucune variante exploitable pour ${key}.`);
    result[key] = variants;
  }
  return {
    variants: result,
    usage: { model: STUDIO_MODEL, inputTokens: message.usage?.input_tokens ?? 0, outputTokens: message.usage?.output_tokens ?? 0 },
  };
}
