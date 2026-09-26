import sharp from "sharp";

// Couleur d'accent de la vitrine : choisie par le commerçant (brand.accent) ou, à défaut, extraite
// de son logo. Toujours ramenée à une teinte assez foncée pour porter du texte blanc lisible.

export interface StorefrontTheme {
  accent: string; // boutons, prix, éléments actifs
  accentText: string; // texte posé sur l'accent
  accentSoft: string; // fonds légers (badges, encadrés)
}

export const DEFAULT_ACCENT = "#111827"; // quasi-noir : sobre et crédible quand rien n'est défini

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function contrastWithWhite(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return 1.05 / (lum + 0.05);
}

/** HSL → hex (#rrggbb) : format accepté partout (CSS, satori pour les visuels générés). */
function hsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function themeFromAccent(hex: string | null | undefined): StorefrontTheme {
  const parsed = hex ? hexToHsl(hex) : null;
  if (!parsed || parsed[1] < 0.18) {
    return { accent: DEFAULT_ACCENT, accentText: "#FFFFFF", accentSoft: "#F3F4F6" };
  }
  const [h, s] = parsed;
  const sat = Math.min(s, 0.85);
  // Luminosité plafonnée à 42 % : contraste suffisant avec du texte blanc, quelle que soit la couleur.
  let l = Math.min(Math.max(parsed[2], 0.28), 0.42);
  // Les teintes claires (jaune, vert clair…) restent peu contrastées à 42 % : on assombrit
  // jusqu'à un contraste d'au moins 4,5:1 avec le blanc (niveau WCAG AA).
  while (l > 0.15 && contrastWithWhite(hsl(h, sat, l)) < 4.5) l -= 0.02;
  return { accent: hsl(h, sat, l), accentText: "#FFFFFF", accentSoft: hsl(h, Math.min(sat, 0.6), 0.96) };
}

/** Couleur dominante « de marque » d'un logo : ignore la transparence, le blanc, le noir et le gris. */
export async function accentFromLogoUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(48, 48, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < info.width * info.height * 4; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max > 240 && min > 225) continue; // blanc
      if (max < 35) continue; // noir
      if (max - min < 40) continue; // gris
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
    const best = Array.from(buckets.values()).sort((a, b) => b.n - a.n)[0];
    if (!best || best.n < 8) return null;
    const hex = [best.r, best.g, best.b].map((v) => Math.round(v / best.n).toString(16).padStart(2, "0")).join("");
    return `#${hex}`;
  } catch {
    return null;
  }
}
