"use client";

import type * as React from "react";
import Link from "next/link";
import { ImageOff, Phone } from "lucide-react";
import { AddToCartButton } from "@/components/storefront/cart";
import { ShareButton } from "@/components/storefront/share-button";
import { trackEvent } from "@/components/storefront/track-view";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import type { StorefrontProductCard, StorefrontShop } from "@/components/storefront/templates/types";
import { cn } from "@/lib/utils";

export type CardShop = Pick<StorefrontShop, "id" | "slug" | "name" | "phoneHref">;

/**
 * Carte produit : fond blanc bien délimité, photo, nom, prix et 3 actions rapides
 * (WhatsApp avec message pré-rempli, appel, partage) sans avoir à ouvrir la fiche.
 */
export function ProductCard({
  shop,
  product,
  shopLabel,
  source = "card",
  cart = false,
  linkSource,
}: {
  shop: CardShop;
  product: StorefrontProductCard;
  /** Jaarle Market : ligne « boutique + PRO » au-dessus du nom (absente dans la vitrine). */
  shopLabel?: React.ReactNode;
  /** Source enregistrée pour le clic WhatsApp / appel (statistiques du vendeur). */
  source?: string;
  /** Vitrine : bouton « Ajouter au panier » (à la place de Partager) pour les produits disponibles. */
  cart?: boolean;
  /** Jaarle Market : la fiche s'ouvre avec ?src=… (contexte Market, même canonique). */
  linkSource?: string;
}) {
  const href = `/boutique/${shop.slug}/p/${product.slug}${linkSource ? `?src=${encodeURIComponent(linkSource)}` : ""}`;
  const waHref = `/r/wa/${shop.slug}?${new URLSearchParams({ p: product.slug, src: source }).toString()}`;

  return (
    <article className="group flex h-full flex-col rounded-3xl bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-12px_rgba(0,0,0,0.18)]">
      <Link href={href} className="relative block aspect-square overflow-hidden rounded-[20px] bg-gray-100">
        {product.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.thumbUrl}
            alt={product.name}
            loading="lazy"
            width={400}
            height={400}
            className={cn(
              "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]",
              product.soldOut && "opacity-55 grayscale-[30%]"
            )}
            data-full={product.fullUrl ?? undefined}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-gray-400">
            <ImageOff className="h-6 w-6" />
          </span>
        )}
        {product.isService ? (
          // Service : badge distinct (vert sauge), toujours affiché.
          <span className="absolute left-2.5 top-2.5 rounded-full bg-[#1F6F5C] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
            Service
          </span>
        ) : product.soldOut ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-gray-900/85 px-2.5 py-1 text-[11px] font-semibold text-white">
            Épuisé
          </span>
        ) : (
          product.isNew && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm">
              Nouveau
            </span>
          )
        )}
      </Link>

      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-3 sm:px-2">
        {shopLabel}
        <Link href={href} className="line-clamp-2 text-[14px] font-medium leading-snug text-gray-800 hover:text-gray-950">
          {product.name}
        </Link>
        <p
          className={cn(
            "mt-1 text-[16px] font-bold",
            product.hasPrice ? "text-[var(--sf-accent)]" : "text-sm font-semibold text-gray-500"
          )}
        >
          {product.priceLabel}
        </p>

        <div className="mt-auto flex items-center gap-1.5 pt-3">
          <a
            href={waHref}
            rel="nofollow"
            aria-label={
              product.isService
                ? `Réserver ${product.name} sur WhatsApp`
                : product.soldOut
                  ? `Demander la disponibilité de ${product.name} sur WhatsApp`
                  : `Commander ${product.name} sur WhatsApp`
            }
            title={product.isService ? "Réserver sur WhatsApp" : "Commander sur WhatsApp"}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--sf-accent)] text-[13px] font-semibold text-[var(--sf-accent-text)] transition-opacity hover:opacity-90"
          >
            <WhatsAppIcon className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">{product.isService ? "Réserver" : product.soldOut ? "Demander" : "Commander"}</span>
          </a>
          <a
            href={shop.phoneHref}
            onClick={() => trackEvent({ shopId: shop.id, productId: product.id, type: "call_click", source })}
            aria-label={`Appeler ${shop.name}`}
            title="Appeler"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-800 transition-colors hover:bg-gray-200"
          >
            <Phone className="h-4 w-4" />
          </a>
          {cart && !product.isService && !product.soldOut ? (
            <AddToCartButton
              shopSlug={shop.slug}
              item={{ slug: product.slug, name: product.name, priceLabel: product.priceLabel, price: product.price ?? null, thumbUrl: product.thumbUrl }}
            />
          ) : (
          <ShareButton
            variant="icon"
            url={product.url}
            title={product.name}
            text={`${product.name} — ${product.priceLabel} chez ${shop.name} :`}
            shopId={shop.id}
            productId={product.id}
            label="Partager"
            className="h-10 w-10 shrink-0 border-0 bg-gray-100 hover:bg-gray-200"
          />
          )}
        </div>
      </div>
    </article>
  );
}
