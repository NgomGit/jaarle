"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Galerie : glisser d'une photo à l'autre sur mobile, vignettes cliquables sur ordinateur. */
export function Gallery({ images, alt, soldOut }: { images: string[]; alt: string; soldOut: boolean }) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);

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

  if (images.length === 0) {
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
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={i === 0 ? alt : `${alt} — photo ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className={cn("aspect-square w-full shrink-0 snap-center object-cover", soldOut && "opacity-60")}
            />
          ))}
        </div>
        {images.length > 1 && (
          <>
            <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
              {index + 1}/{images.length}
            </span>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 sm:hidden">
              {images.map((_, i) => (
                <span key={i} className={cn("h-1.5 rounded-full bg-white transition-all", i === index ? "w-5" : "w-1.5 opacity-60")} />
              ))}
            </div>
          </>
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-gray-900/85 px-3 py-1 text-xs font-semibold text-white">Épuisé</span>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 hidden gap-2 sm:flex">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Photo ${i + 1}`}
              className={cn(
                "h-20 w-20 overflow-hidden rounded-xl ring-2 transition",
                i === index ? "ring-[var(--sf-accent)]" : "ring-transparent opacity-70 hover:opacity-100"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
