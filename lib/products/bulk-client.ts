"use client";

import { checkSourceFile } from "@/lib/client-video";
import { FRAMES_PER_VIDEO } from "@/lib/products/bulk-import";

// Import en lot — outils navigateur : images tirées d'une vidéo, envoi en parallèle.
// La vidéo elle-même ne quitte pas le téléphone : seules 2-3 images servent à reconnaître l'article.

/**
 * Tire `count` images JPEG (1280 px max) d'une vidéo, réparties sur sa durée (20 %, 50 %, 80 %).
 * Un seul élément <video>, positions lues l'une après l'autre. Renvoie [] si le navigateur ne lit
 * pas la vidéo (le lot continue sans elle).
 */
export function videoFrames(file: File, count = FRAMES_PER_VIDEO): Promise<Blob[]> {
  if (checkSourceFile(file)) return Promise.resolve([]);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const frames: Blob[] = [];
    let times: number[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(frames);
    };
    const timer = setTimeout(finish, 20000);
    const seekNext = () => {
      const t = times.shift();
      if (t == null) return finish();
      video.currentTime = t;
    };
    video.addEventListener("error", finish);
    video.addEventListener("loadeddata", () => {
      const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const marks = count === 1 ? [0.5] : count === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8];
      times = d > 0 ? marks.slice(0, count).map((m) => Math.max(0.05, d * m)) : [0.1];
      seekNext();
    });
    video.addEventListener("seeked", () => {
      try {
        const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width) return seekNext();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => {
            if (b) frames.push(b);
            seekNext();
          },
          "image/jpeg",
          0.85
        );
      } catch {
        seekNext();
      }
    });
    video.src = url;
  });
}

/** Exécute `fn` sur chaque élément, `limit` à la fois (connexion mobile : 3). */
export async function runLimited<T>(list: T[], limit: number, fn: (x: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        await fn(list[i], i);
      }
    })
  );
}

/** Appel JSON des routes d'import ; renvoie le corps et le code HTTP. */
export async function bulkFetch<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; data: T & { error?: string; message?: string } }> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Connexion perdue. Vérifie ton réseau et réessaie." } as T & { error?: string } };
  }
}
