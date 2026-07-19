import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AllowedMediaType } from "@/lib/media-types";

const QualityCheckSchema = z.object({
  productPreserved: z.boolean(),
  cleanComposition: z.boolean(),
  issues: z.array(z.string()).max(3),
});

/**
 * Étape "Quality Checker" : compare le produit d'origine à l'affiche générée pour détecter
 * si le produit a été altéré ou si la composition est ratée (artefacts, texte parasite).
 * Fail-open : si le check lui-même échoue (erreur réseau, etc.), on ne bloque pas la
 * génération — l'utilisateur reçoit quand même son affiche.
 */
export async function checkPosterQuality(
  originalPhotoBase64: string,
  originalMediaType: AllowedMediaType,
  generatedImageBase64: string
): Promise<{ passed: boolean; issues: string[] }> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 400,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Photo produit d'origine :" },
            { type: "image", source: { type: "base64", media_type: originalMediaType, data: originalPhotoBase64 } },
            { type: "text", text: "Affiche générée à partir de ce produit :" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: generatedImageBase64 } },
            {
              type: "text",
              text: `Vérifie deux choses : (1) le produit sur l'affiche est-il bien le MÊME produit que la photo d'origine — mêmes couleurs, forme, motif, logo — sans avoir été redessiné ou réinterprété ? (2) la composition est-elle propre et professionnelle, sans artefact visuel ni texte parasite généré par erreur ? Liste les problèmes concrets s'il y en a.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(QualityCheckSchema) },
    });

    const result = message.parsed_output;
    if (!result) return { passed: true, issues: [] };
    return { passed: result.productPreserved && result.cleanComposition, issues: result.issues };
  } catch {
    return { passed: true, issues: [] };
  }
}

const TextAccuracySchema = z.object({
  priceCorrect: z.boolean(),
  contactCorrect: z.boolean(),
  textLegible: z.boolean(),
  issues: z.array(z.string()).max(3),
});

/**
 * Vérifie que le prix et le contact affichés sur une affiche dessinée par l'IA (texte inclus
 * dans l'image, pas notre bandeau satori) sont exacts. Fail-closed volontairement : si le
 * contrôle échoue ou ne peut pas se prononcer, on considère que ça n'a PAS passé — une erreur
 * de prix ou de numéro est plus grave qu'un défaut esthétique, donc en cas de doute on préfère
 * basculer sur le bandeau satori fiable plutôt que de risquer d'afficher une info fausse.
 */
export async function checkTextAccuracy(
  imageBase64: string,
  expected: { price: string; phone?: string; productName?: string }
): Promise<{ passed: boolean; issues: string[] }> {
  try {
    const requirements = [`le prix "${expected.price} FCFA"`];
    if (expected.phone) requirements.push(`le contact WhatsApp "${expected.phone}"`);
    if (expected.productName) requirements.push(`le nom du produit "${expected.productName}"`);

    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 400,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64 } },
            {
              type: "text",
              text: `Cette affiche doit afficher exactement : ${requirements.join(", ")}. Vérifie que ce texte apparaît bien sur l'image, correctement orthographié/chiffré et parfaitement lisible — aucun chiffre inventé, tronqué ou déformé. ${expected.phone ? "" : "Aucun numéro de contact n'est requis sur ce palier."} Liste les problèmes concrets s'il y en a.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(TextAccuracySchema) },
    });

    const result = message.parsed_output;
    if (!result) return { passed: false, issues: ["Vérification impossible."] };
    const contactOk = expected.phone ? result.contactCorrect : true;
    return { passed: result.priceCorrect && result.textLegible && contactOk, issues: result.issues };
  } catch {
    return { passed: false, issues: ["Erreur lors de la vérification du texte."] };
  }
}
