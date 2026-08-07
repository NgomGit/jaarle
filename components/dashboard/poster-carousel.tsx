"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carrousel (diaporama) pour afficher une ou plusieurs affiches d'une création (variante 1,
 * variante 2 Gold...). Une seule affiche visible à la fois, avec flèches et points. `focusIndex`
 * permet de sauter sur une affiche précise (ex : afficher la variante 2 juste après sa génération).
 */
export function PosterCarousel({
  images,
  alt,
  locked = false,
  labelFor,
  focusIndex,
  firstSlideOverlay,
}: {
  images: string[];
  alt: string;
  locked?: boolean;
  labelFor?: (i: number) => string;
  focusIndex?: number;
  firstSlideOverlay?: React.ReactNode;
}) {
  const count = images.length;
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (focusIndex != null && focusIndex >= 0 && focusIndex < count) setIndex(focusIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIndex]);

  React.useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1));
  }, [count, index]);

  if (count === 0) return null;
  const go = (d: number) => setIndex((i) => (i + d + count) % count);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
      <img
        src={images[index]}
        alt={alt}
        className="max-h-[420px] w-full select-none object-contain [-webkit-touch-callout:none]"
        draggable={locked ? false : undefined}
        onContextMenu={locked ? (e) => e.preventDefault() : undefined}
        onDragStart={locked ? (e) => e.preventDefault() : undefined}
      />

      {labelFor && (
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white">
          {labelFor(index)}
        </span>
      )}

      {index === 0 && firstSlideOverlay}

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Affiche précédente"
            className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Affiche suivante"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Aller à l'affiche ${i + 1}`}
                className={cn("h-2 rounded-full transition-all", i === index ? "w-5 bg-white" : "w-2 bg-white/60")}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
