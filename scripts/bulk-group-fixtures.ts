// Bulk Upload — phase 0 : génère des lots SYNTHÉTIQUES de référence (dessins SVG rendus en JPEG),
// avec leur vérité terrain (truth.json). Aucune photo réelle, aucune donnée de vendeur.
//
//   npx vite-node --config vitest.config.ts scripts/bulk-group-fixtures.ts [-- --out tmp/bulk-group-lots]
//
// Ces lots servent à vérifier le banc (indices, mesures, coûts, durée) et à repérer les erreurs
// grossières du modèle. Ils sont plus simples que de vraies photos (fonds unis, articles dessinés,
// « angles » simulés par recadrage/rotation) : ils NE suffisent PAS à valider la phase 1.
// Si ffmpeg est installé, le lot « synth-mix-30 » contient aussi une vidéo.

import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SIZE = 900;

// ─── Hasard reproductible ───────────────────────────────────────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Fonds ──────────────────────────────────────────────────────────────────────────────────────
type Bg = "white" | "wood" | "grey" | "tiles" | "fabric";
function background(bg: Bg): string {
  switch (bg) {
    case "white":
      return `<rect width="${SIZE}" height="${SIZE}" fill="#f6f5f1"/>`;
    case "grey":
      return `<defs><radialGradient id="bgg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#e9e9e9"/><stop offset="1" stop-color="#9c9c9c"/></radialGradient></defs><rect width="${SIZE}" height="${SIZE}" fill="url(#bgg)"/>`;
    case "wood":
      return `<rect width="${SIZE}" height="${SIZE}" fill="#c89f6d"/>${Array.from({ length: 9 }, (_, i) => `<rect y="${i * 100}" width="${SIZE}" height="6" fill="#a97f4f" opacity=".6"/><path d="M0 ${i * 100 + 50} Q450 ${i * 100 + 30} 900 ${i * 100 + 55}" stroke="#b58b5a" stroke-width="3" fill="none"/>`).join("")}`;
    case "tiles":
      return `<rect width="${SIZE}" height="${SIZE}" fill="#ece6da"/>${Array.from({ length: 36 }, (_, i) => ((Math.floor(i / 6) + i) % 2 ? `<rect x="${(i % 6) * 150}" y="${Math.floor(i / 6) * 150}" width="150" height="150" fill="#d9d1c2"/>` : "")).join("")}`;
    case "fabric":
      return `<defs><pattern id="fab" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#dfe6ec"/><circle cx="20" cy="20" r="4" fill="#c4d0da"/></pattern></defs><rect width="${SIZE}" height="${SIZE}" fill="url(#fab)"/>`;
  }
}

const shadow = `<defs><filter id="sh"><feGaussianBlur stdDeviation="18"/></filter></defs><ellipse cx="450" cy="790" rx="260" ry="34" fill="#000" opacity=".18" filter="url(#sh)"/>`;

// ─── Articles dessinés ──────────────────────────────────────────────────────────────────────────
type Draw = (opts: { back?: boolean }) => string;

const tshirt =
  (body: string, neck: "round" | "v", print?: { kind: "circle" | "stripe" | "text"; color: string; text?: string }): Draw =>
  ({ back }) => {
    const shape = `M300,200 L380,170 Q450,${back ? 195 : 215} 520,170 L600,200 L700,300 L640,350 L600,320 L600,720 L300,720 L300,320 L260,350 L200,300 Z`;
    const neckLine = back
      ? `<path d="M380,170 Q450,195 520,170" stroke="#000" stroke-opacity=".35" stroke-width="10" fill="none"/>`
      : neck === "round"
        ? `<path d="M380,170 Q450,240 520,170" stroke="#000" stroke-opacity=".35" stroke-width="12" fill="none"/>`
        : `<path d="M380,170 L450,260 L520,170" stroke="#000" stroke-opacity=".35" stroke-width="12" fill="none"/>`;
    let pr = "";
    if (print && !back) {
      if (print.kind === "circle") pr = `<circle cx="520" cy="300" r="26" fill="${print.color}"/>`;
      if (print.kind === "stripe") pr = `<rect x="300" y="420" width="300" height="46" fill="${print.color}"/>`;
      if (print.kind === "text") pr = `<text x="450" y="440" font-family="Arial, sans-serif" font-weight="700" font-size="64" text-anchor="middle" fill="${print.color}">${print.text}</text>`;
    }
    return `<path d="${shape}" fill="${body}" stroke="#000" stroke-opacity=".25" stroke-width="3"/>${neckLine}${pr}<path d="M300,320 L300,720" stroke="#000" stroke-opacity=".12" stroke-width="6"/>`;
  };

function patternDef(id: string, kind: "dots" | "stripes" | "wax", bg: string, fg: string): string {
  if (kind === "dots") return `<pattern id="${id}" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="${bg}"/><circle cx="25" cy="25" r="9" fill="${fg}"/></pattern>`;
  if (kind === "stripes") return `<pattern id="${id}" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="${bg}"/><rect width="60" height="20" fill="${fg}"/></pattern>`;
  return `<pattern id="${id}" width="110" height="110" patternUnits="userSpaceOnUse"><rect width="110" height="110" fill="${bg}"/><circle cx="55" cy="55" r="40" fill="none" stroke="${fg}" stroke-width="10"/><circle cx="55" cy="55" r="18" fill="${fg}"/><path d="M0 0 L20 0 L0 20Z M110 110 L90 110 L110 90Z" fill="${fg}"/></pattern>`;
}

const dress =
  (bg: string, fg: string, kind: "dots" | "stripes" | "wax"): Draw =>
  () => {
    const id = `p${bg.slice(1)}${fg.slice(1)}${kind}`;
    const shape = "M380,170 L520,170 L545,300 L650,760 L250,760 L355,300 Z";
    return `<defs>${patternDef(id, kind, bg, fg)}</defs><path d="M390,170 L380,110 M510,170 L520,110" stroke="${bg}" stroke-width="14"/><path d="${shape}" fill="url(#${id})" stroke="#000" stroke-opacity=".25" stroke-width="3"/><path d="M355,300 L545,300" stroke="#000" stroke-opacity=".25" stroke-width="8"/>`;
  };

const boubou =
  (color: string, embroidery: string): Draw =>
  () =>
    `<path d="M250,180 L650,180 L770,760 L130,760 Z" fill="${color}" stroke="#000" stroke-opacity=".2" stroke-width="3"/><ellipse cx="450" cy="200" rx="60" ry="26" fill="#000" opacity=".3"/><path d="M380,215 Q450,420 520,215" fill="none" stroke="${embroidery}" stroke-width="14"/><path d="M400,230 Q450,380 500,230" fill="none" stroke="${embroidery}" stroke-width="6"/>${[0, 1, 2, 3].map((i) => `<circle cx="450" cy="${300 + i * 40}" r="7" fill="${embroidery}"/>`).join("")}`;

const sneaker =
  (upper: string, sole: string, accent: string, laces = "#ffffff"): Draw =>
  () =>
    `<path d="M200,560 Q215,430 360,420 L470,390 Q570,380 625,460 L725,500 Q770,520 755,570 L200,570 Z" fill="${upper}" stroke="#000" stroke-opacity=".3" stroke-width="3"/><rect x="185" y="568" width="585" height="48" rx="22" fill="${sole}" stroke="#000" stroke-opacity=".25" stroke-width="3"/><path d="M330,520 Q470,450 640,520" stroke="${accent}" stroke-width="22" fill="none"/>${[0, 1, 2, 3].map((i) => `<line x1="${400 + i * 35}" y1="${425 - i * 6}" x2="${420 + i * 35}" y2="${455 - i * 6}" stroke="${laces}" stroke-width="7"/>`).join("")}`;

const bottle =
  (glass: string, cap: string, label: string, text: string): Draw =>
  () =>
    `<rect x="415" y="200" width="70" height="60" rx="8" fill="${cap}"/><rect x="428" y="255" width="44" height="80" fill="${glass}" opacity=".9"/><rect x="370" y="320" width="160" height="430" rx="34" fill="${glass}" stroke="#000" stroke-opacity=".25" stroke-width="3"/><rect x="370" y="470" width="160" height="150" fill="${label}"/><text x="450" y="535" font-family="Georgia, serif" font-size="24" text-anchor="middle" fill="#222">${text.split(" ")[0]}</text><text x="450" y="570" font-family="Georgia, serif" font-size="22" text-anchor="middle" fill="#222">${text.split(" ").slice(1).join(" ")}</text><rect x="388" y="340" width="18" height="380" rx="9" fill="#fff" opacity=".25"/>`;

const bag =
  (color: string, strap: string, buckle: string): Draw =>
  () =>
    `<path d="M320,390 Q450,170 580,390" stroke="${strap}" stroke-width="22" fill="none"/><rect x="240" y="380" width="420" height="330" rx="40" fill="${color}" stroke="#000" stroke-opacity=".3" stroke-width="3"/><path d="M240,420 L660,420 L630,540 L270,540 Z" fill="#000" opacity=".18"/><rect x="425" y="515" width="50" height="40" rx="6" fill="${buckle}"/>`;

const bracelet =
  (color: string, thickness: number, stones?: string): Draw =>
  () =>
    `<ellipse cx="450" cy="470" rx="230" ry="150" fill="none" stroke="${color}" stroke-width="${thickness}"/><ellipse cx="450" cy="460" rx="230" ry="150" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="${Math.max(2, thickness / 6)}"/>${stones ? [0, 1, 2, 3, 4].map((i) => `<circle cx="${300 + i * 75}" cy="${335 + Math.abs(2 - i) * 18}" r="${thickness / 2.4}" fill="${stones}" stroke="#fff" stroke-width="2"/>`).join("") : ""}`;

const plate =
  (rice: string, veg: string[]): Draw =>
  () =>
    `<circle cx="450" cy="460" r="300" fill="#fbfbfb" stroke="#cfcfcf" stroke-width="8"/><circle cx="450" cy="460" r="230" fill="#f1f1f1"/><ellipse cx="450" cy="470" rx="200" ry="170" fill="${rice}"/><path d="M360,430 Q450,360 560,430 Q450,500 360,430 Z" fill="#8a6a4a"/>${veg.map((c, i) => `<circle cx="${350 + i * 70}" cy="${540 + (i % 2) * 20}" r="34" fill="${c}" stroke="#000" stroke-opacity=".15"/>`).join("")}`;

const phonecase =
  (color: string, motif?: { kind: "dots" | "stripes"; color: string }): Draw =>
  () => {
    const id = motif ? `pc${color.slice(1)}${motif.color.slice(1)}` : "";
    return `${motif ? `<defs>${patternDef(id, motif.kind, color, motif.color)}</defs>` : ""}<rect x="330" y="170" width="240" height="560" rx="52" fill="${motif ? `url(#${id})` : color}" stroke="#000" stroke-opacity=".35" stroke-width="4"/><rect x="355" y="200" width="100" height="100" rx="24" fill="#222"/><circle cx="385" cy="230" r="16" fill="#555"/><circle cx="425" cy="270" r="16" fill="#555"/>`;
  };

// ─── Prises de vue ──────────────────────────────────────────────────────────────────────────────
type View = "front" | "tilt" | "zoom" | "far" | "back" | "blur" | "dark" | "texture" | "nearDup";

interface Shot {
  article: string;
  view: View;
  bg?: Bg;
  /** Point de zoom (coordonnées du dessin). */
  focus?: [number, number];
  /** Fichier exactement identique à la prise précédente du même article. */
  exactCopy?: boolean;
}

async function render(draw: Draw, shot: Shot, seed: number): Promise<Buffer> {
  const r = rng(seed);
  const bg = shot.bg ?? "white";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${background(bg)}${shadow}<g>${draw({ back: shot.view === "back" })}</g><rect width="${SIZE}" height="${SIZE}" fill="url(#vig)"/><defs><radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient></defs></svg>`;
  let img = sharp(Buffer.from(svg)).png();
  let buf = await img.toBuffer();
  const bgColor = { r: 240, g: 238, b: 232 };
  switch (shot.view) {
    case "tilt": {
      const angle = (r() > 0.5 ? 1 : -1) * (8 + r() * 8);
      buf = await sharp(buf).rotate(angle, { background: bgColor }).resize(SIZE, SIZE, { fit: "cover" }).toBuffer();
      break;
    }
    case "zoom":
    case "texture": {
      const [fx, fy] = shot.focus ?? [450, 450];
      const w = shot.view === "texture" ? 170 : 380;
      const left = Math.max(0, Math.min(SIZE - w, Math.round(fx - w / 2)));
      const top = Math.max(0, Math.min(SIZE - w, Math.round(fy - w / 2)));
      buf = await sharp(buf).extract({ left, top, width: w, height: w }).resize(SIZE, SIZE).toBuffer();
      break;
    }
    case "far": {
      const small = await sharp(buf).resize(520, 520).toBuffer();
      buf = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: { r: 214, g: 205, b: 190 } } })
        .composite([{ input: small, left: Math.round(80 + r() * 260), top: Math.round(80 + r() * 260) }])
        .png()
        .toBuffer();
      break;
    }
    case "blur":
      buf = await sharp(buf).blur(16).toBuffer();
      break;
    case "dark":
      buf = await sharp(buf).modulate({ brightness: 0.32 }).toBuffer();
      break;
    case "nearDup": {
      const c = 24;
      buf = await sharp(buf).extract({ left: c, top: c, width: SIZE - 2 * c, height: SIZE - 2 * c }).resize(SIZE, SIZE).modulate({ brightness: 1.04 }).toBuffer();
      break;
    }
    default:
      break;
  }
  img = sharp(buf);
  return img.jpeg({ quality: shot.view === "nearDup" ? 62 : 86 }).toBuffer();
}

// ─── Catalogue d'articles ───────────────────────────────────────────────────────────────────────
const A: Record<string, Draw> = {
  "tee-orange-dakar": tshirt("#e8751a", "round", { kind: "text", color: "#ffffff", text: "DAKAR" }),
  "tee-noir-uni": tshirt("#1d1d1f", "round"),
  "tee-noir-v-point": tshirt("#1b1b1d", "v", { kind: "circle", color: "#f2f2f2" }),
  "tee-blanc-bande": tshirt("#f4f4f4", "round", { kind: "stripe", color: "#1f4fa3" }),
  "robe-wax-verte": dress("#1f8a4c", "#f2c230", "wax"),
  "robe-wax-rouge": dress("#c62828", "#f2c230", "wax"),
  "robe-wax-bleue": dress("#1e4fa8", "#f2c230", "wax"),
  "robe-pois-jaune": dress("#f4c430", "#ffffff", "dots"),
  "boubou-blanc": boubou("#f3f1ea", "#c9a227"),
  "boubou-indigo": boubou("#2b3a8c", "#c9a227"),
  "sac-marron": bag("#7b4a26", "#5a361b", "#d4af37"),
  "sac-noir": bag("#222222", "#111111", "#c0c0c0"),
  "basket-blanche-rouge": sneaker("#f5f5f5", "#ffffff", "#d32f2f"),
  "basket-blanche-semelle-gomme": sneaker("#f5f5f5", "#b5763a", "#d32f2f"),
  "basket-noire": sneaker("#202020", "#f0f0f0", "#808080"),
  "huile-coco": bottle("#c27c1a", "#2b2b2b", "#f4ead0", "Huile de coco"),
  "huile-argan": bottle("#c47d1c", "#2b2b2b", "#f4ead0", "Huile d'argan"),
  "parfum-rose": bottle("#e9a3b8", "#c9a227", "#ffffff", "Eau rose"),
  "bracelet-or-fin": bracelet("#d4af37", 14),
  "bracelet-or-pierres": bracelet("#d4af37", 30, "#2e7d32"),
  "thieb-poisson": plate("#d9862e", ["#f08a24", "#6aa84f", "#e6d7b0", "#8e44ad"]),
  "yassa-poulet": plate("#f4f1e6", ["#f2d16b", "#f2d16b", "#7f5a2e"]),
  "coque-noire": phonecase("#1c1c1e"),
  "coque-marine": phonecase("#1d2433"),
  "coque-rose-pois": phonecase("#f3b6c8", { kind: "dots", color: "#ffffff" }),
};

const FOCUS: Record<string, [number, number]> = {
  "tee-orange-dakar": [450, 420],
  "tee-noir-v-point": [500, 290],
  "tee-blanc-bande": [450, 440],
  "robe-wax-verte": [450, 520],
  "robe-wax-rouge": [450, 520],
  "robe-wax-bleue": [450, 520],
  "robe-pois-jaune": [450, 520],
  "boubou-blanc": [450, 300],
  "boubou-indigo": [450, 300],
  "sac-marron": [450, 520],
  "sac-noir": [450, 520],
  "basket-blanche-rouge": [470, 520],
  "basket-blanche-semelle-gomme": [470, 580],
  "basket-noire": [470, 520],
  "huile-coco": [450, 545],
  "huile-argan": [450, 545],
  "parfum-rose": [450, 545],
  "bracelet-or-fin": [450, 330],
  "bracelet-or-pierres": [450, 340],
  "thieb-poisson": [450, 480],
  "yassa-poulet": [450, 480],
  "coque-noire": [400, 250],
  "coque-marine": [400, 250],
  "coque-rose-pois": [450, 450],
};

interface LotSpec {
  lot: string;
  description: string;
  cases: string[];
  shots: Shot[];
  ambiguousShots?: number[]; // indices dans shots
  variants?: [string, string][];
  video?: { article: string; views: View[] };
}

const s = (article: string, view: View, bg?: Bg, extra: Partial<Shot> = {}): Shot => ({ article, view, bg, focus: FOCUS[article], ...extra });

const LOTS: LotSpec[] = [
  {
    lot: "synth-angles",
    description: "4 articles, 3 à 4 vues chacun (de face, de près, incliné, de loin, dos).",
    cases: ["angles"],
    shots: [
      s("tee-orange-dakar", "front"), s("tee-orange-dakar", "zoom", "white"), s("tee-orange-dakar", "back", "wood"), s("tee-orange-dakar", "tilt", "grey"),
      s("robe-wax-verte", "front", "grey"), s("robe-wax-verte", "far"), s("robe-wax-verte", "zoom", "grey"),
      s("sac-marron", "front", "wood"), s("sac-marron", "tilt", "white"), s("sac-marron", "zoom", "wood"),
      s("basket-blanche-rouge", "front", "tiles"), s("basket-blanche-rouge", "far"), s("basket-blanche-rouge", "zoom", "tiles"), s("basket-blanche-rouge", "tilt", "white"),
    ],
  },
  {
    lot: "synth-similaires",
    description: "Paires d'articles différents qui se ressemblent (t-shirts noirs, bracelets dorés, baskets blanches, flacons ambrés).",
    cases: ["similaires"],
    shots: [
      s("tee-noir-uni", "front"), s("tee-noir-uni", "tilt", "wood"), s("tee-noir-uni", "back", "white"),
      s("tee-noir-v-point", "front"), s("tee-noir-v-point", "zoom"), s("tee-noir-v-point", "back", "white"),
      s("bracelet-or-fin", "front", "fabric"), s("bracelet-or-fin", "tilt", "white"),
      s("bracelet-or-pierres", "front", "fabric"), s("bracelet-or-pierres", "zoom", "fabric"),
      s("basket-blanche-rouge", "front", "tiles"), s("basket-blanche-rouge", "tilt", "tiles"),
      s("basket-blanche-semelle-gomme", "front", "tiles"), s("basket-blanche-semelle-gomme", "zoom", "tiles"),
      s("huile-coco", "front", "white"), s("huile-coco", "zoom", "white"),
      s("huile-argan", "front", "white"), s("huile-argan", "zoom", "white"),
    ],
    // Dos d'un t-shirt noir uni : impossible de savoir lequel des deux.
    ambiguousShots: [2, 5],
  },
  {
    lot: "synth-couleurs",
    description: "Même modèle en plusieurs couleurs : robe wax (rouge, bleue, verte), boubou (blanc, indigo).",
    cases: ["couleurs"],
    shots: [
      s("robe-wax-rouge", "front"), s("robe-wax-rouge", "zoom"),
      s("robe-wax-bleue", "front"), s("robe-wax-bleue", "tilt", "grey"),
      s("robe-wax-verte", "front"), s("robe-wax-verte", "far"),
      s("boubou-blanc", "front", "wood"), s("boubou-blanc", "zoom", "wood"),
      s("boubou-indigo", "front", "wood"), s("boubou-indigo", "zoom", "wood"),
    ],
    variants: [["robe-wax-rouge", "robe-wax-bleue"], ["robe-wax-rouge", "robe-wax-verte"], ["robe-wax-bleue", "robe-wax-verte"], ["boubou-blanc", "boubou-indigo"]],
  },
  {
    lot: "synth-doublons",
    description: "Doublons exacts et quasi identiques (rafale, recompression), plus un piège : même coque en noir et en bleu marine.",
    cases: ["doublons", "couleurs"],
    shots: [
      s("sac-noir", "front", "white"), s("sac-noir", "front", "white", { exactCopy: true }), s("sac-noir", "tilt", "wood"),
      s("parfum-rose", "front", "fabric"), s("parfum-rose", "nearDup", "fabric"),
      s("basket-noire", "front", "tiles"), s("basket-noire", "nearDup", "tiles"), s("basket-noire", "zoom", "tiles"),
      s("coque-noire", "front", "white"), s("coque-noire", "zoom", "white"),
      s("coque-marine", "front", "white"), s("coque-marine", "zoom", "white"),
    ],
    variants: [["coque-noire", "coque-marine"]],
  },
  {
    lot: "synth-flou",
    description: "Photos floues, sombres ou trop serrées (texture seule) au milieu de photos nettes.",
    cases: ["flou"],
    shots: [
      s("tee-blanc-bande", "front"), s("tee-blanc-bande", "blur"), s("tee-blanc-bande", "texture"),
      s("robe-pois-jaune", "front", "grey"), s("robe-pois-jaune", "dark", "grey"),
      s("huile-coco", "front"), s("huile-coco", "blur"),
      s("huile-argan", "front"), s("huile-argan", "texture"),
      s("coque-rose-pois", "front", "wood"), s("coque-rose-pois", "dark", "wood"), s("coque-rose-pois", "texture", "wood"),
    ],
    // Flou d'un flacon ambré (coco ou argan ?), textures serrées, coque très sombre.
    ambiguousShots: [2, 6, 8, 10, 11],
  },
  {
    lot: "synth-multicategories",
    description: "Articles de 8 catégories (mode, chaussures, beauté, maroquinerie, bijoux, restauration, accessoires téléphone).",
    cases: ["multi-categories"],
    shots: [
      s("boubou-indigo", "front", "wood"), s("boubou-indigo", "zoom", "wood"),
      s("basket-noire", "front", "tiles"), s("basket-noire", "tilt", "white"),
      s("parfum-rose", "front"), s("parfum-rose", "zoom"),
      s("sac-marron", "front", "wood"), s("sac-marron", "far"),
      s("bracelet-or-pierres", "front", "fabric"), s("bracelet-or-pierres", "tilt", "fabric"),
      s("thieb-poisson", "front", "wood"), s("thieb-poisson", "zoom", "wood"),
      s("yassa-poulet", "front", "wood"), s("yassa-poulet", "tilt", "wood"),
      s("coque-rose-pois", "front"), s("coque-rose-pois", "tilt", "grey"),
      s("robe-pois-jaune", "front", "grey"), s("robe-pois-jaune", "zoom", "grey"),
    ],
  },
  {
    lot: "synth-mix-30",
    description: "Lot réaliste de 30 photos, 12 articles, tous les cas mélangés, ordre partiellement désordonné (+ 1 vidéo si ffmpeg).",
    cases: ["mix", "angles", "similaires", "couleurs", "doublons", "flou", "multi-categories"],
    shots: [
      s("tee-noir-uni", "front"), s("tee-noir-uni", "tilt", "wood"),
      s("tee-noir-v-point", "front"), s("tee-noir-v-point", "zoom"),
      s("robe-wax-rouge", "front", "grey"), s("robe-wax-rouge", "zoom", "grey"),
      s("robe-wax-bleue", "front", "grey"),
      s("huile-coco", "front"), s("huile-argan", "front"), s("huile-coco", "zoom"), s("huile-argan", "blur"),
      s("sac-marron", "front", "wood"), s("sac-marron", "front", "wood", { exactCopy: true }), s("sac-marron", "tilt"),
      s("bracelet-or-fin", "front", "fabric"), s("bracelet-or-pierres", "front", "fabric"), s("bracelet-or-pierres", "zoom", "fabric"),
      s("thieb-poisson", "front", "wood"), s("thieb-poisson", "nearDup", "wood"),
      s("basket-blanche-rouge", "front", "tiles"), s("basket-blanche-semelle-gomme", "front", "tiles"), s("basket-blanche-rouge", "zoom", "tiles"), s("basket-blanche-semelle-gomme", "zoom", "tiles"),
      s("robe-wax-bleue", "zoom", "grey"), s("tee-noir-uni", "back"),
      s("coque-noire", "front"), s("coque-marine", "front"), s("coque-noire", "tilt", "wood"),
      s("robe-wax-rouge", "tilt", "white"), s("thieb-poisson", "tilt", "wood"),
    ],
    ambiguousShots: [10, 24],
    variants: [["robe-wax-rouge", "robe-wax-bleue"], ["coque-noire", "coque-marine"]],
    video: { article: "boubou-blanc", views: ["front", "zoom", "tilt"] },
  },
];

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const argv = process.argv.slice(2).filter((x) => x !== "--");
  const outIdx = argv.indexOf("--out");
  const outRoot = outIdx >= 0 ? argv[outIdx + 1] : "tmp/bulk-group-lots";
  const ffmpeg = hasFfmpeg();
  let total = 0;

  for (const [li, spec] of LOTS.entries()) {
    const dir = path.join(outRoot, spec.lot);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const groups = new Map<string, string[]>();
    const duplicates: [string, string][] = [];
    const ambiguous: string[] = [];
    let last = new Map<string, { file: string; buf: Buffer }>();
    for (const [i, shot] of spec.shots.entries()) {
      const file = `IMG_${String(1001 + li * 100 + i)}.jpg`;
      const prev = last.get(shot.article);
      const buf = shot.exactCopy && prev ? prev.buf : await render(A[shot.article], shot, li * 1000 + i);
      await writeFile(path.join(dir, file), buf);
      groups.set(shot.article, [...(groups.get(shot.article) ?? []), file]);
      if ((shot.exactCopy || shot.view === "nearDup") && prev) duplicates.push([prev.file, file]);
      if (spec.ambiguousShots?.includes(i)) ambiguous.push(file);
      if (!shot.exactCopy && shot.view !== "nearDup") last.set(shot.article, { file, buf });
      total++;
    }
    last = new Map();

    if (spec.video) {
      if (!ffmpeg) {
        console.warn(`  ${spec.lot} : ffmpeg absent, vidéo non générée.`);
      } else {
        const frames: string[] = [];
        for (const [k, view] of spec.video.views.entries()) {
          const f = path.join(dir, `.frame-${k}.jpg`);
          await writeFile(f, await render(A[spec.video.article], s(spec.video.article, view, "wood"), 9000 + k));
          frames.push(f);
        }
        const file = "VID_0001.mp4";
        const inputs = frames.flatMap((f) => ["-loop", "1", "-t", "2", "-i", f]);
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `concat=n=${frames.length}:v=1:a=0,scale=720:720,format=yuv420p`, "-r", "15", path.join(dir, file)]);
        for (const f of frames) await rm(f);
        groups.set(spec.video.article, [file]);
      }
    }

    const truth = {
      lot: spec.lot,
      description: `SYNTHÉTIQUE — ${spec.description}`,
      synthetic: true,
      consent: "Images synthétiques générées par scripts/bulk-group-fixtures.ts (aucune donnée réelle).",
      shopContext: "Boutique de test multi-produits à Dakar (mode, beauté, accessoires, restauration).",
      cases: spec.cases,
      groups: [...groups.entries()].map(([id, items]) => ({ id, items })),
      ambiguous,
      duplicates,
      variants: spec.variants ?? [],
    };
    await writeFile(path.join(dir, "truth.json"), JSON.stringify(truth, null, 2) + "\n");
    console.log(`✓ ${spec.lot} : ${spec.shots.length} photos${spec.video && ffmpeg ? " + 1 vidéo" : ""}, ${groups.size} articles`);
  }
  console.log(`\n${total} images synthétiques dans ${outRoot}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
