"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Lien de retour de la fiche produit. Visiteur venu de Jaarle Market (?src=market) : retour au
 * Market (et à la catégorie du produit) ; sinon : retour à la boutique, comme avant.
 * Lu après hydratation : la page reste en cache (ISR) pour tout le monde.
 */
export function ProductBackLink({ shopSlug, marketCategory }: { shopSlug: string; marketCategory?: { slug: string; label: string } | null }) {
  const [fromMarket, setFromMarket] = React.useState(false);
  React.useEffect(() => setFromMarket(new URLSearchParams(window.location.search).get("src") === "market"), []);

  if (fromMarket) {
    return (
      <nav aria-label="Fil d’Ariane" className="mb-4 flex min-w-0 items-center gap-1.5 text-sm font-medium text-gray-500">
        <Link href="/market" className="inline-flex shrink-0 items-center gap-1.5 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Jaarle Market
        </Link>
        {marketCategory && (
          <>
            <span aria-hidden>›</span>
            <Link href={`/market/${marketCategory.slug}`} className="truncate hover:text-gray-900">
              {marketCategory.label}
            </Link>
          </>
        )}
      </nav>
    );
  }
  return (
    <Link href={`/boutique/${shopSlug}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" />
      Tous les produits
    </Link>
  );
}
