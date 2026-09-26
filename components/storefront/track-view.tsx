"use client";

import * as React from "react";

/** Envoie une vue (boutique ou produit) une seule fois par affichage, sans bloquer la page. */
export function TrackView({ shopId, productId, type }: { shopId: string; productId?: string; type: "shop_view" | "product_view" }) {
  React.useEffect(() => {
    const src = new URLSearchParams(window.location.search).get("src");
    trackEvent({ shopId, productId: productId ?? null, type, source: src });
  }, [shopId, productId, type]);
  return null;
}

export function trackEvent(payload: { shopId: string; productId?: string | null; type: string; source?: string | null }) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch {
    // le suivi ne doit jamais gêner le visiteur
  }
}
