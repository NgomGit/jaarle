"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { MarketProductCard } from "@/components/market/cards";
import { ThumbFallback } from "@/components/market/market-image";
import { loadMoreMarketProducts, type MarketMoreQuery } from "@/app/market/actions";
import type { MarketProduct } from "@/lib/market/queries";
import { cn } from "@/lib/utils";

/**
 * Grille du Market avec défilement infini : la 1re page est rendue côté serveur (SEO, sans JS),
 * puis les pages suivantes se chargent toutes seules à l'approche du bas de la liste.
 * La pagination classique (`fallback`) reste dans la page pour les robots et sans JavaScript ;
 * une fois le JavaScript chargé, elle n'est plus visible (lecteurs d'écran : toujours là).
 *
 * Chaque carte garde data-product-id / data-shop-id / data-pos (position continue) pour le suivi
 * des clics après une recherche (SearchClickTracker).
 *
 * Le parent doit donner une `key` qui change avec les critères (recherche, filtres, tri) pour
 * repartir de zéro quand ils changent.
 */
export function InfiniteProductGrid({
  initialItems,
  total,
  startPage,
  pageSize,
  query,
  priorityCount = 0,
  fallback,
}: {
  initialItems: MarketProduct[];
  total: number;
  startPage: number;
  pageSize: number;
  query: MarketMoreQuery;
  priorityCount?: number;
  fallback?: React.ReactNode;
}) {
  const [items, setItems] = React.useState(initialItems);
  const [page, setPage] = React.useState(startPage);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [exhausted, setExhausted] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const sentinel = React.useRef<HTMLDivElement>(null);
  const busy = React.useRef(false);

  React.useEffect(() => setHydrated(true), []);

  const hasMore = !exhausted && page * pageSize < total;

  const loadMore = React.useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const next = page + 1;
      const res = await loadMoreMarketProducts(query, next);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
      });
      setPage(next);
      if (res.items.length < pageSize) setExhausted(true);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [hasMore, page, pageSize, query]);

  // Charge la suite quand le bas de la liste approche (≈ 2 écrans avant la fin).
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || failed || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, failed, loadMore]);

  const shown = (startPage - 1) * pageSize + items.length;

  return (
    <>
      <ThumbFallback />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {items.map((p, i) => (
          <li key={p.id} data-product-id={p.id} data-shop-id={p.shop.id} data-pos={i + 1}>
            <MarketProductCard product={p} priority={i < priorityCount} />
          </li>
        ))}
      </ul>

      <div ref={sentinel} aria-hidden className="h-px" />

      {hydrated && (
        <div className="mt-8 flex flex-col items-center gap-3 text-sm text-[#5E5A6B]" aria-live="polite">
          {loading && (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Chargement…
            </span>
          )}
          {!loading && hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="inline-flex h-11 items-center rounded-full border border-[#E4E1D8] bg-white px-5 font-bold text-[#17151F] hover:border-[#17151F]"
            >
              {failed ? "Réessayer" : "Voir plus"}
            </button>
          )}
          {total > pageSize && (
            <span className="text-xs text-[#8A8698]">
              {Math.min(shown, total)} sur {total} annonce{total > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {fallback && <div className={cn(hydrated && "sr-only")}>{fallback}</div>}
    </>
  );
}
