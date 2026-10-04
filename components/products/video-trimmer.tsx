"use client";

import * as React from "react";
import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { timelineThumbnails, type VideoProbe } from "@/lib/client-video";
import { useLocale } from "@/lib/locale-context";
import { formatClock, formatSeconds, initialRange, moveEnd, moveStart, shiftRange, type TrimRange } from "@/lib/shops/video";
import { cn } from "@/lib/utils";

const THUMB_COUNT = 10;

// offset : écart (en s) entre le doigt et le bord saisi, pour que la poignée ne « saute » pas
// sous le doigt au premier mouvement.
type Drag = { kind: "start" | "end" | "window"; x: number; range: TrimRange; width: number; offset: number };

/**
 * Découpe façon WhatsApp : aperçu, timeline avec miniatures, deux poignées tactiles,
 * fenêtre de 30 s maximum, durée affichée en direct, lecture en boucle du passage choisi.
 * Plein écran sur téléphone, fenêtre centrée sur ordinateur.
 */
export function VideoTrimmer({
  file,
  probe,
  onCancel,
  onConfirm,
}: {
  file: File;
  probe: VideoProbe;
  onCancel: () => void;
  onConfirm: (range: TrimRange) => void;
}) {
  const { t } = useLocale();
  const duration = probe.duration;
  const [range, setRange] = React.useState<TrimRange>(() => initialRange(duration));
  const [thumbs, setThumbs] = React.useState<(string | null)[]>(() => Array(THUMB_COUNT).fill(null));
  const [playing, setPlaying] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const rangeRef = React.useRef(range);
  rangeRef.current = range;

  // URL locale créée / libérée dans le même effet (sûr aussi en mode strict de React).
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Miniatures en arrière-plan (la timeline est utilisable tout de suite).
  React.useEffect(() => {
    const ctrl = new AbortController();
    const created: string[] = [];
    void timelineThumbnails(
      file,
      duration,
      THUMB_COUNT,
      (i, thumb) => {
        if (thumb.startsWith("blob:")) created.push(thumb);
        setThumbs((prev) => prev.map((v, j) => (j === i ? thumb : v)));
      },
      ctrl.signal
    );
    return () => {
      ctrl.abort();
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [file, duration]);

  // Page figée derrière la fenêtre ; Échap pour fermer.
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  // Lecture en boucle du passage choisi (contrôle à chaque image, plus précis que timeupdate).
  React.useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        const r = rangeRef.current;
        if (v.currentTime >= r.end - 0.03 || v.currentTime < r.start - 0.25) v.currentTime = r.start;
        setTime(v.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  function seek(to: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(to, 0), Math.max(duration - 0.05, 0));
    setTime(v.currentTime);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const r = rangeRef.current;
      if (v.currentTime < r.start || v.currentTime >= r.end - 0.05) v.currentTime = r.start;
      void v.play().catch(() => setPlaying(false));
    } else {
      v.pause();
    }
  }

  function pauseForEdit() {
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
  }

  function timeAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (Math.min(Math.max(clientX - rect.left, 0), rect.width) / rect.width) * duration;
  }

  function startDrag(kind: Drag["kind"], e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = rangeRef.current;
    const edge = kind === "end" ? r.end : r.start;
    drag.current = { kind, x: e.clientX, range: r, width: trackRef.current?.clientWidth ?? 1, offset: timeAt(e.clientX) - edge };
    pauseForEdit();
  }

  function onDragMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    let next: TrimRange;
    if (d.kind === "start") {
      next = moveStart(rangeRef.current, timeAt(e.clientX) - d.offset, duration);
      seek(next.start);
    } else if (d.kind === "end") {
      next = moveEnd(rangeRef.current, timeAt(e.clientX) - d.offset, duration);
      seek(next.end - 0.05);
    } else {
      next = shiftRange(d.range, ((e.clientX - d.x) / d.width) * duration, duration);
      seek(next.start);
    }
    setRange(next);
  }

  function endDrag() {
    drag.current = null;
  }

  // Toucher la timeline hors de la sélection : la fenêtre s'y place (sa durée est conservée).
  function onTrackPointerDown(e: React.PointerEvent) {
    if (drag.current) return;
    pauseForEdit();
    const next = shiftRange(rangeRef.current, timeAt(e.clientX) - rangeRef.current.start, duration);
    setRange(next);
    seek(next.start);
  }

  function onHandleKey(kind: "start" | "end", e: React.KeyboardEvent) {
    const step = e.shiftKey ? 5 : 0.5;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : e.key === "ArrowRight" || e.key === "ArrowUp" ? step : 0;
    if (!delta) return;
    e.preventDefault();
    pauseForEdit();
    const r = rangeRef.current;
    const next = kind === "start" ? moveStart(r, r.start + delta, duration) : moveEnd(r, r.end + delta, duration);
    setRange(next);
    seek(kind === "start" ? next.start : next.end - 0.05);
  }

  const pct = (s: number) => `${(duration > 0 ? (s / duration) * 100 : 0).toFixed(3)}%`;
  const length = range.end - range.start;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-trim-title"
      className="fixed inset-0 z-[60] flex bg-black/95 text-white sm:items-center sm:justify-center sm:bg-black/70 sm:p-6"
    >
      <div className="flex h-full w-full flex-col sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:overflow-hidden sm:rounded-3xl sm:bg-neutral-950 sm:shadow-2xl">
        {/* En-tête */}
        <div className="flex items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("products.videoCancel")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 id="video-trim-title" className="flex-1 text-base font-semibold">
            {t("products.videoTrimTitle")}
          </h2>
        </div>

        {/* Aperçu */}
        <div className="relative min-h-0 flex-1 sm:aspect-[4/5] sm:flex-none">
          <video
            ref={videoRef}
            src={url ?? undefined}
            playsInline
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={() => seek(range.start)}
            onClick={togglePlay}
            className="absolute inset-0 h-full w-full object-contain"
          />
          {!playing && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={t("products.videoPlaySegment")}
              className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/60"
            >
              <Play className="ml-1 h-7 w-7 fill-white" />
            </button>
          )}
        </div>

        {/* Découpe */}
        <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <p className="mb-3 text-center text-[13px] leading-snug text-white/70">
            {t("products.videoTooLong").replace("{n}", String(Math.round(duration)))}
          </p>

          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="tabular-nums text-white/80">
              {formatClock(range.start)} → {formatClock(range.end)}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold tabular-nums">
              {t("products.videoTrimSelected").replace("{d}", formatSeconds(length))}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? t("products.videoPauseSegment") : t("products.videoPlaySegment")}
              className="flex h-14 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
            >
              {playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
            </button>

            {/* Timeline : marges latérales pour que les poignées restent attrapables aux extrémités */}
            <div className="min-w-0 flex-1 px-4">
              <div
                ref={trackRef}
                onPointerDown={onTrackPointerDown}
                className="relative h-14 touch-none select-none rounded-lg bg-white/10"
              >
                <div className="absolute inset-0 flex overflow-hidden rounded-lg">
                  {thumbs.map((src, i) =>
                    src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />
                    ) : (
                      <span key={i} className="h-full flex-1 border-r border-black/20 bg-white/5" />
                    )
                  )}
                </div>
                {/* Hors sélection : assombri */}
                <div className="absolute inset-y-0 left-0 rounded-l-lg bg-black/65" style={{ width: pct(range.start) }} />
                <div className="absolute inset-y-0 right-0 rounded-r-lg bg-black/65" style={{ left: pct(range.end) }} />

                {/* Sélection (glisser pour la déplacer) */}
                <div
                  onPointerDown={(e) => startDrag("window", e)}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="absolute inset-y-0 cursor-grab border-y-[3px] border-primary active:cursor-grabbing"
                  style={{ left: pct(range.start), width: `calc(${pct(range.end)} - ${pct(range.start)})` }}
                />

                {/* Tête de lecture */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-white shadow"
                  style={{ left: pct(Math.min(Math.max(time, range.start), range.end)) }}
                />

                {(["start", "end"] as const).map((kind) => (
                  <div
                    key={kind}
                    role="slider"
                    tabIndex={0}
                    aria-label={kind === "start" ? t("products.videoHandleStart") : t("products.videoHandleEnd")}
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(kind === "start" ? range.start : range.end)}
                    aria-valuetext={formatClock(kind === "start" ? range.start : range.end)}
                    onPointerDown={(e) => startDrag(kind, e)}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => onHandleKey(kind, e)}
                    // Zone tactile de 32 px, poignée visible de 14 px collée au bord de la sélection.
                    className={cn(
                      "absolute inset-y-0 z-10 flex w-8 cursor-ew-resize items-center outline-none",
                      kind === "start" ? "-translate-x-full justify-end" : "justify-start"
                    )}
                    style={{ left: pct(kind === "start" ? range.start : range.end) }}
                  >
                    <span
                      className={cn(
                        "flex h-full w-3.5 items-center justify-center bg-primary ring-primary/40 [div:focus-visible>&]:ring-4",
                        kind === "start" ? "rounded-l-md" : "rounded-r-md"
                      )}
                    >
                      <span className="h-5 w-0.5 rounded-full bg-white/90" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 flex justify-between px-[52px] text-[11px] tabular-nums text-white/45">
            <span>00:00</span>
            <span>{formatClock(duration)}</span>
          </div>

          <div className="mt-4 flex gap-2.5">
            <Button type="button" variant="ghost" size="lg" onClick={onCancel} className="text-white/80 hover:bg-white/10 hover:text-white">
              {t("products.videoCancel")}
            </Button>
            <Button type="button" variant="accent" size="lg" className="flex-1" onClick={() => onConfirm(range)}>
              {t("products.videoUsePart")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
