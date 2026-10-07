import { LAYOUTS, LAYOUT_IDS, productFamily, type LayoutSpec } from "@/lib/poster-v2/layouts";
import type { LayoutId, SecondaryRole } from "@/lib/poster-v2/types";

// Règles d'éligibilité (validées le 2026-10-07) :
//  - 1 photo secondaire gardée → HERO_DETAIL ; 2 → DETAIL_STRIP, ou COLLAGE si les 3 photos sont bonnes ;
//  - 0 → aucune mise en page V2 : repli sur le pipeline 1 photo (V1) ;
//  - texte long → variantes « roomy » favorisées, « compact » pénalisées ;
//  - photo « en situation » (personne) → jamais dans une petite case ;
//  - rotation : on évite de répéter la mise en page des 2 dernières affiches du vendeur.
// Le directeur artistique choisit PARMI la liste renvoyée ; un choix hors liste est corrigé. La
// qualité prime : si le rendu d'une mise en page échoue (texte qui ne tient pas, photo trop petite),
// l'orchestrateur essaie la suivante, puis revient à la V1.

export const COLLAGE_MIN_QUALITY = 0.7;
export const LONG_TITLE_CHARS = 40;

export interface EligibilityInput {
  /** Qualité 0-1 de la photo principale. */
  heroQuality: number;
  /** Photos secondaires GARDÉES (déjà vérifiées), dans l'ordre d'utilité. */
  secondaries: { role: SecondaryRole; quality: number; hasPerson?: boolean }[];
  industry?: string | null;
  category?: string | null;
  title: string;
  benefitsCount: number;
  /** Mises en page des dernières affiches du vendeur (la plus récente d'abord). */
  recentLayouts?: LayoutId[];
}

export interface ScoredLayout {
  id: LayoutId;
  score: number;
  reasons: string[];
}

export function isLongText(title: string, benefitsCount: number): boolean {
  return title.trim().length > LONG_TITLE_CHARS || benefitsCount >= 3;
}

/** Mises en page autorisées, de la plus adaptée à la moins adaptée. Vide = repli V1. */
export function eligibleLayouts(input: EligibilityInput): ScoredLayout[] {
  const n = input.secondaries.length;
  if (n === 0) return [];
  const family = productFamily(input.industry, input.category);
  const longText = isLongText(input.title, input.benefitsCount);
  const allGood = input.heroQuality >= COLLAGE_MIN_QUALITY && input.secondaries.every((s) => s.quality >= COLLAGE_MIN_QUALITY);
  const hasUsagePerson = input.secondaries.some((s) => s.role === "usage" && s.hasPerson !== false);
  const recent = input.recentLayouts ?? [];

  const out: ScoredLayout[] = [];
  for (const id of LAYOUT_IDS) {
    const spec: LayoutSpec = LAYOUTS[id];
    const reasons: string[] = [];
    if (n === 1 && spec.archetype !== "HERO_DETAIL") continue;
    if (n >= 2 && spec.archetype === "HERO_DETAIL") continue;
    if (spec.archetype === "COLLAGE" && !allGood) continue;
    if (hasUsagePerson && spec.avoidUsage) continue;

    let score = 50;
    if (spec.suits.includes(family)) {
      score += 15;
      reasons.push(`adaptée à « ${family} »`);
    }
    if (longText) {
      if (spec.textRoom === "roomy") (score += 20), reasons.push("texte long : place suffisante");
      if (spec.textRoom === "compact") (score -= 25), reasons.push("texte long : peu de place");
    }
    // Détail fort → loupe / encart ; angle → bande ou collage.
    const roles = input.secondaries.map((s) => s.role);
    if (spec.id === "HERO_DETAIL.A" && roles[0] === "detail") score += 8;
    if (spec.id === "HERO_DETAIL.C" && (roles[0] === "texture" || roles[0] === "detail")) score += 5;
    if (spec.archetype === "COLLAGE" && roles.includes("usage")) score += 8;
    // Rotation.
    const idx = recent.indexOf(id);
    if (idx === 0) (score -= 30), reasons.push("utilisée pour la dernière affiche");
    else if (idx === 1) (score -= 15), reasons.push("utilisée récemment");
    out.push({ id, score, reasons });
  }
  // Même mise en page pour les 2 dernières affiches : on l'exclut tant qu'il reste un autre choix.
  if (recent.length >= 2 && recent[0] === recent[1] && out.length > 1) {
    const filtered = out.filter((s) => s.id !== recent[0]);
    if (filtered.length) return filtered.sort((a, b) => b.score - a.score);
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Ordre d'essai final : le choix du directeur artistique d'abord s'il est autorisé, puis les autres
 * par score. Un choix hors liste est ignoré (corrigé par le code).
 */
export function layoutTryOrder(eligible: ScoredLayout[], directorChoice?: LayoutId | null): LayoutId[] {
  const ids = eligible.map((e) => e.id);
  if (directorChoice && ids.includes(directorChoice)) return [directorChoice, ...ids.filter((i) => i !== directorChoice)];
  return ids;
}
