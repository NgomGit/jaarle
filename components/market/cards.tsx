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

function ShopDot({
  logoUrl,
  name,
  size = 20,
}: {
  logoUrl: string | null;
  name: string;
  size?: number;
}) {
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

/**
 * Carte produit du Market = la carte de la vitrine des boutiques (ProductCard), avec en plus la
 * ligne « boutique + PRO » et la source « market » pour les statistiques du vendeur.
 */
export function MarketProductCard({ product }: { product: MarketProduct }) {
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
  };
  return (
    <ProductCard
      shop={{ id: product.shop.id, slug: product.shop.slug, name: product.shop.name, phoneHref: product.shop.phoneHref }}
      product={card}
      source="market"
      shopLabel={
        <Link
          href={`/boutique/${product.shop.slug}`}
          className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 hover:text-gray-900"
        >
          <ShopDot logoUrl={product.shop.logoUrl} name={product.shop.name} size={18} />
          <span className="truncate">{product.shop.name}</span>
          <ProBadge />
        </Link>
      }
    />
  );
}

/** Grille de produits. `withSidebar` : 3 colonnes max (à côté des filtres), sinon 4. */
export function ProductGrid({ products, withSidebar = false }: { products: MarketProduct[]; priorityCount?: number; withSidebar?: boolean }) {
  return (
    <>
      <ThumbFallback />
      <ul className={cn("grid grid-cols-2 gap-3 sm:gap-5", withSidebar ? "md:grid-cols-3" : "sm:grid-cols-3 lg:grid-cols-4")}>
        {products.map((p) => (
          <li key={p.id}>
            <MarketProductCard product={p} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function MarketShopCard({ shop }: { shop: MarketShop }) {
  const thumbs = shop.thumbs.slice(0, 3);
  return (
    <Link
      href={shop.url}
      className="flex h-full flex-col gap-4 rounded-[22px] border border-[#ECE9E1] bg-white p-5 text-[#17151F] transition-shadow hover:shadow-[0_14px_34px_-16px_rgba(23,21,31,0.25)]"
    >
      <span className="flex items-center gap-3.5">
        {shop.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.logoUrl}
            alt=""
            width={56}
            height={56}
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1 ring-1 ring-black/5"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#4F43E0] font-[family-name:var(--font-market-display)] text-xl font-extrabold text-white">
            {shopInitials(shop.name)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-[family-name:var(--font-market-display)] text-xl font-bold tracking-tight">
            {shop.name}
          </span>
          <span className="block truncate text-sm text-[#5E5A6B]">
            {shop.categoryLabel ?? "Boutique"}
          </span>
        </span>
      </span>
      {thumbs.length > 0 && (
        <span className="grid grid-cols-4 gap-1.5">
          {thumbs.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t}
              src={t}
              alt=""
              width={120}
              height={120}
              loading="lazy"
              className="aspect-square w-full rounded-xl bg-[#EFEBE3] object-cover"
            />
          ))}
          <span className="flex aspect-square items-center justify-center rounded-xl bg-[#F2F0EA] text-[13px] font-extrabold text-[#4A4656]">
            {shop.productCount > thumbs.length
              ? `+${shop.productCount - thumbs.length}`
              : "Voir"}
          </span>
        </span>
      )}
      <span className="mt-auto flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-[#4A4656]">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{shop.area ?? "Sénégal"}</span>
        </span>
        {shop.listed && <ProBadge />}
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
