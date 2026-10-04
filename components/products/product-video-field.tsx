"use client";

import * as React from "react";
import Link from "next/link";
import { EyeOff, Loader2, Lock, RefreshCw, Trash2, Video } from "lucide-react";
import { discardVideoUpload } from "@/app/dashboard/produits/actions";
import { VideoTrimmer } from "@/components/products/video-trimmer";
import { Button } from "@/components/ui/button";
import {
  VideoError,
  checkSourceFile,
  newVideoPath,
  prepareVideo,
  probeVideo,
  uploadVideo,
  uploadVideoPoster,
  type PreparedVideo,
  type VideoErrorCode,
  type VideoProbe,
} from "@/lib/client-video";
import { shopMediaUrl } from "@/lib/shops/media";
import { formatSeconds, needsTrim, productVideoUrl, type ProductVideoDraft, type TrimRange } from "@/lib/shops/video";
import { useLocale } from "@/lib/locale-context";

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "trim"; file: File; probe: VideoProbe }
  | { kind: "processing"; progress: number }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; code: Exclude<VideoErrorCode, "canceled">; canRetryUpload: boolean };

const ERROR_KEYS: Record<Exclude<VideoErrorCode, "canceled">, string> = {
  format: "products.videoErrorFormat",
  too_big: "products.videoErrorTooBig",
  browser: "products.videoErrorBrowser",
  process: "products.videoErrorProcess",
  final_too_big: "products.videoErrorFinalTooBig",
  upload: "products.videoErrorUpload",
  session: "products.videoErrorSession",
};

/**
 * Bloc « Vidéo » du formulaire produit : 1 vidéo par produit, 30 s maximum.
 * Choisir → (découper si > 30 s) → préparer → envoyer → aperçu, avec Remplacer / Supprimer.
 * La vidéo n'est rattachée au produit qu'à l'enregistrement du formulaire (saveProduct).
 */
export function ProductVideoField({
  value,
  savedPath,
  allowed = true,
  onChange,
  onBusyChange,
}: {
  value: ProductVideoDraft | null;
  /** Chemin de la vidéo déjà enregistrée sur le produit (jamais effacée d'ici : saveProduct s'en charge). */
  savedPath: string | null;
  /** Offre Pro (ou plus). Sinon : ajout verrouillé ; une vidéo existante est masquée du public. */
  allowed?: boolean;
  onChange: (video: ProductVideoDraft | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useLocale();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [localUrl, setLocalUrl] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  // Vidéo préparée en attente d'envoi : permet de relancer un envoi interrompu sans tout refaire.
  const pending = React.useRef<{ prepared: PreparedVideo; path: string; posterPath: string | null | undefined } | null>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const busy = phase.kind === "reading" || phase.kind === "trim" || phase.kind === "processing" || phase.kind === "uploading";
  React.useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  // Quitter la page pendant la préparation / l'envoi : le navigateur demande confirmation.
  React.useEffect(() => {
    if (phase.kind !== "processing" && phase.kind !== "uploading") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase.kind]);

  React.useEffect(() => () => abortRef.current?.abort(), []);
  React.useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  function fail(err: unknown) {
    const code = err instanceof VideoError ? err.code : "process";
    if (code === "canceled") return setPhase({ kind: "idle" });
    setPhase({ kind: "error", code, canRetryUpload: (code === "upload" || code === "session") && !!pending.current });
  }

  /** Efface du stockage une vidéo envoyée mais pas encore enregistrée sur le produit. */
  function discardIfUnsaved(video: ProductVideoDraft | null) {
    if (video && video.path !== savedPath) void discardVideoUpload(video.path, video.posterPath).catch(() => undefined);
  }

  async function onFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const code = checkSourceFile(file);
    if (code) return fail(new VideoError(code));
    setPhase({ kind: "reading" });
    try {
      const probe = await probeVideo(file);
      if (needsTrim(probe.duration)) setPhase({ kind: "trim", file, probe });
      else await processAndUpload(file, probe, { start: 0, end: probe.duration });
    } catch (err) {
      fail(err);
    }
  }

  async function processAndUpload(file: File, probe: VideoProbe, range: TrimRange) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setPhase({ kind: "processing", progress: 0 });
      const prepared = await prepareVideo(file, probe, range, (p) => setPhase({ kind: "processing", progress: p }), ctrl.signal);
      pending.current = { prepared, path: await newVideoPath(), posterPath: undefined };
      await sendPending(ctrl);
    } catch (err) {
      fail(err);
    }
  }

  async function sendPending(ctrl = new AbortController()) {
    const job = pending.current;
    if (!job) return;
    abortRef.current = ctrl;
    try {
      setPhase({ kind: "uploading", progress: 0 });
      const [posterPath] = await Promise.all([
        job.posterPath !== undefined ? Promise.resolve(job.posterPath) : uploadVideoPoster(job.prepared.blob),
        uploadVideo(job.prepared.blob, job.path, (p) => setPhase({ kind: "uploading", progress: p }), ctrl.signal),
      ]);
      job.posterPath = posterPath;
      const draft: ProductVideoDraft = {
        path: job.path,
        posterPath,
        durationMs: job.prepared.durationMs,
        fileSize: job.prepared.blob.size,
        width: job.prepared.width,
        height: job.prepared.height,
      };
      discardIfUnsaved(valueRef.current); // vidéo remplacée avant d'avoir été enregistrée
      setLocalUrl(URL.createObjectURL(job.prepared.blob));
      pending.current = null;
      onChange(draft);
      setPhase({ kind: "idle" });
    } catch (err) {
      fail(err);
    }
  }

  function cancelWork() {
    abortRef.current?.abort();
    pending.current = null;
    setPhase({ kind: "idle" });
  }

  function remove() {
    discardIfUnsaved(value);
    setLocalUrl(null);
    onChange(null);
  }

  const previewSrc = localUrl ?? productVideoUrl(value?.path);
  const posterSrc = value?.posterPath ? shopMediaUrl(value.posterPath) : undefined;
  const working = phase.kind === "reading" || phase.kind === "processing" || phase.kind === "uploading";
  const percent = phase.kind === "processing" || phase.kind === "uploading" ? Math.round(phase.progress * 100) : 0;

  return (
    <div className="mb-2 mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{t("products.videoLabel")}</p>
        <span className="text-xs text-muted-foreground">{t("products.videoLimit")}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {working ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
            <p className="flex-1 text-sm font-medium">
              {phase.kind === "reading"
                ? t("products.videoReading")
                : (phase.kind === "processing" ? t("products.videoPreparing") : t("products.videoUploading")).replace("{p}", String(percent))}
            </p>
            {phase.kind !== "reading" && (
              <button type="button" onClick={cancelWork} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                {t("products.videoCancel")}
              </button>
            )}
          </div>
          {phase.kind !== "reading" && (
            <>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-300"
                  style={{ width: `${Math.max(percent, 3)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("products.videoStayHint")}</p>
            </>
          )}
        </div>
      ) : value && previewSrc ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <video
            key={previewSrc}
            src={previewSrc}
            poster={posterSrc ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="max-h-80 w-full bg-black object-contain"
          />
          <div className="flex flex-wrap items-center gap-2 p-3">
            <span className="mr-auto text-xs text-muted-foreground">
              {t("products.videoReady").replace("{d}", formatSeconds(value.durationMs / 1000))}
            </span>
            {allowed && (
              <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t("products.videoReplace")}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={remove} className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              {t("products.videoRemove")}
            </Button>
          </div>
        </div>
      ) : !allowed ? (
        // Offre Gratuite : la vidéo est une fonction Pro.
        <Link
          href="/dashboard/abonnement"
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-accent/40 px-4 py-3.5 text-left transition-colors hover:border-primary"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Video className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {t("products.videoAdd")}
              <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-br from-primary to-secondary px-1.5 py-0.5 text-[10px] font-bold text-white">
                <Lock className="h-2.5 w-2.5" />
                PRO
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{t("products.videoProHint")}</span>
          </span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-input px-4 py-3.5 text-left transition-colors hover:bg-muted"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Video className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold">{t("products.videoAdd")}</span>
            <span className="text-xs text-muted-foreground">{t("products.videoHint")}</span>
          </span>
        </button>
      )}

      {!allowed && value && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
          <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {t("products.videoHiddenNotPro")}{" "}
            <Link href="/dashboard/abonnement" className="font-semibold text-primary">
              {t("products.videoGoPro")}
            </Link>
          </span>
        </p>
      )}

      {phase.kind === "error" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
          <span className="flex-1">{t(ERROR_KEYS[phase.code])}</span>
          {phase.canRetryUpload ? (
            <button type="button" onClick={() => void sendPending()} className="font-semibold underline-offset-2 hover:underline">
              {t("products.videoRetry")}
            </button>
          ) : (
            <button type="button" onClick={() => setPhase({ kind: "idle" })} aria-label="OK" className="font-semibold">
              OK
            </button>
          )}
        </div>
      )}

      {phase.kind === "trim" && (
        <VideoTrimmer
          file={phase.file}
          probe={phase.probe}
          onCancel={() => setPhase({ kind: "idle" })}
          onConfirm={(range) => void processAndUpload(phase.file, phase.probe, range)}
        />
      )}
    </div>
  );
}
