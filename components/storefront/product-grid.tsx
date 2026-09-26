"use client";

import * as React from "react";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GridProduct {
  slug: string;
  name: string;
  priceLabel: string;
  category: string | null;
  soldOut: boolean;
  thumbUrl: string | null;
  fullUrl: string | null;
}

/** Grille produits de la boutique publique, avec filtre par catégorie (si 2 catégories ou plus). */
export function ProductGrid({ shopSlug, products }: { shopSlug: string; products: GridProduct[] }) {
  const categories = Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c)));
  const [active, setActive] = React.useState<string | null>(null);
  const shown = active ? products.filter((p) => p.category === active) : products;

  return (
    <div>
      {categories.length >= 2 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setActive(c)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active === c ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"
              )}
            >
              {c ?? "Tout"}
            </button>
          ))}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((p) => (
          <li key={p.slug}>
            <Link href={`/boutique/${shopSlug}/p/${p.slug}`} className="group block">
              <div className="relative mb-2 aspect-square overflow-hidden rounded-2xl bg-muted">
                {p.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbUrl}
                    alt={p.name}
                    loading="lazy"
                    width={400}
                    height={400}
                    className={cn("h-full w-full object-cover transition-transform group-hover:scale-[1.02]", p.soldOut && "opacity-60")}
                    onError={(e) => {
                      if (p.fullUrl && e.currentTarget.src !== p.fullUrl) e.currentTarget.src = p.fullUrl;
                    }}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                  </span>
                )}
                {p.soldOut && (
                  <span className="absolute left-2 top-2 rounded-full bg-foreground/85 px-2.5 py-1 text-[11px] font-semibold text-background">
                    Épuisé
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
              <p className="mt-0.5 text-sm font-bold">{p.priceLabel}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
