import type { ArchetypeKey, LayoutId, PctRect, VariantKey } from "@/lib/poster-v2/types";

// Registre des 9 mises en page retenues (2026-10-07) : 3 archétypes × 3 variantes.
// Toutes les coordonnées sont définies sur une base 1080 × 1080 et ne dépendent JAMAIS de l'IA.
// Pour chaque mise en page, la fiche « scène » dit au modèle d'image où mettre le produit principal
// et quelles zones laisser calmes (texte, photos secondaires) : la scène est composée POUR la mise
// en page, pas l'inverse.

export type SceneAspect = "1:1" | "3:2" | "2:3";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutSpec {
  id: LayoutId;
  archetype: ArchetypeKey;
  variant: VariantKey;
  name: string;
  /** Nombre de photos secondaires affichées (hors produit principal). */
  secondaryCount: 1 | 2;
  scene: {
    /** Ratio demandé au modèle d'image. */
    aspect: SceneAspect;
    /** Cadre où la scène est affichée sur l'affiche (px, base 1080). */
    frame: Box;
    /** Où placer le produit principal, en % du CADRE. */
    heroZone: PctRect;
    /** Zones à garder calmes (décor doux, sans objet), en % du CADRE. */
    calmZones: PctRect[];
  };
  /** Taille des cases des photos secondaires (px, base 1080), dans l'ordre. */
  slots: { w: number; h: number }[];
  /** Place pour le texte : les mises en page « roomy » acceptent les titres longs. */
  textRoom: "compact" | "standard" | "roomy";
  /** Fond dominant des zones de texte (choix de la palette). */
  tone: "dark" | "light";
  /** Familles de produits pour lesquelles la mise en page est la plus pertinente (bonus de score). */
  suits: ProductFamily[];
  /** Une photo « portée / en situation » (personne visible) ne doit pas finir dans une petite case. */
  avoidUsage: boolean;
}

export type ProductFamily =
  | "auto"
  | "mode"
  | "chaussures"
  | "accessoires"
  | "beaute"
  | "electronique"
  | "maison"
  | "food"
  | "service"
  | "autre";

/** Secteurs Jaarle (lib/knowledge/industries) → familles de mise en page. */
export function productFamily(industry: string | null | undefined, category?: string | null): ProductFamily {
  const c = (category ?? "").toLowerCase();
  if (/chaussure|basket|sneaker|sandale|escarpin|botte|mocassin|richelieu/.test(c)) return "chaussures";
  if (/montre|lunette|bijou|bague|collier|sac|ceinture|bracelet|parfum/.test(c)) return "accessoires";
  switch (industry) {
    case "automotive":
      return "auto";
    case "fashion":
    case "artisanat":
      return "mode";
    case "accessoires":
      return "accessoires";
    case "beauty":
    case "pharmacy":
      return "beaute";
    case "electronics":
      return "electronique";
    case "furniture":
    case "real-estate":
    case "hotel":
      return "maison";
    case "restaurant":
    case "grocery":
    case "poissonnerie":
    case "agriculture":
      return "food";
    case "services":
    case "events":
    case "travel":
      return "service";
    default:
      return "autre";
  }
}

const L: LayoutSpec[] = [
  // ——— HERO_DETAIL : produit principal + 1 détail réel ———
  {
    id: "HERO_DETAIL.A",
    archetype: "HERO_DETAIL",
    variant: "A",
    name: "Loupe",
    secondaryCount: 1,
    scene: {
      aspect: "1:1",
      frame: { x: 0, y: 0, w: 1080, h: 1080 },
      heroZone: { x: 6, y: 16, w: 56, h: 56 },
      calmZones: [
        { x: 62, y: 2, w: 36, h: 42 },
        { x: 0, y: 72, w: 100, h: 28 },
      ],
    },
    slots: [{ w: 300, h: 300 }],
    textRoom: "compact",
    tone: "dark",
    suits: ["accessoires", "auto", "beaute", "electronique"],
    avoidUsage: true,
  },
  {
    id: "HERO_DETAIL.B",
    archetype: "HERO_DETAIL",
    variant: "B",
    name: "Encart débordant",
    secondaryCount: 1,
    scene: {
      aspect: "3:2",
      frame: { x: 0, y: 0, w: 1080, h: 700 },
      heroZone: { x: 4, y: 10, w: 62, h: 82 },
      calmZones: [{ x: 68, y: 70, w: 32, h: 30 }],
    },
    slots: [{ w: 272, h: 344 }],
    textRoom: "standard",
    tone: "light",
    suits: ["chaussures", "mode", "auto", "food"],
    avoidUsage: false,
  },
  {
    id: "HERO_DETAIL.C",
    archetype: "HERO_DETAIL",
    variant: "C",
    name: "Panneau détail",
    secondaryCount: 1,
    scene: {
      aspect: "2:3",
      frame: { x: 0, y: 0, w: 684, h: 1080 },
      heroZone: { x: 8, y: 12, w: 84, h: 80 },
      calmZones: [{ x: 0, y: 0, w: 60, h: 10 }],
    },
    slots: [{ w: 312, h: 264 }],
    textRoom: "roomy",
    tone: "light",
    suits: ["mode", "beaute", "accessoires", "maison"],
    avoidUsage: false,
  },
  // ——— DETAIL_STRIP : produit principal + bande de 2 détails ———
  {
    id: "DETAIL_STRIP.A",
    archetype: "DETAIL_STRIP",
    variant: "A",
    name: "Bande basse",
    secondaryCount: 2,
    scene: {
      aspect: "3:2",
      frame: { x: 0, y: 0, w: 1080, h: 672 },
      heroZone: { x: 5, y: 18, w: 90, h: 50 },
      calmZones: [{ x: 0, y: 72, w: 100, h: 28 }],
    },
    slots: [
      { w: 308, h: 264 },
      { w: 308, h: 264 },
    ],
    textRoom: "roomy",
    tone: "dark",
    suits: ["auto", "electronique", "maison", "mode"],
    avoidUsage: false,
  },
  {
    id: "DETAIL_STRIP.B",
    archetype: "DETAIL_STRIP",
    variant: "B",
    name: "Rail vertical",
    secondaryCount: 2,
    scene: {
      aspect: "1:1",
      frame: { x: 0, y: 0, w: 1080, h: 1080 },
      heroZone: { x: 4, y: 12, w: 64, h: 56 },
      calmZones: [
        { x: 70, y: 0, w: 30, h: 100 },
        { x: 0, y: 70, w: 70, h: 30 },
      ],
    },
    slots: [
      { w: 252, h: 252 },
      { w: 252, h: 252 },
    ],
    textRoom: "compact",
    tone: "dark",
    suits: ["accessoires", "electronique", "auto", "beaute"],
    avoidUsage: true,
  },
  {
    id: "DETAIL_STRIP.C",
    archetype: "DETAIL_STRIP",
    variant: "C",
    name: "Pellicule",
    secondaryCount: 2,
    scene: {
      aspect: "3:2",
      frame: { x: 54, y: 148, w: 972, h: 524 },
      heroZone: { x: 12, y: 10, w: 76, h: 80 },
      calmZones: [],
    },
    slots: [
      { w: 297, h: 224 },
      { w: 297, h: 224 },
    ],
    textRoom: "standard",
    tone: "light",
    suits: ["chaussures", "mode", "accessoires", "electronique"],
    avoidUsage: false,
  },
  // ——— COLLAGE : composition éditoriale à 3 images ———
  {
    id: "COLLAGE.A",
    archetype: "COLLAGE",
    variant: "A",
    name: "Grille asymétrique",
    secondaryCount: 2,
    scene: {
      aspect: "2:3",
      frame: { x: 0, y: 0, w: 688, h: 1080 },
      heroZone: { x: 6, y: 12, w: 88, h: 54 },
      calmZones: [{ x: 0, y: 66, w: 100, h: 34 }],
    },
    slots: [
      { w: 376, h: 532 },
      { w: 376, h: 532 },
    ],
    textRoom: "standard",
    tone: "dark",
    suits: ["mode", "beaute", "food", "maison"],
    avoidUsage: false,
  },
  {
    id: "COLLAGE.B",
    archetype: "COLLAGE",
    variant: "B",
    name: "Bento",
    secondaryCount: 2,
    scene: {
      aspect: "1:1",
      frame: { x: 32, y: 32, w: 672, h: 672 },
      heroZone: { x: 8, y: 16, w: 84, h: 76 },
      calmZones: [],
    },
    slots: [
      { w: 328, h: 328 },
      { w: 328, h: 328 },
    ],
    textRoom: "standard",
    tone: "dark",
    suits: ["maison", "food", "beaute", "electronique"],
    avoidUsage: false,
  },
  {
    id: "COLLAGE.C",
    archetype: "COLLAGE",
    variant: "C",
    name: "Tirages",
    secondaryCount: 2,
    scene: {
      aspect: "1:1",
      frame: { x: 0, y: 0, w: 1080, h: 1080 },
      heroZone: { x: 5, y: 40, w: 90, h: 38 },
      calmZones: [
        { x: 0, y: 0, w: 64, h: 40 },
        { x: 0, y: 78, w: 100, h: 22 },
      ],
    },
    slots: [
      { w: 300, h: 236 },
      { w: 300, h: 236 },
    ],
    textRoom: "compact",
    tone: "dark",
    suits: ["auto", "mode", "food", "service"],
    avoidUsage: false,
  },
];

export const LAYOUTS: Record<LayoutId, LayoutSpec> = Object.fromEntries(L.map((s) => [s.id, s])) as Record<LayoutId, LayoutSpec>;
export const LAYOUT_IDS = L.map((s) => s.id);

const ASPECT_RATIO: Record<SceneAspect, number> = { "1:1": 1, "3:2": 1.5, "2:3": 2 / 3 };

/**
 * Convertit un rectangle exprimé en % du CADRE en % de l'image générée, sachant que le cadre est
 * un recadrage centré de l'image (couverture). Sert à écrire la fiche scène du prompt.
 */
export function frameRectToScene(rect: PctRect, spec: LayoutSpec): PctRect {
  const frameRatio = spec.scene.frame.w / spec.scene.frame.h;
  const sceneRatio = ASPECT_RATIO[spec.scene.aspect];
  // Part de l'image visible dans le cadre (en largeur et en hauteur).
  const visW = frameRatio >= sceneRatio ? 1 : frameRatio / sceneRatio;
  const visH = frameRatio >= sceneRatio ? sceneRatio / frameRatio : 1;
  const offX = (1 - visW) / 2;
  const offY = (1 - visH) / 2;
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    x: r((offX + (rect.x / 100) * visW) * 100),
    y: r((offY + (rect.y / 100) * visH) * 100),
    w: r(rect.w * visW),
    h: r(rect.h * visH),
  };
}
