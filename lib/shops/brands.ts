// Noms de marques retirés des annonces (règle de vente de Jaarle : aucun nom de marque dans le nom
// ou la description d'un produit, pour éviter les litiges de contrefaçon). Liste volontairement
// centrée sur la mode, le luxe et les accessoires — les marques les plus copiées. À compléter au besoin.
// Écartés volontairement (mots ou prénoms courants) : boss, essentials, represent, coach, céline, omega.

const BRANDS = [
  // Streetwear
  "supreme", "bape", "a bathing ape", "stussy", "stüssy", "off-white", "off white", "palm angels", "amiri",
  "fear of god", "trapstar", "corteiz", "nofs", "sp5der", "spider worldwide", "hellstar", "gallery dept",
  "chrome hearts", "rhude", "kith", "anti social social club", "assc", "brand game", "vlone", 
  // Sport
  "nike", "jordan", "air jordan", "air force", "air max", "yeezy", "adidas", "puma", "new balance", "reebok",
  "under armour", "asics", "fila", "converse", "vans", "the north face", "north face", "lacoste", "umbro",
  // Mode
  "diesel", "calvin klein", "tommy hilfiger", "ralph lauren", "polo ralph lauren", "hugo boss", "levi's",
  "levis", "zara", "h&m", "guess", "armani", "emporio armani", "dsquared2", "dsquared", "true religion",
  "g-star", "moncler", "stone island", "cp company", "carhartt", "dickies", "timberland",
  // Luxe
  "gucci", "louis vuitton", "lv", "chanel", "dior", "christian dior", "prada", "versace", "balenciaga", "fendi",
  "burberry", "hermes", "hermès", "givenchy", "saint laurent", "ysl", "valentino", "bottega veneta", "loewe", "miu miu", "dolce & gabbana", "dolce gabbana", "d&g", "philipp plein", "alexander mcqueen",
  "michael kors", "kenzo", "moschino", "rolex", "cartier", "audemars piguet", "patek philippe", 
];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Plus longs d'abord (« air jordan » avant « jordan »). Limites de mot tolérantes aux accents et à « & ».
const PATTERN = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${[...BRANDS].sort((a, b) => b.length - a.length).map(escape).join("|")})(?=$|[^\\p{L}\\p{N}])`,
  "giu"
);

/** Retire les noms de marques d'un texte et remet les espaces / la ponctuation au propre. */
export function stripBrands(text: string): string {
  const out = text
    .replace(PATTERN, "$1")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/gm, "")
    .trim();
  return out;
}

/** Nom de produit sans marque ; si plus rien ne reste, on garde un nom générique plutôt que vide. */
export function stripBrandsFromName(name: string): string {
  const cleaned = stripBrands(name);
  return cleaned.length >= 2 ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Article";
}

export function containsBrand(text: string | null | undefined): boolean {
  if (!text) return false;
  PATTERN.lastIndex = 0;
  const found = PATTERN.test(text);
  PATTERN.lastIndex = 0;
  return found;
}
