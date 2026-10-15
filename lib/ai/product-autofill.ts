import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { industries } from "@/lib/knowledge/industries";
import { marketLeafOptions } from "@/lib/market/categories";
import { brandsAllowedFor, stripBrands, stripBrandsFromName } from "@/lib/shops/brands";

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

/** Contexte venant de l'import en lot : nom provisoire du groupe et inventaire IA de ses photos. */
export interface AutofillGroupHints {
  label?: string | null;
  /** Une note par photo envoyée, dans le même ordre (vide si inconnue). */
  notes?: (string | null | undefined)[];
  /** Options déjà choisies par le vendeur (ex. Couleur : Blanc, Noir) : un seul produit décliné. */
  options?: { name: string; values: string[] }[];
}

/** Bloc de consigne « analyse du lot » (vide sans indice). Exporté pour les tests. */
export function groupHintsBlock(hints?: AutofillGroupHints): string {
  const label = hints?.label?.replace(/\s+/g, " ").trim().slice(0, 120);
  const notes = (hints?.notes ?? []).map((n, i) => (n?.trim() ? `photo ${i + 1} : ${n.replace(/\s+/g, " ").trim().slice(0, 200)}` : null)).filter(Boolean);
  const options = (hints?.options ?? []).filter((o) => o.name.trim() && o.values.length >= 2);
  if (!label && !notes.length && !options.length) return "";
  const optionLines = options
    .map((o) => {
      const colour = /couleur|coloris|color/i.test(o.name);
      return `- Ce produit est vendu en plusieurs déclinaisons — ${o.name.trim()} : ${o.values.join(", ")}. Les photos montrent ces déclinaisons : ${
        colour ? "n'écris AUCUNE couleur dans le nom, la description ni les caractéristiques" : `ne fixe pas une seule valeur de « ${o.name.trim()} »`
      } (ex. « Ensemble chemise à losanges » et non « Ensemble chemise à losanges vert »).`;
    })
    .join("\n");
  return `
Analyse du lot (indicative : vérifie sur les photos, ne reprends que ce qui y est visible) :
${label ? `- Nom provisoire déjà montré au vendeur : « ${label} »\n` : ""}${notes.length ? `- Notes par photo :\n${notes.map((n) => `  ${n}`).join("\n")}\n` : ""}${optionLines ? `${optionLines}\n` : ""}${label ? (optionLines ? "Ta fiche doit décrire le MÊME modèle que ce nom provisoire, sans la déclinaison qu'il cite.\n" : "Ta fiche doit décrire le MÊME article que ce nom provisoire : garde-le reconnaissable (tu peux le préciser, ou le corriger s'il est faux d'après les photos).\n") : ""}`;
}

export async function suggestProductFromPhotos(
  images: AutofillImage[],
  shopContext: string,
  onUsage?: (usage: { model: string; inputTokens: number; outputTokens: number }) => void,
  groupHints?: AutofillGroupHints
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
${groupHintsBlock(groupHints)}
Propose une fiche produit en FRANÇAIS, simple et vendeuse, comme l'écrirait un bon vendeur à Dakar :
- name : nom commercial court (2 à 6 mots), ex. « Boubou homme bazin bleu ». JAMAIS de nom de marque (Nike, Supreme, Gucci…), même si un logo est visible : décris l'article (« T-shirt graphique oversize »), et n'invente aucune référence.
  EXCEPTION VÉHICULES : pour une voiture, une moto, un scooter, un utilitaire ou un camion (et une pièce auto), la marque et le modèle SONT le nom : écris-les quand ils sont reconnaissables avec certitude (logo, badge, forme caractéristique), ex. « Toyota Land Cruiser gris », « Mercedes Classe C noire », « Moto Yamaha 125 rouge ». N'invente jamais l'année, le kilométrage ni la motorisation ; si la marque n'est pas certaine, décris le véhicule (« SUV noir 7 places »).
- description : 2 ou 3 phrases concrètes (matière, usage, occasion), 300 caractères maximum, sans prix, sans emoji, sans promesse invérifiable, sans aucun nom de marque (sauf véhicule : marque et modèle autorisés, et seulement ce qui est visible : couleur, carrosserie, intérieur, jantes…).
- category : catégorie courte pour ranger le produit dans la boutique, ex. « Boubous homme », « Soins visage », « Plats ».
- industryKey : le secteur le plus proche parmi la liste fournie, ou "none".
- marketCategory : la catégorie Jaarle Market la plus précise pour CE produit ou CE service, parmi la liste ci-dessous (la clé seulement), ou "none" si aucune ne convient (produit ou service hors liste). Une prestation se classe dans les catégories de services (ex. coiffure, plomberie, décoration de mariage) :
${MARKET_LIST}
  Le TYPE d'article doit correspondre exactement (un jean ou un short n'est jamais un t-shirt) ; sinon "none".
- keywords : 3 à 5 mots-clés de recherche.
- attributes : caractéristiques VISIBLES uniquement (couleur, matière, motif, contenance lisible sur l'étiquette…). N'invente pas de tailles, de quantités, de stock ni de matière qu'on ne peut pas voir ou lire.
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
  // Filet de sécurité : les noms de marques sont retirés même si le modèle en met un — sauf véhicules.
  const keepBrands = brandsAllowedFor(out.marketCategory === "none" ? null : out.marketCategory);
  return {
    ...out,
    name: (keepBrands ? out.name.trim() : stripBrandsFromName(out.name.trim())).slice(0, 120),
    description: (keepBrands ? out.description.trim() : stripBrands(out.description.trim())).slice(0, 600),
    category: out.category.trim().slice(0, 60),
    keywords: out.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 5),
    attributes: out.attributes.filter((a) => a.name.trim() && a.value.trim()).slice(0, 5),
  };
}
