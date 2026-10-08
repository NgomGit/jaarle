"use client";

import * as React from "react";

// Compte les clics sur les résultats d'une recherche du Market (fiche, WhatsApp, appel, boutique).
// Écoute les clics de la grille (délégation) : chaque carte porte data-product-id / data-shop-id /
// data-pos (ProductGrid). Un même clic (produit + action) n'est envoyé qu'une fois par recherche.

type Action = "open" | "whatsapp" | "call" | "shop";

function actionFor(href: string): Action | null {
  if (href.startsWith("tel:")) return "call";
  if (href.includes("/r/wa/")) return "whatsapp";
  if (/\/boutique\/[^/]+\/p\//.test(href)) return "open";
  if (/\/boutique\/[^/?]+/.test(href)) return "shop";
  return null;
}

export function SearchClickTracker({ q, offset = 0, children }: { q: string; offset?: number; children: React.ReactNode }) {
  const sent = React.useRef(new Set<string>());
  React.useEffect(() => {
    sent.current = new Set();
  }, [q]);

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (q.trim().length < 2) return;
    const target = e.target as HTMLElement;
    const link = target.closest("a");
    const card = target.closest<HTMLElement>("[data-product-id]");
    if (!link || !card) return;
    const action = actionFor(link.getAttribute("href") ?? "");
    const productId = card.dataset.productId;
    const shopId = card.dataset.shopId;
    if (!action || !productId || !shopId) return;
    const key = `${productId}|${action}`;
    if (sent.current.has(key)) return;
    sent.current.add(key);
    const pos = Number(card.dataset.pos);
    try {
      const body = JSON.stringify({ q, productId, shopId, action, position: Number.isFinite(pos) && pos > 0 ? pos + offset : null });
      if (!navigator.sendBeacon?.("/api/market/search-click", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/market/search-click", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      }
    } catch {
      // journal facultatif
    }
  }

  return <div onClickCapture={onClickCapture}>{children}</div>;
}
