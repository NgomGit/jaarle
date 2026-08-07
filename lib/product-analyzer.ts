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

type SelectionContentPart =
  | { type: "image"; source: { type: "base64"; media_type: AllowedMediaType; data: string } }
  | { type: "text"; text: string };

const PhotoSelectionSchema = z.object({
  heroIndex: z.number().int(),
  secondaryIndexes: z.array(z.number().int()).max(3),
});

/**
 * Palier multi-photos : parmi plusieurs photos du MÊME produit, l'IA choisit la meilleure
 * comme image PRINCIPALE (la plus nette / la mieux cadrée / la plus vendeuse) et ordonne les
 * autres comme images SECONDAIRES (angles et détails complémentaires). Renvoie null en cas
 * d'échec ou de <2 photos — l'appelant garde alors l'ordre d'origine.
 */
export async function selectHeroAndSecondaries(
  images: { base64: string; mediaType: AllowedMediaType }[],
  productName: string
): Promise<{ heroIndex: number; secondaryIndexes: number[] } | null> {
  if (images.length < 2) return null;
  try {
    const anthropic = new Anthropic();
    const content: SelectionContentPart[] = [];
    images.forEach((img, i) => {
      content.push({ type: "text", text: `Image ${i} :` });
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
    });
    content.push({
      type: "text",
      text: `Produit : "${productName}". Ces ${images.length} photos montrent le MÊME produit. Choisis l'index (0 à ${
        images.length - 1
      }) de la meilleure photo comme image PRINCIPALE (produit net, bien cadré, bien éclairé, le plus attractif), puis la liste ordonnée des index des autres photos à réutiliser comme images SECONDAIRES (angles ou détails complémentaires, de la plus utile à la moins utile). N'inclus jamais l'index principal dans les secondaires.`,
    });

    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 200,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(PhotoSelectionSchema) },
    });

    const out = message.parsed_output;
    if (!out) return null;
    const n = images.length;
    const heroIndex = out.heroIndex >= 0 && out.heroIndex < n ? out.heroIndex : 0;
    const secondaryIndexes = [
      ...new Set((out.secondaryIndexes ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < n && i !== heroIndex)),
    ];
    return { heroIndex, secondaryIndexes };
  } catch {
    return null;
  }
}

const LogoColorsSchema = z.object({
  from: HEX_COLOR,
  to: HEX_COLOR,
});

/**
 * Extrait un dégradé de 2 couleurs hex depuis le logo du marchand (palier Premium uniquement,
 * quand un logo est fourni), pour que l'affiche reprenne l'identité visuelle réelle de la
 * marque au lieu d'une couleur d'accent générique déconnectée du logo.
 */
export async function analyzeLogoColors(logoBase64: string): Promise<{ from: string; to: string } | null> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 200,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: logoBase64 } },
            {
              type: "text",
              text: `Ce logo de marque : extrais un dégradé de 2 couleurs hex (from / to) qui capture fidèlement son identité visuelle, pour les réutiliser comme accent sur une affiche marketing (badges, boutons) — doit rester lisible avec du texte blanc par-dessus, jamais de blanc/noir pur.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(LogoColorsSchema) },
    });

    return message.parsed_output ?? null;
  } catch {
    return null;
  }
}
