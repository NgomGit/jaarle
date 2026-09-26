import type { PlatformSpec } from "@/lib/studio/platforms";
import type { StudioFacts } from "@/lib/studio/facts";
import type { PostVariant } from "@/lib/studio/types";

// Garde-fous appliqués APRÈS la génération : l'IA ne doit pas inventer d'informations commerciales.
// 1) Tout montant (FCFA, F, %) absent des faits fait retirer la phrase qui le contient.
// 2) Hashtags normalisés (#mot, sans espace ni doublon) et plafonnés par plateforme.
// 3) Longueurs plafonnées.

const AMOUNT_RE = /(\d[\d\s.,  ]*)\s*(?:fcfa|f\s?cfa|cfa|francs?|f\b|xof|%)/gi;

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Montants autorisés : le prix du produit + tout nombre présent dans l'offre ou les précisions. */
function allowedNumbers(f: StudioFacts): Set<string> {
  const allowed = new Set<string>();
  if (f.hasPrice) allowed.add(digits(f.priceLabel));
  for (const text of [f.promoDetail, f.extraFacts, f.description]) {
    for (const m of (text ?? "").matchAll(/\d[\d\s.,  ]*/g)) allowed.add(digits(m[0]));
  }
  allowed.delete("");
  return allowed;
}

export function removeInventedAmounts(text: string, f: StudioFacts): string {
  const allowed = allowedNumbers(f);
  const sentences = text.split(/(?<=[.!?…])\s+|\n/);
  const kept = sentences.filter((sentence) => {
    for (const m of sentence.matchAll(AMOUNT_RE)) {
      if (!allowed.has(digits(m[1]))) return false;
    }
    return true;
  });
  // Recompose en conservant les retours à la ligne d'origine autant que possible.
  if (kept.length === sentences.length) return text;
  return kept.join(" ").replace(/[ \t]+\n/g, "\n").trim();
}

export function normalizeHashtags(tags: string[], spec: PlatformSpec): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const cleaned = raw
      .normalize("NFC")
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${cleaned}`);
  }
  return out.slice(0, spec.hashtags[1]);
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function sanitizeVariant(v: PostVariant, spec: PlatformSpec, f: StudioFacts): PostVariant {
  const caption = removeInventedAmounts(v.caption.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "").trim(), f);
  return {
    caption: clip(caption, spec.captionMax),
    hashtags: normalizeHashtags(v.hashtags, spec),
    cta: clip(removeInventedAmounts(v.cta, f), 60),
    headline: clip(removeInventedAmounts(v.headline, f), 48),
    subline: clip(removeInventedAmounts(v.subline, f), 80),
  };
}
