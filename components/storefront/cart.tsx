"use client";

import * as React from "react";
import { Check, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { cartWhatsappHref, MAX_QTY, useCart, type CartItem } from "@/lib/storefront/cart-store";
import { cn } from "@/lib/utils";

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;

/** Bouton « Ajouter au panier » (icône sur les cartes, bouton texte sur la fiche). */
export function AddToCartButton({
  shopSlug,
  item,
  options = "",
  variant = "icon",
  className,
}: {
  shopSlug: string;
  item: Omit<CartItem, "qty" | "options">;
  options?: string;
  variant?: "icon" | "button";
  className?: string;
}) {
  const { add } = useCart(shopSlug);
  const [done, setDone] = React.useState(false);
  function onClick() {
    add({ ...item, options });
    setDone(true);
    window.setTimeout(() => setDone(false), 1400);
  }
  const Icon = done ? Check : ShoppingBag;
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={done ? `${item.name} ajouté au panier` : `Ajouter ${item.name} au panier`}
        title="Ajouter au panier"
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          done ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200",
          className
        )}
      >
        <Icon className="h-4 w-4" />
        {!done && <Plus className="absolute right-1.5 top-1.5 h-2.5 w-2.5" strokeWidth={3} aria-hidden />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors",
        done ? "bg-emerald-600 text-white" : "bg-white text-gray-900 ring-1 ring-black/15 hover:ring-black/30",
        className
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {done ? "Ajouté au panier" : "Ajouter au panier"}
    </button>
  );
}

/**
 * Panier de la boutique : bouton flottant (visible dès qu'il contient un article) + volet avec la
 * liste, les quantités, le total et « Envoyer la commande sur WhatsApp ».
 */
export function CartWidget({ shopSlug, shopName, aboveMobileBar = true }: { shopSlug: string; shopName: string; aboveMobileBar?: boolean }) {
  const { items, count, total, setQty, clear } = useCart(shopSlug);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (count === 0 && !open) return null;

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "fixed right-4 z-40 flex h-14 items-center gap-2.5 rounded-full bg-gray-900 pl-4 pr-5 text-[15px] font-semibold text-white shadow-[0_12px_30px_-8px_rgba(0,0,0,0.45)] sm:bottom-6",
            aboveMobileBar ? "bottom-[88px]" : "bottom-5"
          )}
        >
          <span className="relative">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sf-accent)] px-1 text-[11px] font-bold text-[var(--sf-accent-text)]">
              {count}
            </span>
          </span>
          Voir le panier
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Panier"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white text-gray-900 shadow-xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
              <div>
                <p className="text-lg font-bold">Votre panier</p>
                <p className="text-xs text-gray-500">Chez {shopName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {items.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-500">Votre panier est vide.</p>
            ) : (
              <ul className="flex-1 divide-y divide-black/5 overflow-y-auto px-5">
                {items.map((it, i) => (
                  <li key={`${it.slug}|${it.options}`} className="flex gap-3 py-3.5">
                    {it.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumbUrl} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-xl bg-gray-100 object-cover" />
                    ) : (
                      <span className="h-16 w-16 shrink-0 rounded-xl bg-gray-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">{it.name}</p>
                      {it.options && <p className="mt-0.5 text-xs text-gray-500">{it.options}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-full ring-1 ring-black/10">
                          <button type="button" onClick={() => setQty(i, it.qty - 1)} aria-label="Retirer un" className="flex h-9 w-9 items-center justify-center">
                            {it.qty === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                          </button>
                          <span className="min-w-6 text-center text-sm font-semibold" aria-label="Quantité">
                            {it.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(i, it.qty + 1)}
                            disabled={it.qty >= MAX_QTY}
                            aria-label="Ajouter un"
                            className="flex h-9 w-9 items-center justify-center disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-bold">{it.price != null ? fcfa(it.price * it.qty) : it.priceLabel}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {items.length > 0 && (
              <div className="border-t border-black/5 px-5 pb-5 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-gray-600">Total{total == null ? " (hors prix à confirmer)" : ""}</span>
                  <span className="text-xl font-bold">{fcfa(total ?? items.reduce((n, i) => n + (i.price ?? 0) * i.qty, 0))}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Livraison et paiement à convenir avec la boutique.</p>
                <a
                  href={cartWhatsappHref(shopSlug, items)}
                  rel="nofollow"
                  className="mt-4 flex h-12 items-center justify-center gap-2.5 rounded-full bg-[var(--sf-accent)] text-[15px] font-semibold text-[var(--sf-accent-text)]"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  Envoyer la commande sur WhatsApp
                </a>
                <button type="button" onClick={clear} className="mt-2 w-full py-2 text-center text-xs font-medium text-gray-500 hover:text-gray-800">
                  Vider le panier
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
