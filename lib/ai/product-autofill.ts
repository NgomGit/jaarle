import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { industries } from "@/lib/knowledge/industries";
import { marketLeafOptions } from "@/lib/market/categories";
import { stripBrands, stripBrandsFromName } from "@/lib/shops/brands";

// « Photo → fiche produit » : l'IA PROPOSE nom, description, catégorie, mots-clés et
// caractéristiques visibles ; le commerçant valide et ajoute le prix. Rien n'est publié ici.
// Modèle économique par défaut (Haiku) : tâche de vision simple, appelée à chaque ajout de produit.
// Surchargeable via PRODUCT_AUTOFILL_MODEL.

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const INDUSTRY_KEYS = industries.map((i) => i.key) as [string, ...string[]];
const MARKET_GROUPS = marketLeafOptions();
const MARKET_KEYS = MARKET_GROUPS.flatMap((g) => g.options.map((o) => o.key)) as [string, ...string[]];
const MARKET_LIST = MARKET_GROUPS.map((g) => `${g.group} : ${g.options.map((o) => `${o.key} (${o.label})`).join(", ")}`).join("\n");

export const ProductSuggestionSchema = z.object({
  subjectType: z.enum(["product", "service"]),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  industryKey: z.enum([...INDUSTRY_KEYS, "none"] as [string, ...string[]]),
  marketCategory: z.enum([...MARKET_KEYS, "none"] as [string, ...string[]]),
  keywords: z.array(z.string()).max(5),
  attributes: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .max(5),
});

export type ProductSuggestion = z.infer<typeof ProductSuggestionSchema>;

export type AutofillImage = { base64: string; mediaType: "image/jpeg" };

export async function suggestProductFromPhotos(
  images: AutofillImage[],
  shopContext: string,
  onUsage?: (usage: { model: string; inputTokens: number; outputTokens: number }) => void
): Promise<ProductSuggestion> {
  const anthropic = new Anthropic();
  const content: (
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
    | { type: "text"; text: string }
  )[] = images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 } }));

  content.push({
    type: "text",
    text: `Voici ${images.length > 1 ? `${images.length} photos du MÊME produit` : "la photo d'un produit"} qu'un commerçant sénégalais veut ajouter à sa boutique en ligne.

Contexte de la boutique :
${shopContext || "(non renseigné)"}

Propose une fiche produit en FRANÇAIS, simple et vendeuse, comme l'écrirait un bon vendeur à Dakar :
- name : nom commercial court (2 à 6 mots), ex. « Boubou homme bazin bleu ». JAMAIS de nom de marque (Nike, Supreme, Gucci…), même si un logo est visible : décris l'article (« T-shirt graphique oversize »), et n'invente aucune référence.
- description : 2 ou 3 phrases concrètes (matière, usage, occasion), 300 caractères maximum, sans prix, sans emoji, sans promesse invérifiable, sans aucun nom de marque.
- category : catégorie courte pour ranger le produit dans la boutique, ex. « Boubous homme », « Soins visage », « Plats ».
- industryKey : le secteur le plus proche parmi la liste fournie, ou "none".
- marketCategory : la catégorie Jaarle Market la plus précise pour CE produit, parmi la liste ci-dessous (la clé seulement), ou "none" si aucune ne convient (service, produit hors liste) :
${MARKET_LIST}
  Le TYPE d'article doit correspondre exactement (un jean ou un short n'est jamais un t-shirt) ; sinon "none".
- keywords : 3 à 5 mots-clés de recherche.
- attributes : caractéristiques VISIBLES uniquement (couleur, matière, motif, contenance lisible sur l'étiquette…). N'invente pas de tailles, de quantités ni de stock.
- subjectType : "service" seulement si la photo montre clairement une prestation plutôt qu'un objet à vendre.
Ne donne jamais de prix.`,
  });

  const model = process.env.PRODUCT_AUTOFILL_MODEL || DEFAULT_MODEL;
  const message = await anthropic.messages.parse({
    model,
    max_tokens: 800,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(ProductSuggestionSchema) },
  });

  onUsage?.({ model, inputTokens: message.usage?.input_tokens ?? 0, outputTokens: message.usage?.output_tokens ?? 0 });
  if (!message.parsed_output) throw new Error("Réponse IA invalide.");
  const out = message.parsed_output;
  return {
    ...out,
    // Filet de sécurité : les noms de marques sont retirés même si le modèle en met un.
    name: stripBrandsFromName(out.name.trim()).slice(0, 120),
    description: stripBrands(out.description.trim()).slice(0, 600),
    category: out.category.trim().slice(0, 60),
    keywords: out.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 5),
    attributes: out.attributes.filter((a) => a.name.trim() && a.value.trim()).slice(0, 5),
  };
}
