"use client";

import * as React from "react";

// Enregistre une recherche du Market quand le visiteur s'est arrêté de taper : la recherche
// instantanée change l'URL à chaque pause (r → ro → robe), ce composant est remonté à chaque
// nouvelle recherche (key) et n'envoie rien si une autre arrive avant le délai.
const SETTLE_MS = 2500;

export function SearchLogger({ q, results, city, category }: { q: string; results: number; city: string | null; category: string | null }) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const body = JSON.stringify({ q, results, city, category });
        if (!navigator.sendBeacon?.("/api/market/search-log", new Blob([body], { type: "application/json" }))) {
          void fetch("/api/market/search-log", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
        }
      } catch {
        // journal facultatif
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [q, results, city, category]);
  return null;
}
