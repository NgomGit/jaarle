import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AllowedMediaType } from "@/lib/media-types";

const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Doit être un hex à 6 chiffres, ex: #6D5EF5");

const ProductAnalysisSchema = z.object({
  category: z.string(),
  colors: z.array(z.string()).max(4),
  material: z.string(),
  positioning: z.enum(["entrée de gamme", "milieu de gamme", "premium / haut de gamme"]),
  visualNotes: z.string(),
  accentGradient: z.object({
    from: HEX_COLOR,
    to: HEX_COLOR,
  }),
});

export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;

/**
 * Étapes "Vision" + "Product Analyzer" : extrait des faits visuels structurés du produit
 * (couleurs, matière, positionnement) pour que le prompt de composition ne dépende pas
 * uniquement de ce que le modèle d'image "devine" en regardant les pixels.
 */
export async function analyzeProduct(
  photoBase64: string,
  mediaType: AllowedMediaType,
  productName: string
): Promise<ProductAnalysis | null> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 512,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: photoBase64 } },
            {
              type: "text",
              text: `Produit ou service : "${productName}". Analyse cette photo pour un brief de directeur artistique : catégorie précise, 2 à 4 couleurs dominantes (en anglais, ex: "deep indigo", "cream"), matière ou texture apparente, positionnement (entrée de gamme / milieu de gamme / premium / haut de gamme), une courte note (une phrase) sur ce qui rend ce sujet visuellement distinctif, et un dégradé de 2 couleurs hex (accentGradient.from / accentGradient.to) à utiliser pour des éléments d'interface (badges, boutons) : doit compléter/harmoniser avec les couleurs du sujet, rester lisible avec du texte blanc par-dessus, premium — jamais de blanc/noir pur, jamais de néon criard. Varie ce choix selon le sujet plutôt que de toujours revenir à un violet par défaut.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ProductAnalysisSchema) },
    });

    return message.parsed_output ?? null;
  } catch {
    return null;
  }
}
