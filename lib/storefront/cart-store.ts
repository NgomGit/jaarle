"use client";

import * as React from "react";

// Panier d'une boutique, gardé dans le navigateur du client (localStorage, une clé par boutique) :
// pas de compte, pas de base de données. Le message WhatsApp est construit par le serveur à partir
// des slugs et quantités (/r/wa/{boutique}?cart=…), avec les vrais prix — jamais ceux du navigateur.

export interface CartItem {
  slug: string;
  name: string;
  priceLabel: string;
  price: number | null;
  thumbUrl: string | null;
  qty: number;
  options: string; // ex. « Taille : M, Couleur : Noir » ; "" si aucune
}

export const MAX_CART_ITEMS = 20;
export const MAX_QTY = 20;

const key = (shopSlug: string) => `jaarle-cart:${shopSlug}`;
const EVENT = "jaarle-cart-change";

function read(shopSlug: string): CartItem[] {
  try {
    const raw = window.localStorage.getItem(key(shopSlug));
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.slug === "string" && i.qty > 0) : [];
  } catch {
    return [];
  }
}

function write(shopSlug: string, items: CartItem[]) {
  try {
    window.localStorage.setItem(key(shopSlug), JSON.stringify(items.slice(0, MAX_CART_ITEMS)));
  } catch {
    // stockage indisponible (navigation privée) : le panier ne survit pas au rechargement
  }
  memory.set(shopSlug, items.slice(0, MAX_CART_ITEMS));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: shopSlug }));
}

// Copie en mémoire : le panier marche même si localStorage est bloqué.
const memory = new Map<string, CartItem[]>();
const EMPTY: CartItem[] = [];

function snapshot(shopSlug: string): CartItem[] {
  if (!memory.has(shopSlug)) memory.set(shopSlug, read(shopSlug));
  return memory.get(shopSlug)!;
}

export function useCart(shopSlug: string) {
  const items = React.useSyncExternalStore(
    (cb) => {
      const onChange = (e: Event) => {
        if (!(e instanceof CustomEvent) || e.detail === shopSlug) cb();
      };
      const onStorage = (e: StorageEvent) => {
        if (e.key === key(shopSlug)) {
          memory.set(shopSlug, read(shopSlug));
          cb();
        }
      };
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => snapshot(shopSlug),
    () => EMPTY
  );

  const add = React.useCallback(
    (item: Omit<CartItem, "qty">, qty = 1) => {
      const list = [...snapshot(shopSlug)];
      const i = list.findIndex((x) => x.slug === item.slug && x.options === item.options);
      if (i >= 0) list[i] = { ...list[i], ...item, qty: Math.min(MAX_QTY, list[i].qty + qty) };
      else if (list.length < MAX_CART_ITEMS) list.push({ ...item, qty: Math.min(MAX_QTY, qty) });
      write(shopSlug, list);
    },
    [shopSlug]
  );

  const setQty = React.useCallback(
    (index: number, qty: number) => {
      const list = [...snapshot(shopSlug)];
      if (!list[index]) return;
      if (qty <= 0) list.splice(index, 1);
      else list[index] = { ...list[index], qty: Math.min(MAX_QTY, qty) };
      write(shopSlug, list);
    },
    [shopSlug]
  );

  const clear = React.useCallback(() => write(shopSlug, []), [shopSlug]);

  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.every((i) => i.price != null) ? items.reduce((n, i) => n + (i.price ?? 0) * i.qty, 0) : null;
  return { items, count, total, add, setQty, clear };
}

/** Lien WhatsApp du panier : le serveur reconstruit le message (noms, prix réels, total). */
export function cartWhatsappHref(shopSlug: string, items: CartItem[]): string {
  const compact = items.map((i) => ({ s: i.slug, q: i.qty, ...(i.options ? { o: i.options } : {}) }));
  return `/r/wa/${shopSlug}?${new URLSearchParams({ cart: JSON.stringify(compact), src: "cart" }).toString()}`;
}
