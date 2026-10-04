"use client";

import * as React from "react";
import { ImageOff, Play } from "lucide-react";
import { trackEvent } from "@/components/storefront/track-view";
import type { StorefrontProductVideo } from "@/components/storefront/templates/types";
import { cn } from "@/lib/utils";

type Slide = { kind: "image"; src: string } | { kind: "video"; video: StorefrontProductVideo };

/**
 * Galerie : glisser d'une photo à l'autre sur mobile, vignettes cliquables sur ordinateur.
 * La vidéo (s'il y en a une) est le 2ᵉ élément : la 1ʳᵉ photo reste l'image principale.
 * Rien de la vidéo n'est téléchargé avant le clic sur lecture (preload="none" + poster).
 */
export function Gallery({
  images,
  alt,
  soldOut,
  video = null,
  track,
}: {
  images: string[];
  alt: string;
  soldOut: boolean;
  video?: StorefrontProductVideo | null;
  /** Statistiques : boutique / produit pour l'événement product_video_play. */
  track?: { shopId: string; productId: string };
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);

  const slides = React.useMemo<Slide[]>(() => {
    const list: Slide[] = images.map((src) => ({ kind: "image", src }));
    if (video) list.splice(Math.min(1, list.length), 0, { kind: "video", video });
    return list;
  }, [images, video]);
  const videoIndex = slides.findIndex((s) => s.kind === "video");

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  }

  if (slides.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-3xl bg-gray-100 text-gray-400">
        <ImageOff className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl bg-gray-100 [scrollbar-width:none]"
        >
          {slides.map((slide, i) =>
            slide.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={slide.src}
                src={slide.src}
                alt={i === 0 ? alt : `${alt} — photo ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                className={cn("aspect-square w-full shrink-0 snap-center object-cover", soldOut && "opacity-60")}
              />
            ) : (
              <VideoSlide
                key="video"
                video={slide.video}
                fallbackPoster={images[0] ?? null}
                alt={alt}
                active={index === i}
                onFirstPlay={() => {
                  if (index !== i) goTo(i);
                  if (track) trackEvent({ shopId: track.shopId, productId: track.productId, type: "product_video_play" });
                }}
              />
            )
          )}
        </div>
        {slides.length > 1 && (
          <>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
              {index + 1}/{slides.length}
            </span>
            {/* Points masqués sur la vidéo : ils gêneraient ses contrôles. */}
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 sm:hidden",
                index === videoIndex && "hidden"
              )}
            >
              {slides.map((_, i) => (
                <span key={i} className={cn("h-1.5 rounded-full bg-white transition-all", i === index ? "w-5" : "w-1.5 opacity-60")} />
              ))}
            </div>
          </>
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-gray-900/85 px-3 py-1 text-xs font-semibold text-white">Épuisé</span>
        )}
      </div>

      {slides.length > 1 && (
        <div className="mt-3 hidden gap-2 sm:flex">
          {slides.map((slide, i) => (
            <button
              key={slide.kind === "image" ? slide.src : "video"}
              type="button"
              onClick={() => goTo(i)}
              aria-label={slide.kind === "video" ? "Vidéo" : `Photo ${i + 1}`}
              className={cn(
                "relative h-20 w-20 overflow-hidden rounded-xl bg-gray-900 ring-2 transition",
                i === index ? "ring-[var(--sf-accent)]" : "ring-transparent opacity-70 hover:opacity-100"
              )}
            >
              {slide.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slide.src} alt="" className="h-full w-full object-cover" />
              ) : (
                <>
                  {(slide.video.posterUrl ?? images[0]) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(slide.video.posterUrl ?? images[0]) as string} alt="" className="h-full w-full object-cover opacity-80" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60">
                      <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
                    </span>
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Vidéo de la fiche : poster + gros bouton lecture ; le fichier ne se charge qu'au clic. */
function VideoSlide({
  video,
  fallbackPoster,
  alt,
  active,
  onFirstPlay,
}: {
  video: StorefrontProductVideo;
  fallbackPoster: string | null;
  alt: string;
  active: boolean;
  onFirstPlay: () => void;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [started, setStarted] = React.useState(false);
  const tracked = React.useRef(false);

  // Glissé vers une autre photo : la vidéo se met en pause.
  React.useEffect(() => {
    if (!active) ref.current?.pause();
  }, [active]);

  function start() {
    setStarted(true);
    const v = ref.current;
    if (v) void v.play().catch(() => undefined);
  }

  return (
    <div className="relative aspect-square w-full shrink-0 snap-center bg-black">
      <video
        ref={ref}
        src={video.url}
        poster={video.posterUrl ?? fallbackPoster ?? undefined}
        preload="none"
        playsInline
        controls={started}
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        aria-label={`Vidéo — ${alt}`}
        onPlay={() => {
          setStarted(true);
          if (!tracked.current) {
            tracked.current = true;
            onFirstPlay();
          }
        }}
        className="h-full w-full object-contain"
      />
      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label={`Lire la vidéo — ${alt}`}
          className="group absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-105 group-active:scale-95">
            <Play className="ml-1 h-7 w-7 fill-gray-900 text-gray-900" />
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
            Vidéo · {Math.round(video.durationMs / 1000)} s
          </span>
        </button>
      )}
    </div>
  );
}
