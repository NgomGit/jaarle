"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";

/** Image produit : miniature 400 px, avec repli sur l'original si la miniature n'existe pas (anciennes photos). */
export function MarketImage({
  src,
  fallback,
  alt,
  className,
  priority = false,
}: {
  src: string | null;
  fallback?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [current, setCurrent] = React.useState(src ?? fallback ?? null);
  if (!current) {
    return (
      <span className="flex h-full w-full items-center justify-center text-[#8A8698]">
        <ImageOff className="h-6 w-6" aria-hidden />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      width={400}
      height={500}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
      onError={() => {
        if (fallback && current !== fallback) setCurrent(fallback);
      }}
    />
  );
}

/** Miniature absente (anciennes photos) → photo originale (attribut data-full), comme la vitrine. */
export function ThumbFallback() {
  React.useEffect(() => {
    const onError = (e: Event) => {
      const img = e.target as HTMLImageElement;
      const full = img?.dataset?.full;
      if (img?.tagName === "IMG" && full && img.src !== full) img.src = full;
    };
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
