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
  generatedImageBase64: string,
  strictHeroView = false
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
            { type: "text", text: "Photo d'origine (produit ou service à mettre en valeur) :" },
            { type: "image", source: { type: "base64", media_type: originalMediaType, data: originalPhotoBase64 } },
            { type: "text", text: "Affiche générée à partir de ce sujet :" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: generatedImageBase64 } },
            {
              type: "text",
              text: `Vérifie deux choses : (1) le sujet sur l'affiche est-il bien le MÊME que sur la photo d'origine — mêmes couleurs, forme, motif, logo — sans avoir été redessiné ou réinterprété ?${
                strictHeroView
                  ? " Cette photo d'origine est la photo PRINCIPALE choisie : le sujet mis en avant sur l'affiche doit être montré sous la MÊME vue / le MÊME angle qu'elle (pas l'angle d'une autre photo). Si ce n'est pas le cas, productPreserved = false."
                  : ""
              } (2) la composition est-elle propre et professionnelle, sans artefact visuel ni texte parasite généré par erreur ? Liste les problèmes concrets s'il y en a.`,
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
  businessNameCorrect: z.boolean(),
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
  expected: { price?: string; phone?: string; productName?: string; businessName?: string }
): Promise<{ passed: boolean; issues: string[] }> {
  try {
    const requirements: string[] = [];
    if (expected.price) requirements.push(`le prix "${expected.price} FCFA"`);
    if (expected.phone) requirements.push(`le contact WhatsApp "${expected.phone}"`);
    if (expected.productName) requirements.push(`le nom "${expected.productName}"`);
    if (expected.businessName) requirements.push(`le nom d'entreprise "${expected.businessName}"`);

    if (requirements.length === 0) return { passed: true, issues: [] };

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
              text: `Cette affiche doit afficher exactement : ${requirements.join(", ")}. Vérifie que ce texte apparaît bien sur l'image, correctement orthographié/chiffré et parfaitement lisible — aucun chiffre inventé, tronqué ou déformé. ${expected.phone ? "" : "Aucun numéro de contact n'est requis sur ce palier."} ${expected.price ? "" : "Aucun prix fixe n'est requis sur cette affiche (prix sur devis) — ne signale pas son absence comme un problème."} Liste les problèmes concrets s'il y en a.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(TextAccuracySchema) },
    });

    const result = message.parsed_output;
    if (!result) return { passed: false, issues: ["Vérification impossible."] };
    const priceOk = expected.price ? result.priceCorrect : true;
    const contactOk = expected.phone ? result.contactCorrect : true;
    const businessNameOk = expected.businessName ? result.businessNameCorrect : true;
    return { passed: priceOk && result.textLegible && contactOk && businessNameOk, issues: result.issues };
  } catch {
    return { passed: false, issues: ["Erreur lors de la vérification du texte."] };
  }
}

const MultiReferenceCheckSchema = z.object({
  sameProduct: z.boolean(),
  heroMatchesMainReference: z.boolean(),
  heroAngleMatchesMainReference: z.boolean(),
  mainColorsPreserved: z.boolean(),
  distinctiveDetailsPreserved: z.boolean(),
  singleProductInstance: z.boolean(),
  noMergedViewpoints: z.boolean(),
  notRedesigned: z.boolean(),
  noLookalikeObjects: z.boolean(),
  cleanComposition: z.boolean(),
  issues: z.array(z.string()).max(4),
});

/**
 * Contrôle du décor sur le chemin multi-image : en UN appel, compare le décor à la photo
 * principale ET aux photos secondaires, et détecte les défauts propres au multi-image (produit
 * dupliqué, vues fusionnées, vue secondaire prise comme héros, objets sosies). Les problèmes sont
 * rédigés en anglais, courts et actionnables : ils sont renvoyés tels quels au nouvel essai.
 * Fail-open comme checkPosterQuality (une panne du contrôle ne bloque pas l'affiche).
 */
export async function checkMultiReferenceFidelity(
  main: { base64: string; mediaType: AllowedMediaType },
  secondaries: { base64: string; mediaType: AllowedMediaType }[],
  generatedImageBase64: string,
  criticalFeatures: string[]
): Promise<{ passed: boolean; issues: string[] }> {
  try {
    const content: (
      | { type: "image"; source: { type: "base64"; media_type: AllowedMediaType | "image/png"; data: string } }
      | { type: "text"; text: string }
    )[] = [
      { type: "text", text: "Photo PRINCIPALE du produit (référence du héros) :" },
      { type: "image", source: { type: "base64", media_type: main.mediaType, data: main.base64 } },
    ];
    secondaries.forEach((s, i) => {
      content.push({ type: "text", text: `Photo secondaire ${i + 1} (même produit, sert seulement à comprendre les détails) :` });
      content.push({ type: "image", source: { type: "base64", media_type: s.mediaType, data: s.base64 } });
    });
    content.push({ type: "text", text: "Décor d'affiche généré :" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: generatedImageBase64 } });
    content.push({
      type: "text",
      text: `Contrôle ce décor. Réponds true quand tout va bien :
1. sameProduct : le produit du décor est le même que sur les photos.
2. heroMatchesMainReference : le produit mis en avant correspond à la photo PRINCIPALE.
3. heroAngleMatchesMainReference : il est montré sous la même vue / le même angle que la photo principale (pas l'angle d'une photo secondaire).
4. mainColorsPreserved : ses couleurs principales sont conservées.
5. distinctiveDetailsPreserved : ses détails caractéristiques sont conservés${criticalFeatures.length ? ` (${criticalFeatures.join(" ; ")})` : ""}.
6. singleProductInstance : il n'y a qu'UN seul exemplaire du produit (pas de copie, pas de vue supplémentaire, pas de vignette dessinée).
7. noMergedViewpoints : le produit n'est pas un mélange impossible de plusieurs vues.
8. notRedesigned : le produit n'a pas été substantiellement redessiné.
9. noLookalikeObjects : aucun objet supplémentaire ressemblant au produit n'a été ajouté.
10. cleanComposition : composition propre, sans artefact ni texte parasite.
issues : pour chaque point en échec, une phrase courte EN ANGLAIS décrivant précisément le défaut (ex. "a second copy of the bag appears on the left", "the handle shape was changed", "the hero uses the back view instead of the front view").`,
    });

    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 600,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(MultiReferenceCheckSchema) },
    });

    const r = message.parsed_output;
    if (!r) return { passed: true, issues: [] };
    const passed =
      r.sameProduct &&
      r.heroMatchesMainReference &&
      r.heroAngleMatchesMainReference &&
      r.mainColorsPreserved &&
      r.distinctiveDetailsPreserved &&
      r.singleProductInstance &&
      r.noMergedViewpoints &&
      r.notRedesigned &&
      r.noLookalikeObjects &&
      r.cleanComposition;
    return { passed, issues: r.issues };
  } catch {
    return { passed: true, issues: [] };
  }
}
