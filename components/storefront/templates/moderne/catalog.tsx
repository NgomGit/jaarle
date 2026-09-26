"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { ProductCard, type CardShop } from "@/components/storefront/templates/moderne/product-card";
import type { StorefrontProductCard } from "@/components/storefront/templates/types";
import { cn } from "@/lib/utils";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Catalogue : recherche (dès 6 articles), filtres par catégorie, grille responsive. */
export function Catalog({ shop, products }: { shop: CardShop; products: StorefrontProductCard[] }) {
  const categories = Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c)));
  const [active, setActive] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const q = normalize(query.trim());
  const shown = products.filter(
    (p) => (!active || p.category === active) && (!q || normalize(`${p.name} ${p.category ?? ""}`).includes(q))
  );

  // Miniature absente (ancienne photo) → photo originale.
  React.useEffect(() => {
    const onError = (e: Event) => {
      const img = e.target as HTMLImageElement;
      const full = img?.dataset?.full;
      if (img?.tagName === "IMG" && full && img.src !== full) img.src = full;
    };
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);

  return (
    <section id="produits" className="scroll-mt-20">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Nos produits</h2>
        <span className="text-sm text-gray-500">
          {products.length} article{products.length > 1 ? "s" : ""}
        </span>
      </div>

      {products.length >= 6 && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit"
            className="h-11 w-full rounded-full border border-black/10 bg-white pl-11 pr-10 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-[var(--sf-accent)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer"
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-gray-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {categories.length >= 2 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setActive(c)}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
                active === c
                  ? "bg-[var(--sf-accent)] text-[var(--sf-accent-text)]"
                  : "border border-black/10 bg-white text-gray-700 hover:bg-gray-50"
              )}
            >
              {c ?? "Tout"}
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id}>
              <ProductCard shop={shop} product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-black/10 px-6 py-10 text-center text-sm text-gray-500">
          Aucun produit ne correspond à ta recherche.
        </p>
      )}
    </section>
  );
}
