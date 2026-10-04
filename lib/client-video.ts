"use client";

// Vidéo produit dans le navigateur (V1) :
//   fichier du téléphone → lecture (durée, dimensions) → découpe ≤ 30 s + compression MP4 720p
//   → image d'aperçu → envoi DIRECT à Supabase Storage (TUS, résumable) → chemin à enregistrer.
// L'original ne quitte jamais le téléphone. Mediabunny utilise l'encodeur matériel (WebCodecs) ;
// il n'est chargé qu'à l'ouverture de la vidéo (import dynamique), jamais sur les pages publiques.

import { createClient } from "@/lib/supabase/client";
import { uploadShopMedia } from "@/lib/client-image";
import {
  MAX_SOURCE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  OUTPUT_AUDIO_BITRATE,
  OUTPUT_VIDEO_BITRATE,
  PRODUCT_VIDEO_BUCKET,
  VIDEO_MIME,
  needsTrim,
  outputDimensions,
  type TrimRange,
} from "@/lib/shops/video";

export type VideoErrorCode = "format" | "too_big" | "browser" | "process" | "final_too_big" | "upload" | "session" | "canceled";

export class VideoError extends Error {
  constructor(public code: VideoErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VideoError";
  }
}

type Mediabunny = typeof import("mediabunny");
let mbPromise: Promise<Mediabunny> | null = null;
function loadMediabunny(): Promise<Mediabunny> {
  mbPromise ??= import("mediabunny");
  return mbPromise;
}

export interface VideoProbe {
  duration: number; // secondes
  width: number; // dimensions affichées (rotation comprise)
  height: number;
  codec: string | null;
  hasAudio: boolean;
  canDecode: boolean;
}

/** Contrôles avant tout traitement : taille et type annoncé par le téléphone. */
export function checkSourceFile(file: File): VideoErrorCode | null {
  if (file.size > MAX_SOURCE_BYTES) return "too_big";
  if (file.type && !file.type.startsWith("video/")) return "format";
  return null;
}

/** Lit la durée et les dimensions de la vidéo choisie (sans la décoder entièrement). */
export async function probeVideo(file: File): Promise<VideoProbe> {
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoError("format");
    const [duration, audio, canDecode] = await Promise.all([
      input.computeDuration(),
      input.getPrimaryAudioTrack(),
      track.canDecode().catch(() => false),
    ]);
    if (!(duration > 0)) throw new VideoError("format");
    return { duration, width: track.displayWidth, height: track.displayHeight, codec: track.codec, hasAudio: !!audio, canDecode };
  } catch (err) {
    throw err instanceof VideoError ? err : new VideoError("format", String(err));
  } finally {
    input.dispose();
  }
}

/**
 * Miniatures de la timeline du découpage (comme WhatsApp). Best-effort : sans décodeur
 * WebCodecs, aucune miniature (la timeline reste une barre unie).
 */
export async function timelineThumbnails(
  file: File,
  duration: number,
  count: number,
  onThumb: (index: number, url: string) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const mb = await loadMediabunny();
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) return;
      const sink = new mb.CanvasSink(track, { height: 112 });
      const first = await track.getFirstTimestamp();
      const step = duration / count;
      const times = Array.from({ length: count }, (_, i) => first + step * i + step / 2);
      let i = 0;
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (signal?.aborted) return;
        const canvas = wrapped?.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
        if (canvas) onThumb(i, await canvasToUrl(canvas));
        i++;
      }
    } finally {
      input.dispose();
    }
  } catch {
    // les miniatures sont un confort : jamais bloquant
  }
}

async function canvasToUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if ("toDataURL" in canvas) return canvas.toDataURL("image/jpeg", 0.6);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
  return URL.createObjectURL(blob);
}

export interface PreparedVideo {
  blob: Blob;
  durationMs: number;
  width: number;
  height: number;
}

/**
 * Découpe [range] et compresse en MP4 H.264/AAC 720p « faststart » (lecture progressive).
 * Sans encodeur vidéo (iOS < 16.4, très vieux Android) : la vidéo est seulement remise au format
 * MP4 sans ré-encodage, à condition d'être déjà courte, légère et en H.264 — sinon refus clair.
 */
export async function prepareVideo(
  file: File,
  probe: VideoProbe,
  range: TrimRange,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<PreparedVideo> {
  const mb = await loadMediabunny();
  const dims = outputDimensions(probe.width, probe.height);
  const canEncodeVideo = probe.canDecode && (await mb.canEncodeVideo("avc", { width: dims.width, height: dims.height, bitrate: OUTPUT_VIDEO_BITRATE }).catch(() => false));

  if (canEncodeVideo && probe.hasAudio && !(await mb.canEncodeAudio("aac").catch(() => false))) {
    // Safari / Firefox : encodeur AAC en WebAssembly, chargé seulement si nécessaire.
    const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
    registerAacEncoder();
  }

  const fullLength = !needsTrim(probe.duration) && range.start <= 0.05 && range.end >= probe.duration - 0.05;
  const remuxOnly = !canEncodeVideo;
  if (remuxOnly && !(fullLength && file.size <= MAX_VIDEO_BYTES && probe.codec === "avc")) {
    throw new VideoError("browser");
  }

  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  let conversion: Awaited<ReturnType<typeof mb.Conversion.init>> | null = null;
  const onAbort = () => void conversion?.cancel();
  signal?.addEventListener("abort", onAbort);
  try {
    conversion = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      ...(remuxOnly
        ? {} // copie des paquets, sans ré-encodage (pas besoin de WebCodecs)
        : {
            trim: { start: range.start, end: range.end },
            video: {
              codec: "avc",
              width: dims.width,
              height: dims.height,
              fit: "cover",
              // Rotation « cuite » dans l'image : dimensions sûres sur tous les lecteurs.
              allowTransformationMetadata: false,
              quality: new mb.Quality({ bitrate: OUTPUT_VIDEO_BITRATE }),
              keyFrameInterval: 2,
            },
            audio: { codec: "aac", quality: new mb.Quality({ bitrate: OUTPUT_AUDIO_BITRATE }) },
          }),
    });
    if (!conversion.isValid) throw new VideoError(remuxOnly ? "browser" : "format");
    conversion.onProgress = (p) => onProgress(Math.min(Math.max(p, 0), 1));
    if (signal?.aborted) throw new VideoError("canceled");
    await conversion.execute();
    if (!target.buffer) throw new VideoError("process");
    const blob = new Blob([target.buffer], { type: VIDEO_MIME });
    if (blob.size > MAX_VIDEO_BYTES) throw new VideoError("final_too_big");
    const length = remuxOnly ? probe.duration : range.end - range.start;
    return {
      blob,
      durationMs: Math.round(Math.min(length, MAX_VIDEO_SECONDS + 0.5) * 1000),
      width: remuxOnly ? probe.width : dims.width,
      height: remuxOnly ? probe.height : dims.height,
    };
  } catch (err) {
    if (signal?.aborted) throw new VideoError("canceled");
    if (err instanceof VideoError) throw err;
    console.error("[client-video] conversion failed:", err);
    throw new VideoError("process", String(err));
  } finally {
    signal?.removeEventListener("abort", onAbort);
    input.dispose();
  }
}

/**
 * Image d'aperçu (poster) prise dans la vidéo finale, envoyée dans shop-media.
 * Best-effort : sans poster, le lecteur affiche la première image.
 */
export async function uploadVideoPoster(video: Blob): Promise<string | null> {
  try {
    const frame = await grabFrame(video, 0.3);
    if (!frame) return null;
    const up = await uploadShopMedia(new File([frame], "poster.jpg", { type: "image/jpeg" }), "video_poster");
    return up.path;
  } catch {
    return null;
  }
}

/** Capture une image de la vidéo avec un <video> (fonctionne aussi sans WebCodecs). */
function grabFrame(blob: Blob, at: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let done = false;
    const finish = (result: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 8000);
    video.addEventListener("error", () => finish(null));
    video.addEventListener("loadeddata", () => {
      video.currentTime = Math.min(at, Math.max((video.duration || 0) / 2, 0));
    });
    video.addEventListener("seeked", () => {
      try {
        const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => finish(b), "image/jpeg", 0.82);
      } catch {
        finish(null);
      }
    });
    video.src = url;
  });
}

/** Chemin de stockage d'une nouvelle vidéo : {userId}/videos/{uuid}.mp4 (exigé par les policies). */
export async function newVideoPath(): Promise<string> {
  const { data } = await createClient().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new VideoError("session");
  return `${userId}/videos/${crypto.randomUUID()}.mp4`;
}

/**
 * Envoi résumable (protocole TUS de Supabase Storage) directement depuis le navigateur :
 * progression réelle, reprise automatique si le réseau coupe, et relance possible au même
 * endroit (même chemin → même empreinte → l'envoi reprend où il s'était arrêté).
 */
export async function uploadVideo(
  blob: Blob,
  path: string,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new VideoError("session");
  const tus = await import("tus-js-client");
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  // Un File avec nom et date fixes : l'empreinte TUS reste la même d'un essai à l'autre.
  const file = new File([blob], path.split("/").pop() || "video.mp4", { type: VIDEO_MIME, lastModified: 0 });

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${base}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: PRODUCT_VIDEO_BUCKET, objectName: path, contentType: VIDEO_MIME, cacheControl: "31536000" },
      chunkSize: 6 * 1024 * 1024, // valeur imposée par Supabase
      fingerprint: async () => `jaarle-video:${path}:${blob.size}`,
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: (error) => {
        const status = (error as { originalResponse?: { getStatus(): number } | null }).originalResponse?.getStatus?.();
        // 409 : le fichier existe déjà à ce chemin (envoi terminé lors d'un essai précédent).
        if (status === 409) return resolve();
        if (status === 401 || status === 403) return reject(new VideoError("session", error.message));
        reject(new VideoError("upload", error.message));
      },
    });
    signal?.addEventListener("abort", () => {
      void upload.abort(false);
      reject(new VideoError("canceled"));
    });
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}
