// Vidéo produit (V1) — règles et calculs partagés client / serveur (voir migration 0035).
// Fichier sans dépendance navigateur ni Node : testé avec Vitest (lib/shops/video.test.ts).

/** Bucket public des vidéos produit (≠ shop-media, limité à 5 Mo d'images). */
export const PRODUCT_VIDEO_BUCKET = "product-videos";

/** Durée maximale de la vidéo finale, en secondes. */
export const MAX_VIDEO_SECONDS = 30;
/** Marge tolérée par la base (l'encodeur peut finir sur la frame suivante) : 30,5 s. */
export const MAX_VIDEO_MS_DB = 30_500;
/** Plus petit segment qu'on peut garder au découpage. */
export const MIN_VIDEO_SECONDS = 1;
/** Taille maximale du fichier final (= limite du bucket). */
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
/** Taille maximale du fichier choisi sur le téléphone (traité sur place, jamais envoyé tel quel). */
export const MAX_SOURCE_BYTES = 500 * 1024 * 1024;

/** Sortie 720p : grand côté ≤ 1280 px, petit côté ≤ 720 px (portrait ou paysage). */
export const OUTPUT_MAX_LONG_SIDE = 1280;
export const OUTPUT_MAX_SHORT_SIDE = 720;
/** ~2 Mb/s vidéo + 96 kb/s son ≈ 8 Mo pour 30 s. */
export const OUTPUT_VIDEO_BITRATE = 2_000_000;
export const OUTPUT_AUDIO_BITRATE = 96_000;

export const VIDEO_MIME = "video/mp4";

export interface TrimRange {
  start: number; // secondes
  end: number; // secondes
}

/** Données d'une vidéo envoyée, telles que le formulaire les transmet à saveProduct. */
export interface ProductVideoDraft {
  path: string;
  posterPath: string | null;
  durationMs: number;
  fileSize: number;
  width: number | null;
  height: number | null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function needsTrim(duration: number): boolean {
  return duration > MAX_VIDEO_SECONDS + 0.05;
}

/** Sélection proposée à l'ouverture : le début de la vidéo, 30 s au plus. */
export function initialRange(duration: number): TrimRange {
  return { start: 0, end: round(Math.min(Math.max(duration, 0), MAX_VIDEO_SECONDS)) };
}

/**
 * Normalise une sélection : dans [0, durée], au moins 1 s (ou toute la vidéo si plus courte),
 * au plus 30 s. Si la fenêtre est trop longue, c'est `anchor` qui reste fixe.
 */
export function clampRange(range: TrimRange, duration: number, anchor: "start" | "end" = "start"): TrimRange {
  const d = Math.max(duration, 0);
  const minLen = Math.min(MIN_VIDEO_SECONDS, d);
  let start = Math.min(Math.max(range.start, 0), d);
  let end = Math.min(Math.max(range.end, 0), d);
  if (end < start) [start, end] = [end, start];
  if (end - start > MAX_VIDEO_SECONDS) {
    if (anchor === "start") end = start + MAX_VIDEO_SECONDS;
    else start = end - MAX_VIDEO_SECONDS;
  }
  if (end - start < minLen) {
    if (anchor === "start") {
      end = Math.min(start + minLen, d);
      start = end - minLen;
    } else {
      start = Math.max(end - minLen, 0);
      end = start + minLen;
    }
  }
  return { start: round(start), end: round(end) };
}

/** Poignée gauche déplacée à `t` : la fin suit si la fenêtre dépasse 30 s (comme WhatsApp). */
export function moveStart(range: TrimRange, t: number, duration: number): TrimRange {
  const d = Math.max(duration, 0);
  const minLen = Math.min(MIN_VIDEO_SECONDS, d);
  const start = Math.min(Math.max(t, 0), Math.max(d - minLen, 0));
  let end = Math.max(range.end, start + minLen);
  if (end - start > MAX_VIDEO_SECONDS) end = start + MAX_VIDEO_SECONDS;
  return clampRange({ start, end: Math.min(end, d) }, d, "start");
}

/** Poignée droite déplacée à `t` : le début suit si la fenêtre dépasse 30 s. */
export function moveEnd(range: TrimRange, t: number, duration: number): TrimRange {
  const d = Math.max(duration, 0);
  const minLen = Math.min(MIN_VIDEO_SECONDS, d);
  const end = Math.max(Math.min(t, d), minLen);
  let start = Math.min(range.start, end - minLen);
  if (end - start > MAX_VIDEO_SECONDS) start = end - MAX_VIDEO_SECONDS;
  return clampRange({ start: Math.max(start, 0), end }, d, "end");
}

/** Glissement de toute la fenêtre (même durée) de `delta` secondes. */
export function shiftRange(range: TrimRange, delta: number, duration: number): TrimRange {
  const len = range.end - range.start;
  const start = Math.min(Math.max(range.start + delta, 0), Math.max(duration - len, 0));
  return { start: round(start), end: round(start + len) };
}

/** 75 → « 01:15 » ; 3725 → « 1:02:05 ». */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 0.0001));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Durée lisible d'une sélection : « 30 s », « 12,5 s ». */
export function formatSeconds(seconds: number): string {
  const v = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")} s`;
}

/**
 * Dimensions de sortie (720p) : jamais d'agrandissement, ratio conservé, valeurs paires
 * (exigé par H.264). Portrait 1080×1920 → 720×1280 ; paysage 3840×2160 → 1280×720.
 */
export function outputDimensions(width: number, height: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: OUTPUT_MAX_SHORT_SIDE, height: OUTPUT_MAX_LONG_SIDE };
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale = Math.min(1, OUTPUT_MAX_LONG_SIDE / long, OUTPUT_MAX_SHORT_SIDE / short);
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Chemin attendu d'une vidéo du vendeur : {userId}/videos/{uuid}.mp4 (même règle qu'en SQL). */
export function isOwnVideoPath(userId: string, path: string): boolean {
  return new RegExp(`^${UUID}/videos/${UUID}\\.mp4$`).test(path) && path.startsWith(`${userId}/`);
}

/** Chemin attendu d'une image d'aperçu : {userId}/videos/{uuid}.webp (bucket shop-media). */
export function isOwnPosterPath(userId: string, path: string): boolean {
  return new RegExp(`^${UUID}/videos/${UUID}\\.webp$`).test(path) && path.startsWith(`${userId}/`);
}

/** URL publique d'une vidéo (bucket public : pas de signature). */
export function productVideoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${PRODUCT_VIDEO_BUCKET}/${path}`;
}

/** Durée ISO 8601 pour le JSON-LD (VideoObject) : 12 500 ms → « PT12.5S ». */
export function isoDuration(ms: number): string {
  const s = Math.round(ms / 100) / 10;
  return `PT${s}S`;
}
