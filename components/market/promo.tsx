import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { ProBadge, ProductRail } from "@/components/market/cards";
import { MarketImage } from "@/components/market/market-image";
import { shopInitials } from "@/lib/shops/media";
import type { MarketBanner, MarketProduct } from "@/lib/market/queries";
import { cn } from "@/lib/utils";

// Mises en avant des boutiques Pro sur le Market (migration 0026) :
// • PromoBanner : bannière programmée par Jaarle (titre, sous-titre, visuel, bouton) ;
// • ProPicks : « Sélection PRO » du jour, quand aucune bannière n'est programmée.

export function PromoBanner({ banner, compact = false, priority = false }: { banner: MarketBanner; compact?: boolean; priority?: boolean }) {
  return (
    <Link
      href={banner.href}
      className={cn(
        "group grid overflow-hidden rounded-[26px] bg-[#17151F] text-white transition-shadow hover:shadow-[0_18px_40px_-18px_rgba(23,21,31,0.55)]",
        compact ? "grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)]" : "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
      )}
    >
      <span className={cn("relative block bg-[#2A2735]", compact ? "min-h-[132px]" : "aspect-[16/9] sm:order-2 sm:aspect-auto sm:min-h-[300px]")}>
        {banner.imageUrl ? (
          <MarketImage
            src={banner.imageUrl}
            fallback={banner.imageUrl}
            alt={banner.title}
            priority={priority}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-market-display)] text-5xl font-extrabold text-white/80">
            {shopInitials(banner.shop.name)}
          </span>
        )}
      </span>
      <span className={cn("flex min-w-0 flex-col justify-center", compact ? "gap-1.5 p-4 sm:p-6" : "gap-3 p-6 sm:p-10")}>
        <span className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-[#C9C6D6]">
          <span className="inline-flex h-5 items-center rounded-full bg-[#F2B441] px-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[#17151F]">À la une</span>
          {banner.shop.name !== banner.title && <span className="truncate">{banner.shop.name}</span>}
          <ProBadge className="bg-white/15 text-white" />
        </span>
        <span
          className={cn(
            "font-[family-name:var(--font-market-display)] font-extrabold leading-[1.02] tracking-tight",
            compact ? "line-clamp-2 text-xl sm:text-2xl" : "text-[30px] sm:text-[44px]"
          )}
        >
          {banner.title}
        </span>
        {banner.subtitle && <span className={cn("text-[#D6D3E2]", compact ? "line-clamp-2 text-sm" : "text-base sm:text-lg")}>{banner.subtitle}</span>}
        <span className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", compact ? "mt-1" : "mt-3")}>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-white font-extrabold text-[#17151F]", compact ? "h-9 px-4 text-sm" : "h-12 px-5")}>
            {banner.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
          {banner.priceLabel && <span className="font-extrabold">{banner.priceLabel}</span>}
          {!compact && banner.shop.city && (
            <span className="inline-flex items-center gap-1 text-sm text-[#C9C6D6]">
              <MapPin className="h-4 w-4" aria-hidden /> {banner.shop.city}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

/** Bannières de l'accueil : la première en grand, les deux suivantes en compact. */
export function PromoBanners({ banners }: { banners: MarketBanner[] }) {
  if (banners.length === 0) return null;
  const [first, ...rest] = banners;
  return (
    <section aria-label="À la une" className="mx-auto max-w-[1240px] px-4 pb-12 sm:px-6 sm:pb-16">
      <PromoBanner banner={first} priority />
      {rest.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {rest.slice(0, 2).map((b) => (
            <PromoBanner key={b.id} banner={b} compact />
          ))}
        </div>
      )}
    </section>
  );
}

export function ProPicks({ products }: { products: MarketProduct[] }) {
  // Pas de section maigre : au moins 4 annonces (une par boutique Pro).
  if (products.length < 4) return null;
  return (
    <section aria-labelledby="t-pro" className="mx-auto max-w-[1240px] px-4 pb-12 sm:px-6 sm:pb-16">
      <div className="mb-4 flex items-end justify-between gap-4 sm:mb-6">
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#77738A]">
            <ProBadge /> Boutiques Pro
          </p>
          <h2 id="t-pro" className="font-[family-name:var(--font-market-display)] text-[24px] font-bold leading-tight tracking-tight sm:text-[30px]">
            Sélection du jour
          </h2>
        </div>
        <Link href="/boutiques" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[#4F43E0]">
          Les boutiques <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ProductRail products={products.slice(0, 8)} priorityCount={2} />
    </section>
  );
}
