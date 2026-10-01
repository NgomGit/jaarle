import { allMarketCategories, type MarketCategory } from "@/lib/market/categories";
import { MARKET_CITIES, slugify, type MarketCity } from "@/lib/market/cities";

// Lecture d'une recherche du Market : on reconnaît la ville (« robe dakar » → filtre Dakar) et les
// catégories (« chaussures » → produits classés en Chaussures, même sans le mot dans leur nom).
// Le texte reste cherché tel quel dans les noms, descriptions et boutiques : la catégorie AJOUTE
// des résultats, elle n'en retire jamais.

const STOPWORDS = new Set(["les", "des", "une", "pour", "avec", "sur", "dans", "par", "and", "the", "chez", "pas", "cher"]);

/** Forme simple d'un mot : minuscules, sans accent, sans pluriel (s / x final). */
function stem(word: string): string {
  return word.length > 3 ? word.replace(/[sx]$/, "") : word;
}

function tokens(text: string): string[] {
  return slugify(text)
    .split("-")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map(stem);
}

let INDEX: { cat: MarketCategory; words: Set<string> }[] | null = null;
function categoryIndex() {
  if (!INDEX) INDEX = allMarketCategories().map((cat) => ({ cat, words: new Set([...tokens(cat.label), stem(cat.slug)]) }));
  return INDEX;
}

export interface ParsedSearch {
  /** Texte cherché (sans la ville reconnue). */
  text: string;
  /** Ville reconnue dans le texte (si aucune ville n'est déjà choisie). */
  city: MarketCity | null;
  /** Catégories reconnues (pour l'affichage) et leurs clés de feuilles (pour la requête). */
  categories: MarketCategory[];
  leafKeys: string[];
}

export function parseMarketSearch(raw: string, opts: { cityAlreadySet?: boolean } = {}): ParsedSearch {
  let text = raw.trim().replace(/\s+/g, " ").slice(0, 80);
  let city: MarketCity | null = null;

  if (!opts.cityAlreadySet && text) {
    // Les noms de ville les plus longs d'abord (« Saint-Louis » avant « Louis »…).
    const slugText = `-${slugify(text)}-`;
    const found = [...MARKET_CITIES].sort((a, b) => b.slug.length - a.slug.length).find((c) => slugText.includes(`-${c.slug}-`));
    if (found) {
      city = found;
      // Retire la ville du texte (« robe à dakar » → « robe »).
      const words = text.split(" ");
      const cityWords = found.slug.split("-");
      const kept = words.filter((w) => !cityWords.includes(slugify(w)));
      text = kept.filter((w) => !["a", "à"].includes(w.toLowerCase())).join(" ").trim();
    }
  }

  const qWords = new Set(tokens(text));
  const categories =
    qWords.size === 0
      ? []
      : categoryIndex()
          .filter(({ words }) => [...qWords].some((w) => words.has(w)))
          .map(({ cat }) => cat);
  // Les plus précises d'abord, pour l'affichage.
  categories.sort((a, b) => b.level - a.level);
  const leafKeys = [...new Set(categories.flatMap((c) => c.leafKeys))];
  return { text, city, categories, leafKeys };
}
