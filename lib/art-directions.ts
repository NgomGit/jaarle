// ============================================================================
// art-directions.ts — Presets d'art direction CURATÉS (cohérents), en
// remplacement du tirage de 9 axes indépendants au hasard (creative-vocabulary).
//
// Principe : la variété vient du CHOIX entre plusieurs directions internement
// cohérentes, pas d'un dé lancé sur 9 dimensions décorrélées. Chaque preset
// assortit à la main : ambiance + motif + palette + typographie + gabarit.
// ============================================================================

export type PosterMood = "dark-statement" | "light-editorial";
export type MotifKind = "bogolan" | "kente-adinkra" | "adinkra-sun" | "wax-sun" | "none";
export type HeadlineFont = "bebas" | "playfair";

export interface ArtDirection {
  key: string;
  labelFr: string;
  mood: PosterMood;
  motif: MotifKind;
  headlineFont: HeadlineFont;
  useCutout: boolean; // true => produit détouré posé sur décor designé (remove.bg)
  palette: {
    /** fond : couleur unie OU dégradé [from,to] */
    bg: string | [string, string];
    ink: string; // texte principal
    accent: string; // CTA, filets, prix
    motif: string; // couleur du motif
    kente?: string[]; // palette kente si applicable
  };
}

// --- Presets « artisan » (mode, artisanat, accessoires, sacs, chaussures) ---
export const ARTISAN_DIRECTIONS: ArtDirection[] = [
  {
    key: "bogolan-nuit",
    labelFr: "Bogolan Nuit",
    mood: "dark-statement",
    motif: "bogolan",
    headlineFont: "bebas",
    useCutout: true,
    palette: { bg: "#1a150f", ink: "#F3EAD7", accent: "#C79A3B", motif: "#d8c7a4" },
  },
  {
    key: "kente-clair",
    labelFr: "Kente Clair",
    mood: "light-editorial",
    motif: "kente-adinkra",
    headlineFont: "playfair",
    useCutout: true,
    palette: {
      bg: ["#F8F1E1", "#EBDEC1"],
      ink: "#17130C",
      accent: "#146B3A",
      motif: "#8A6A1F",
      kente: ["#146B3A", "#C79A3B", "#B02E26", "#141414", "#EFE4CB"],
    },
  },
  {
    key: "adinkra-terre",
    labelFr: "Adinkra Terre",
    mood: "dark-statement",
    motif: "adinkra-sun",
    headlineFont: "bebas",
    useCutout: true,
    palette: { bg: ["#3a1f14", "#241009"], ink: "#F6E7D2", accent: "#E08A3C", motif: "#E08A3C" },
  },
];

// --- Presets neutres (électronique, resto, immobilier… : pas de motif ethnique) ---
export const NEUTRAL_DIRECTIONS: ArtDirection[] = [
  {
    key: "wax-or",
    labelFr: "Éditorial Or",
    mood: "light-editorial",
    motif: "wax-sun",
    headlineFont: "playfair",
    useCutout: true,
    palette: { bg: ["#F7EFDD", "#E6D6B4"], ink: "#17130C", accent: "#C79A3B", motif: "#C9A24A" },
  },
  {
    key: "statement-sombre",
    labelFr: "Statement Sombre",
    mood: "dark-statement",
    motif: "none",
    headlineFont: "bebas",
    useCutout: true,
    palette: { bg: ["#1c1922", "#0d0b11"], ink: "#F3EAD7", accent: "#C79A3B", motif: "#C79A3B" },
  },
];

/** Catégories où les motifs africains sont pertinents (produits artisanaux). */
export const ARTISAN_INDUSTRIES = new Set<string>(["fashion", "artisanat", "accessoires", "beauty"]);

/**
 * Choisit une direction cohérente selon la catégorie, de façon déterministe (seed)
 * pour pouvoir reproduire / varier proprement d'une génération à l'autre.
 * Les catégories artisanales piochent dans les directions à motifs ; les autres
 * dans les directions neutres.
 */
export function pickArtDirection(industryKey: string | null, seed = 1): ArtDirection {
  const pool =
    industryKey && ARTISAN_INDUSTRIES.has(industryKey)
      ? [...ARTISAN_DIRECTIONS, NEUTRAL_DIRECTIONS[0]] // artisan + 1 neutre pour la variété
      : NEUTRAL_DIRECTIONS;
  return pool[Math.abs(seed) % pool.length];
}

/** Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur hex. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  const r = clamp((n >> 16) & 255);
  const g = clamp((n >> 8) & 255);
  const b = clamp(n & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

/**
 * Construit une direction artistique dont la PALETTE est dérivée du SUJET (via le
 * dégradé d'accent renvoyé par l'analyse vision), au lieu d'un preset figé — le décor
 * et le texte partagent ainsi les mêmes couleurs, cohérentes avec le produit
 * (ex : poisson -> bleu mer, karité -> or chaud). Le TYPE de motif reste piloté par
 * la catégorie (motifs africains pour l'artisanat, halo neutre sinon).
 */
export function artDirectionFromAnalysis(
  accent: { from: string; to: string },
  industryKey: string | null,
  seed = 1
): ArtDirection {
  const motif: MotifKind = industryKey && ARTISAN_INDUSTRIES.has(industryKey) ? "bogolan" : "wax-sun";
  return {
    key: "subject-derived",
    labelFr: "Dérivée du sujet",
    mood: "dark-statement",
    motif,
    headlineFont: "bebas",
    useCutout: true,
    palette: {
      bg: [shade(accent.to, -0.7), shade(accent.from, -0.82)],
      ink: "#F3EAD7",
      accent: accent.from,
      motif: shade(accent.from, 0.22),
    },
  };
}
