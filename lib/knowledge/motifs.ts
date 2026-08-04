// ============================================================================
// motifs.ts — Bibliothèque de motifs africains (générateurs SVG).
// Nets, gratuits, sans appel IA. Se rasterisent directement avec `sharp`
// (déjà présent dans le projet, cf. lib/image-compose.ts -> buildPlainBackground).
//
// Origines culturelles (à respecter, piloter selon la catégorie produit) :
//   - bogolan .............. Mali (Bambara) — tissu de boue, marques géométriques
//   - adinkra .............. Ghana (Akan) — symboles à valeur proverbiale
//   - kente / pagne tissé .. Ghana (Akan-Ewe) — bandes tissées géométriques
//   - wax / sunburst ....... pan-ouest-africain — médaillons solaires
//
// Toutes les fonctions renvoient une chaîne SVG. Usage type avec sharp :
//   const png = await sharp(Buffer.from(bogolan(1080,1080))).png().toBuffer();
// ============================================================================

/** PRNG déterministe (LCG) — irrégularité « faite main » reproductible via seed. */
export function rng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export interface BogolanOpts {
  bg?: string;
  mark?: string;
  seed?: number;
}

/** BOGOLAN — fond sombre, marques géométriques claires en rangées (tirets / zigzag / diamants / points). */
export function bogolan(w: number, h: number, opts: BogolanOpts = {}): string {
  const { bg = "#1d1a15", mark = "#efe4cb", seed = 7 } = opts;
  const r = rng(seed);
  const rowH = 66;
  let els = "";
  let y = 0;
  let row = 0;
  while (y < h + rowH) {
    const kind = row % 4;
    const jitter = () => (r() - 0.5) * 8;
    if (kind === 0) {
      for (let x = -20; x < w + 20; x += 34)
        els += `<rect x="${x + jitter()}" y="${y + 22 + jitter()}" width="20" height="7" fill="${mark}" opacity="0.9"/>`;
    } else if (kind === 1) {
      let d = `M -20 ${y + 44}`;
      for (let x = -20; x < w + 40; x += 30) d += ` L ${x + 15} ${y + 22} L ${x + 30} ${y + 44}`;
      els += `<path d="${d}" fill="none" stroke="${mark}" stroke-width="5" opacity="0.85"/>`;
    } else if (kind === 2) {
      for (let x = 0; x < w + 30; x += 58) {
        const cx = x + jitter();
        const cy = y + 33;
        els += `<path d="M ${cx} ${cy - 15} L ${cx + 14} ${cy} L ${cx} ${cy + 15} L ${cx - 14} ${cy} Z" fill="none" stroke="${mark}" stroke-width="4" opacity="0.9"/>`;
      }
    } else {
      for (let x = 0; x < w + 30; x += 40) {
        const cx = x + jitter();
        const cy = y + 33;
        els += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${mark}" opacity="0.85"/>`;
        els += `<path d="M ${cx + 20} ${cy - 6} L ${cx + 20} ${cy + 6} M ${cx + 14} ${cy} L ${cx + 26} ${cy}" stroke="${mark}" stroke-width="3" opacity="0.7"/>`;
      }
    }
    y += rowH;
    row++;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${els}</svg>`;
}

export type AdinkraName =
  | "adinkrahene"
  | "dwennimmen"
  | "nyamedua"
  | "fihankra"
  | "sankofa"
  | "eban";

/** Symbole adinkra — interprétation géométrique propre (viewBox 100x100). Renvoie le contenu SVG. */
export function adinkra(name: AdinkraName, stroke = "#C79A3B", sw = 6): string {
  const S = `fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (name) {
    case "adinkrahene":
      return `<circle cx="50" cy="50" r="40" ${S}/><circle cx="50" cy="50" r="26" ${S}/><circle cx="50" cy="50" r="12" ${S}/><circle cx="50" cy="50" r="3" fill="${stroke}"/>`;
    case "dwennimmen":
      return `<path d="M50 50 q-26 -4 -26 -22 q0 -14 13 -14 q10 0 10 11" ${S}/>
              <path d="M50 50 q26 -4 26 -22 q0 -14 -13 -14 q-10 0 -10 11" ${S}/>
              <path d="M50 50 q-26 4 -26 22 q0 14 13 14 q10 0 10 -11" ${S}/>
              <path d="M50 50 q26 4 26 22 q0 14 -13 14 q-10 0 -10 -11" ${S}/>`;
    case "nyamedua":
      return `<path d="M50 12 V88 M12 50 H88" ${S}/>
              <path d="M50 12 l8 10 h-16 z" fill="${stroke}"/><path d="M50 88 l8 -10 h-16 z" fill="${stroke}"/>
              <path d="M12 50 l10 8 v-16 z" fill="${stroke}"/><path d="M88 50 l-10 8 v-16 z" fill="${stroke}"/>
              <circle cx="50" cy="50" r="8" ${S}/>`;
    case "fihankra":
      return `<path d="M22 78 V22 H78 V78 H44" ${S}/><path d="M78 78 q-14 0 -14 -14" ${S}/>`;
    case "sankofa":
      return `<path d="M50 84 C 18 60 22 26 40 26 C 50 26 50 38 50 44 C 50 38 50 26 60 26 C 78 26 82 60 50 84 Z" ${S}/>`;
    case "eban":
      return `<path d="M30 70 V34 H66 V62 H44 V46 H56" ${S}/>`;
    default:
      return `<circle cx="50" cy="50" r="30" ${S}/>`;
  }
}

export interface ScatterOpts {
  color?: string;
  opacity?: number;
  step?: number;
  size?: number;
  seed?: number;
}

/** Champ discret de glyphes adinkra — texture de fond en filigrane. */
export function adinkraScatter(w: number, h: number, opts: ScatterOpts = {}): string {
  const { color = "#C79A3B", opacity = 0.08, step = 150, size = 66, seed = 3 } = opts;
  const r = rng(seed);
  const names: AdinkraName[] = ["adinkrahene", "dwennimmen", "nyamedua", "fihankra", "eban", "sankofa"];
  let g = "";
  let row = 0;
  for (let y = 10; y < h; y += step) {
    const off = (row % 2) * (step / 2);
    for (let x = 10 + off; x < w; x += step) {
      const nm = names[Math.floor(r() * names.length)];
      const rot = Math.floor((r() - 0.5) * 24);
      g += `<g transform="translate(${x},${y}) rotate(${rot}) scale(${size / 100})" opacity="${opacity}">${adinkra(nm, color, 6)}</g>`;
    }
    row++;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}</svg>`;
}

export interface KenteOpts {
  palette?: string[]; // [vert, or, rouge, noir, crème]
  seed?: number;
}

/** KENTE / pagne tissé — bande horizontale à blocs géométriques « tissés ». */
export function kenteBand(w: number, bandH: number, opts: KenteOpts = {}): string {
  const { palette = ["#146B3A", "#C79A3B", "#B02E26", "#141414", "#EFE4CB"], seed = 5 } = opts;
  const r = rng(seed);
  const unit = bandH / 3;
  let els = `<rect width="${w}" height="${bandH}" fill="${palette[4]}"/>`;
  els += `<rect y="0" width="${w}" height="${unit * 0.5}" fill="${palette[3]}"/>`;
  els += `<rect y="${bandH - unit * 0.5}" width="${w}" height="${unit * 0.5}" fill="${palette[3]}"/>`;
  let x = 0;
  let i = 0;
  while (x < w) {
    const c = palette[i % 4];
    const bw = unit * (1 + Math.floor(r() * 2));
    els += `<rect x="${x}" y="${unit * 0.5}" width="${bw}" height="${unit * 2}" fill="${c}"/>`;
    const line = palette[(i + 2) % 4];
    for (let yy = unit * 0.6; yy < unit * 2.4; yy += 7)
      els += `<rect x="${x}" y="${yy}" width="${bw}" height="2.4" fill="${line}" opacity="0.5"/>`;
    els += `<rect x="${x + bw / 2 - unit * 0.28}" y="${bandH / 2 - unit * 0.28}" width="${unit * 0.56}" height="${unit * 0.56}" fill="${palette[4]}" opacity="0.9"/>`;
    x += bw;
    i++;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${bandH}" viewBox="0 0 ${w} ${bandH}">${els}</svg>`;
}

export interface SunburstOpts {
  R?: number;
  stroke?: string;
  rays?: number;
  op?: number;
}

/** Médaillon solaire (rappel wax). */
export function sunburst(opts: SunburstOpts = {}): string {
  const { R = 460, stroke = "#C79A3B", rays = 60, op = 1 } = opts;
  const cx = R;
  const cy = R;
  let ticks = "";
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * R * 0.72;
    const y1 = cy + Math.sin(a) * R * 0.72;
    const x2 = cx + Math.cos(a) * R * 0.98;
    const y2 = cy + Math.sin(a) * R * 0.98;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="4"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${R * 2}" height="${R * 2}" viewBox="0 0 ${R * 2} ${R * 2}" style="opacity:${op}">
    <g fill="none" stroke="${stroke}"><circle cx="${cx}" cy="${cy}" r="${R * 0.98}" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${R * 0.7}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${R * 0.5}" stroke-width="6"/></g>
    ${ticks}<circle cx="${cx}" cy="${cy}" r="${R * 0.09}" fill="${stroke}"/></svg>`;
}

/** Utilitaire : SVG -> data URI (pour <img> côté satori/HTML). */
export const svgDataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
