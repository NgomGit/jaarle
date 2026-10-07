// Affiches multi-photos V2 — types partagés.
//
// Principe : l'IA crée la scène et y intègre le produit principal ; le code compose tout ce qui
// doit être exact (vraies photos secondaires, titre, prix, contact, logo, CTA). Ces types décrivent
// ce que le renderer reçoit et ce qui est enregistré avec chaque création (`creations.design`).

/** Archétypes retenus (décision du 2026-10-07). FULL_HERO et EDITORIAL_SPLIT ont été écartés. */
export const ARCHETYPES = ["HERO_DETAIL", "DETAIL_STRIP", "COLLAGE"] as const;
export type ArchetypeKey = (typeof ARCHETYPES)[number];

export const VARIANTS = ["A", "B", "C"] as const;
export type VariantKey = (typeof VARIANTS)[number];

/** Identifiant stable d'une mise en page : archétype + variante (ex. "HERO_DETAIL.A"). */
export type LayoutId = `${ArchetypeKey}.${VariantKey}`;

export const TYPE_PAIRS = ["T1", "T2", "T3", "T4", "T5"] as const;
export type TypePairKey = (typeof TYPE_PAIRS)[number];

/** Rôle d'une photo secondaire, détecté par l'analyse des références. */
export type SecondaryRole = "detail" | "alternate_angle" | "usage" | "texture";

/** Rectangle en pourcentage (0-100) d'une image : x, y = coin haut-gauche. */
export interface PctRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Palette de 4 jetons + couleur de texte sur l'accent (calculée). */
export interface Palette {
  /** Fond sombre (panneaux, bandes, voiles). */
  dark: string;
  /** Fond clair (panneaux clairs, encarts). */
  light: string;
  /** Accent (prix, CTA, mots mis en valeur). */
  accent: string;
  /** Couleur secondaire douce (surtitres sur fond clair, filets). */
  muted: string;
}

/** Contenu commercial, rendu tel quel par le code (jamais par l'IA image). */
export interface PosterContent {
  title: string;
  /** Mot ou groupe de mots du titre à mettre en valeur (doit figurer dans le titre). */
  titleAccent?: string | null;
  /** Surtitre court (catégorie, collection…). */
  kicker?: string | null;
  /** 0 à 3 points forts courts. */
  benefits: string[];
  /** Prix en FCFA ; null = « Sur devis ». */
  price: number | null;
  /** Téléphone(s) du vendeur ; plusieurs numéros séparés par « | » (seul le 1er est affiché). */
  phone: string;
  businessName?: string | null;
  /** Logo du vendeur (n'importe quel format image). */
  logo?: Buffer | null;
  /** Libellé du bouton (défaut : « Commander sur WhatsApp »). */
  ctaLabel?: string;
}

/** Photo secondaire réelle, déjà validée par l'analyse (même produit). */
export interface SecondaryInput {
  image: Buffer;
  role: SecondaryRole;
  /** Légende courte (2-3 mots) issue de l'analyse, ex. « Intérieur cuir ». */
  caption: string;
  /** Zone utile à garder (détail / sujet), en % de la photo. Absente = centre « attention ». */
  focus?: PctRect | null;
  /** Qualité 0-1 estimée par l'analyse (netteté, lumière, résolution utile). */
  quality?: number;
}

export interface RenderInput {
  layout: LayoutId;
  typePair: TypePairKey;
  palette: Palette;
  /** Scène générée (produit principal intégré), au ratio demandé par la mise en page. */
  scene: Buffer;
  secondaries: SecondaryInput[];
  content: PosterContent;
  /** Taille de sortie (carré) ; défaut 1080. */
  size?: number;
}

export interface RenderResult {
  /** JPEG final. */
  image: Buffer;
  /** Recadrages appliqués aux photos secondaires (enregistrés dans le design). */
  crops: { index: number; rect: PctRect }[];
  /** Avertissements non bloquants (ex. titre réduit). */
  warnings: string[];
}

/** Erreur « cette mise en page ne convient pas à ce contenu » : l'appelant essaie une autre variante. */
export class LayoutUnfitError extends Error {
  constructor(
    public readonly layout: LayoutId,
    public readonly reason: string
  ) {
    super(`${layout} : ${reason}`);
    this.name = "LayoutUnfitError";
  }
}
