import Link from "next/link";
import { MapPin, ShieldCheck } from "lucide-react";
import { ProductBackLink } from "@/components/storefront/product-back-link";
import { ProductOrder } from "@/components/storefront/product-order";
import { CartWidget } from "@/components/storefront/cart";
import { ReportButton } from "@/components/storefront/report-button";
import { ShareButton } from "@/components/storefront/share-button";
import { TrackView } from "@/components/storefront/track-view";
import { Gallery } from "@/components/storefront/templates/moderne/gallery";
import { ProductCard } from "@/components/storefront/templates/moderne/product-card";
import { ShopLogo, StoreFooter, StoreHeader, themeStyle } from "@/components/storefront/templates/moderne/parts";
import type { ProductViewProps } from "@/components/storefront/templates/types";
import { cn } from "@/lib/utils";

/** Template « Moderne » — fiche produit. */
export function ModerneProductView({ shop, product, related, theme, marketCategory }: ProductViewProps) {
  return (
    <div style={themeStyle(theme)} className="min-h-screen bg-[#F7F7F5] pb-28 text-gray-900 [color-scheme:light] sm:pb-0">
      <TrackView shopId={shop.id} productId={product.id} type="product_view" />
      <StoreHeader shop={shop} backToShop />

      <main className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <ProductBackLink shopSlug={shop.slug} marketCategory={marketCategory} />

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-12">
          <Gallery
            images={product.images}
            alt={product.name}
            soldOut={product.soldOut}
            video={product.video}
            track={{ shopId: shop.id, productId: product.id }}
          />

          <div className="lg:pt-2">
            {product.category && (
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sf-accent)]">{product.category}</p>
            )}
            <h1 className="mt-1.5 text-2xl font-bold leading-tight tracking-tight sm:text-[32px]">{product.name}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className={cn("text-2xl font-bold", !product.hasPrice && "text-xl text-gray-600")}>{product.priceLabel}</p>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                  product.soldOut ? "bg-gray-200 text-gray-700" : "bg-emerald-50 text-emerald-700"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", product.soldOut ? "bg-gray-500" : "bg-emerald-500")} />
                {product.isService ? (product.soldOut ? "Indisponible pour le moment" : "Prestation de service") : product.soldOut ? "Épuisé pour le moment" : "Disponible"}
              </span>
            </div>
            {/* Où se trouve le vendeur : visible avant de le contacter. */}
            {shop.location && (
              <p className="mt-2.5 flex items-center gap-1.5 text-sm text-gray-600">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span>
                  {shop.name} · {shop.location}
                </span>
              </p>
            )}

            {product.description && (
              <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-gray-600">{product.description}</p>
            )}

            <div className="mt-6">
              <ProductOrder
                shopSlug={shop.slug}
                productSlug={product.slug}
                productName={product.name}
                priceLabel={product.priceLabel}
                options={product.options}
                soldOut={product.soldOut}
                isService={product.isService}
                cartItem={{ slug: product.slug, name: product.name, priceLabel: product.priceLabel, price: product.price ?? null, thumbUrl: product.thumbUrl }}
              />
            </div>

            <ShareButton
              url={product.url}
              title={product.name}
              text={`${product.name} — ${product.priceLabel} chez ${shop.name} :`}
              shopId={shop.id}
              productId={product.id}
              label="Partager ce produit"
              className="mt-3 h-12 w-full"
            />

            <div className="mt-6 flex gap-3 rounded-2xl bg-[var(--sf-accent-soft)] p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sf-accent)]" />
              <p className="text-[13px] leading-relaxed text-gray-700">
                <span className="font-semibold text-gray-900">Commande en direct avec {shop.name}.</span> WhatsApp s&apos;ouvre avec
                un message prêt. Confirmez la disponibilité, la livraison et le paiement avec le vendeur avant de régler quoi que ce soit.
              </p>
            </div>

            <Link
              href={`/boutique/${shop.slug}`}
              className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-black/5 transition-colors hover:bg-gray-50"
            >
              <ShopLogo shop={shop} size={44} className="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{shop.name}</p>
                <p className="truncate text-xs text-gray-500">
                  {[shop.categoryLabel, `${shop.productCount} produit${shop.productCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                </p>
                {shop.location && (
                  <p className="flex items-center gap-1 truncate text-xs text-gray-500">
                    <MapPin className="h-3 w-3" />
                    {shop.location}
                  </p>
                )}
              </div>
              <span className="text-xs font-semibold text-[var(--sf-accent)]">Voir la boutique</span>
            </Link>
            <ReportButton shopSlug={shop.slug} shopName={shop.name} productSlug={product.slug} productName={product.name} className="mt-4" />
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-4 text-xl font-bold tracking-tight">Vous aimerez aussi</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
              {related.map((p) => (
                <li key={p.id}>
                  <ProductCard shop={{ id: shop.id, slug: shop.slug, name: shop.name, phoneHref: shop.phoneHref }} product={p} cart />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <StoreFooter shop={shop} />
      <CartWidget shopSlug={shop.slug} shopName={shop.name} />
    </div>
  );
}
