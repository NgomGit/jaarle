import Link from "next/link";
import { MapPin } from "lucide-react";
import { ThumbFallback } from "@/components/market/market-image";
import { ProductCard } from "@/components/storefront/templates/moderne/product-card";
import type { StorefrontProductCard } from "@/components/storefront/templates/types";
import { shopInitials } from "@/lib/shops/media";
import type { MarketProduct, MarketShop } from "@/lib/market/queries";
import { cn } from "@/lib/utils";

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full bg-[#EEECFD] px-1.5 text-[10.5px] font-extrabold tracking-[0.04em] text-[#3F34C4]",
        className,
      )}
    >
      PRO
    </span>
  );
}

/** Pastille des annonces mises en avant par Jaarle (spotlight) : honnête, toujours visible. */
export function FeaturedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full bg-[#F2B441] px-1.5 text-[10.5px] font-extrabold tracking-[0.02em] text-[#17151F]",
        className,
      )}
    >
      À la une
    </span>
  );
}

/**
 * Carte produit du Market = la carte des vitrines (ProductCard) : carte blanche bien délimitée,
 * photo, nom, prix, et les actions rapides WhatsApp, appel, partage. En plus : la boutique (logo,
 * nom, PRO) et sa ville. Les clics sont comptés avec la source « market » (message WhatsApp
 * « vu sur Jaarle Market »), et la fiche s'ouvre avec ?src=market (même canonique).
 */
export function MarketProductCard({ product }: { product: MarketProduct; priority?: boolean }) {
  const card: StorefrontProductCard = {
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceLabel: product.priceLabel,
    hasPrice: product.price != null,
    category: null,
    soldOut: product.soldOut,
    isNew: product.isNew,
    isService: product.isService,
    thumbUrl: product.thumbUrl,
    fullUrl: product.fullUrl,
    url: product.url,
    hasVideo: product.hasVideo,
  };
  return (
    <ProductCard
      shop={{ id: product.shop.id, slug: product.shop.slug, name: product.shop.name, phoneHref: product.shop.phoneHref }}
      product={card}
      source="market"
      linkSource="market"
      shopLabel={
        <span className="mb-1.5 block min-w-0">
          <Link
            href={`/boutique/${product.shop.slug}?src=market`}
            className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-gray-600 hover:text-gray-900"
          >
            <ShopDot logoUrl={product.shop.logoUrl} name={product.shop.name} size={20} />
            <span className="truncate">{product.shop.name}</span>
            {product.shop.isPro && <ProBadge className="h-[18px] px-1 text-[9.5px]" />}
            {product.boosted && <FeaturedBadge className="h-[18px] px-1.5 text-[9.5px]" />}
          </Link>
          {product.shop.city && (
            <span className="mt-0.5 flex min-w-0 items-center gap-1 pl-[26px] text-[11.5px] text-gray-400">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{product.shop.city}</span>
            </span>
          )}
        </span>
      }
    />
  );
}

/** Logo rond de la boutique (initiales si elle n'a pas de logo). */
function ShopDot({ logoUrl, name, size = 20 }: { logoUrl: string | null; name: string; size?: number }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full bg-white object-contain ring-1 ring-black/5"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-[#4F43E0] text-[9px] font-bold text-white"
      style={{ width: size, height: size }}
    >
      {shopInitials(name).slice(0, 2)}
    </span>
  );
}

/** Lien de fiche depuis le Market : même page (et même canonique), avec la source « market ». */
export function marketProductHref(url: string): string {
  // Lien relatif (navigation interne de Next.js), quelle que soit la forme de l'URL publique.
  const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
  return `${path}${path.includes("?") ? "&" : "?"}src=market`;
}

/** Grille de produits. `withSidebar` : 3 colonnes max (à côté des filtres), sinon 4. */
export function ProductGrid({ products, withSidebar = false, priorityCount = 0 }: { products: MarketProduct[]; priorityCount?: number; withSidebar?: boolean }) {
  return (
    <>
      <ThumbFallback />
      <ul className={cn("grid grid-cols-2 gap-3 sm:gap-5", withSidebar ? "md:grid-cols-3" : "sm:grid-cols-3 lg:grid-cols-4")}>
        {products.map((p, i) => (
          <li key={p.id}>
            <MarketProductCard product={p} priority={i < priorityCount} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Rangée de produits : défile au doigt sur mobile (2,3 cartes visibles), grille sur grand écran. */
export function ProductRail({ products, priorityCount = 0 }: { products: MarketProduct[]; priorityCount?: number }) {
  return (
    <>
      <ThumbFallback />
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {products.map((p, i) => (
          <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-auto">
            <MarketProductCard product={p} priority={i < priorityCount} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function MarketShopCard({ shop, compact = false }: { shop: MarketShop; compact?: boolean }) {
  const thumbs = shop.thumbs.slice(0, 3);
  const meta = [shop.categoryLabel, shop.city].filter(Boolean).join(" · ");
  return (
    <Link
      href={`${shop.url}?src=market`}
      className="group flex h-full flex-col gap-4 rounded-[22px] border border-[#ECE9E1] bg-white p-4 text-[#17151F] transition-colors hover:border-[#D9D5CB] sm:p-5"
    >
      <span className="flex items-center gap-3">
        {shop.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.logoUrl}
            alt=""
            width={52}
            height={52}
            loading="lazy"
            className="h-[52px] w-[52px] shrink-0 rounded-2xl bg-white object-contain p-1 ring-1 ring-black/5"
          />
        ) : (
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#EEECFD] font-[family-name:var(--font-market-display)] text-lg font-extrabold text-[#3F34C4]">
            {shopInitials(shop.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-[family-name:var(--font-market-display)] text-lg font-bold tracking-tight">{shop.name}</span>
            {shop.isPro && <ProBadge />}
          </span>
          <span className="block truncate text-[13px] text-[#77738A]">{meta || "Boutique"}</span>
        </span>
      </span>
      {!compact && thumbs.length > 0 && (
        <span className="grid grid-cols-3 gap-1.5">
          {thumbs.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t} src={t} alt="" width={120} height={120} loading="lazy" className="aspect-square w-full rounded-xl bg-[#EFEBE3] object-cover" />
          ))}
        </span>
      )}
      <span className="mt-auto flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-[#5E5A6B]">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            {shop.productCount} produit{shop.productCount > 1 ? "s" : ""}
            {shop.area ? ` · ${shop.area}` : ""}
          </span>
        </span>
        <span className="shrink-0 font-bold text-[#4F43E0] group-hover:underline">Voir la boutique</span>
      </span>
    </Link>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefFor: (p: number) => string;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1,
  );
  const base =
    "inline-flex h-11 min-w-11 items-center justify-center rounded-xl border px-3 font-bold";
  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex flex-wrap justify-center gap-2"
    >
      {page > 1 && (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          className={cn(base, "border-[#E4E1D8] bg-white")}
        >
          ← Précédent
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex gap-2">
          {i > 0 && nums[i - 1] !== n - 1 && (
            <span className="self-center text-[#8A8698]">…</span>
          )}
          <Link
            href={hrefFor(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              base,
              n === page
                ? "border-[#17151F] bg-[#17151F] text-white"
                : "border-[#E4E1D8] bg-white",
            )}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link
          href={hrefFor(page + 1)}
          rel="next"
          className={cn(base, "border-[#E4E1D8] bg-white")}
        >
          Suivant →
        </Link>
      )}
    </nav>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { name: string; href?: string }[];
}) {
  return (
    <nav aria-label="Fil d’Ariane" className="text-sm text-[#5E5A6B]">
      <ol className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            {i > 0 && <span aria-hidden>›</span>}
            {it.href ? (
              <Link href={it.href} className="hover:text-[#17151F]">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="font-bold text-[#17151F]">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
