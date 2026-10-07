// Couleurs : contraste (WCAG), mélange, texte lisible sur une couleur. Utilisé par le renderer pour
// garantir la lisibilité (texte ≥ 4,5:1 sur son fond réel, voiles calculés sur la scène).

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(c: Rgb | string): number {
  const { r, g, b } = typeof c === "string" ? hexToRgb(c) : c;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mix(a: Rgb | string, b: Rgb | string, t: number): Rgb {
  const x = typeof a === "string" ? hexToRgb(a) : a;
  const y = typeof b === "string" ? hexToRgb(b) : b;
  return { r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t };
}

/** Texte lisible sur `bg` : `light` ou `dark` selon le meilleur contraste. */
export function readableOn(bg: string, light = "#FFFFFF", dark = "#111111"): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/**
 * Opacité minimale d'un voile `veil` posé sur un fond moyen `under` pour que `fg` atteigne le
 * contraste visé. Bornée entre `min` et `max`.
 */
export function veilAlphaFor(under: Rgb, veil: string, fg: string, target = 4.5, min = 0.35, max = 0.94): number {
  for (let a = min; a <= max + 1e-9; a += 0.03) {
    if (contrast(mix(under, veil, a), fg) >= target) return Math.min(max, a);
  }
  return max;
}

/**
 * Accent assez lisible sur un fond donné : éclairci / assombri progressivement si besoin
 * (garde la teinte, garantit ≥ 3:1 pour les grands textes et les boutons).
 */
export function accentOn(accent: string, bg: string, target = 3): string {
  if (contrast(accent, bg) >= target) return accent;
  const toward = luminance(bg) < 0.5 ? "#FFFFFF" : "#000000";
  for (let t = 0.1; t <= 0.9; t += 0.1) {
    const c = rgbToHex(mix(accent, toward, t));
    if (contrast(c, bg) >= target) return c;
  }
  return toward;
}
