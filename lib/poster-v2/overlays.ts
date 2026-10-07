import { LAYOUTS, type Box, type LayoutSpec } from "@/lib/poster-v2/layouts";
import { coverRect } from "@/lib/poster-v2/photos";
import type { LayoutId, PctRect } from "@/lib/poster-v2/types";

// Ce que le renderer pose PAR-DESSUS la scène, pour chaque mise en page (px, base 1080).
// Sert à vérifier, une fois la scène générée, qu'aucune vraie photo, aucun texte ni le logo ne
// recouvre le produit principal (cas vu au test BMW : l'Encart débordant sur la calandre).
// Seules les boîtes qui chevauchent le cadre de la scène comptent ; ce qui est posé sur un panneau
// uni hors scène n'est pas listé.
// Les zones de texte sont l'enveloppe du cas le plus haut (titre sur 2 lignes + surtitre).
// ⚠ À garder en phase avec render/variants.tsx (un test vérifie que chaque boîte touche la scène).

export type OverKind = "photo" | "text" | "logo";
export interface OverBox extends Box {
  kind: OverKind;
}

const M = 54;
/** Logo : au plus 200 × 64 (logoDataUri), un peu de marge autour. */
const logoAt = (x: number, y: number): OverBox => ({ kind: "logo", x: x - 6, y: y - 6, w: 212, h: 76 });

export const OVER_SCENE: Record<LayoutId, OverBox[]> = {
  "HERO_DETAIL.A": [
    logoAt(M, M),
    { kind: "photo", x: 714, y: 54, w: 312, h: 312 }, // loupe
    { kind: "text", x: 714, y: 378, w: 312, h: 48 }, // légende
    { kind: "text", x: M, y: 790, w: 972, h: 236 }, // titre (2 lignes), points forts, prix, téléphone
  ],
  "HERO_DETAIL.B": [
    logoAt(826, 48),
    { kind: "photo", x: 748, y: 504, w: 296, h: 368 }, // encart débordant (+ bordure, ombre)
  ],
  "HERO_DETAIL.C": [logoAt(48, 48)],
  "DETAIL_STRIP.A": [
    logoAt(M, 44),
    { kind: "text", x: M, y: 520, w: 972, h: 144 }, // titre (2 lignes) + surtitre en bas de la scène
  ],
  "DETAIL_STRIP.B": [
    logoAt(M, 48),
    { kind: "photo", x: 760, y: 0, w: 320, h: 1080 }, // rail vitré
    { kind: "text", x: M, y: 760, w: 660, h: 266 }, // surtitre, titre, prix, téléphone
  ],
  "DETAIL_STRIP.C": [],
  "COLLAGE.A": [
    logoAt(44, 40),
    { kind: "text", x: 48, y: 770, w: 600, h: 258 },
  ],
  "COLLAGE.B": [logoAt(60, 56)],
  "COLLAGE.C": [
    { kind: "photo", x: 46, y: 54, w: 640, h: 366 }, // 2 tirages inclinés (enveloppe)
    logoAt(826, 48),
    { kind: "text", x: M, y: 850, w: 972, h: 176 },
  ],
};

/** Centre du recadrage de la scène dans son cadre (même valeur que le renderer). */
export function sceneFocus(spec: LayoutSpec): { x: number; y: number } {
  const hz = spec.scene.heroZone;
  return { x: hz.x + hz.w / 2, y: hz.y + hz.h / 2 };
}

/** Seuils (à calibrer au benchmark). */
export const FIT_LIMITS = {
  /** Part du produit qui doit rester visible dans le cadre (le recadrage ne doit pas le couper). */
  minVisible: 0.96,
  /** Part maximale du produit recouverte par une vraie photo ou du texte. */
  maxCoveredByContent: 0.05,
  /** Part maximale du produit recouverte par le logo. */
  maxCoveredByLogo: 0.04,
};

export interface FitReport {
  layout: LayoutId;
  ok: boolean;
  /** Part du produit visible dans le cadre (0-1). */
  visible: number;
  /** Part du produit recouverte par photo / texte, et par le logo (0-1). */
  coveredByContent: number;
  coveredByLogo: number;
  /** Produit, en px de l'affiche (base 1080), après recadrage. */
  heroOnPoster: Box;
  reasons: string[];
}

function inter(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Le produit (boîte en % de la scène, mesurée par le contrôle de scène) reste-t-il entier et
 * dégagé dans cette mise en page ? Calcul pur.
 */
export function evaluateFit(layout: LayoutId, hero: PctRect, sceneW: number, sceneH: number): FitReport {
  const spec = LAYOUTS[layout];
  const frame = spec.scene.frame;
  const crop = coverRect(sceneW, sceneH, frame.w, frame.h, sceneFocus(spec));
  const heroPx: Box = { x: (hero.x / 100) * sceneW, y: (hero.y / 100) * sceneH, w: (hero.w / 100) * sceneW, h: (hero.h / 100) * sceneH };
  const area = Math.max(1, heroPx.w * heroPx.h);
  const visible = inter(heroPx, { x: crop.left, y: crop.top, w: crop.width, h: crop.height }) / area;

  const scale = frame.w / crop.width;
  const onPoster: Box = {
    x: frame.x + (heroPx.x - crop.left) * scale,
    y: frame.y + (heroPx.y - crop.top) * scale,
    w: heroPx.w * scale,
    h: heroPx.h * scale,
  };
  // Seule la partie du produit visible dans le cadre peut être recouverte.
  const clipped: Box = (() => {
    const x0 = Math.max(onPoster.x, frame.x);
    const y0 = Math.max(onPoster.y, frame.y);
    const x1 = Math.min(onPoster.x + onPoster.w, frame.x + frame.w);
    const y1 = Math.min(onPoster.y + onPoster.h, frame.y + frame.h);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  })();
  const posterArea = Math.max(1, onPoster.w * onPoster.h);
  let content = 0;
  let logo = 0;
  for (const o of OVER_SCENE[layout]) {
    const a = inter(clipped, o) / posterArea;
    if (o.kind === "logo") logo += a;
    else content += a;
  }
  content = Math.min(1, content);
  logo = Math.min(1, logo);

  const reasons: string[] = [];
  if (visible < FIT_LIMITS.minVisible) reasons.push(`produit coupé par le cadre (${Math.round(visible * 100)} % visible)`);
  if (content > FIT_LIMITS.maxCoveredByContent) reasons.push(`produit recouvert à ${Math.round(content * 100)} % par une photo ou du texte`);
  if (logo > FIT_LIMITS.maxCoveredByLogo) reasons.push(`produit recouvert à ${Math.round(logo * 100)} % par le logo`);
  const r1 = (v: number) => Math.round(v * 1000) / 1000;
  const rb = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
  return { layout, ok: reasons.length === 0, visible: r1(visible), coveredByContent: r1(content), coveredByLogo: r1(logo), heroOnPoster: rb(onPoster), reasons };
}
