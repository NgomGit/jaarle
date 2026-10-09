import Link from "next/link";
import { Breadcrumbs, Pagination, ProductGrid } from "@/components/market/cards";
import { MarketFilters } from "@/components/market/filters";
import { PromoBanner } from "@/components/market/promo";
import { categoryTrail, getMarketCategory, marketRootCategories, type MarketCategory } from "@/lib/market/categories";
import { getMarketCity, type MarketCity } from "@/lib/market/cities";
import {
  bannersFor,
  citiesWithProducts,
  getMarketBanners,
  getMarketCounts,
  getMarketProducts,
  MARKET_PAGE_SIZE,
  totalsFor,
  type MarketProduct,
  type Totals,
} from "@/lib/market/queries";
import { listingFaq, listingH1, listingIntro, type ListingParams } from "@/lib/market/seo";
import { absoluteUrl, breadcrumbLd, faqLd, jsonLdString } from "@/lib/seo";
import { cn } from "@/lib/utils";

// Page de liste du Market : catégorie, ville ou catégorie × ville (même gabarit).

export function listingPath(category: MarketCategory | null, city: MarketCity | null): string {
  if (category && city) return `/market/${category.slug}/${city.slug}`;
  if (category) return `/market/${category.slug}`;
  if (city) return `/market/${city.slug}`;
  return "/market";
}

export async function loadListing(category: MarketCategory | null, city: MarketCity | null, params: ListingParams) {
  const [counts, result] = await Promise.all([
    getMarketCounts(),
    getMarketProducts({
      category,
      city: city?.slug ?? null,
      sort: params.sort,
      min: params.min,
      max: params.max,
      type: params.type,
      available: params.available,
      page: params.page,
    }),
  ]);
  return { counts, totals: totalsFor(counts, category, city?.slug ?? null), ...result };
}

export async function MarketListing({
  category,
  city,
  params,
  items,
  total,
  totals,
}: {
  category: MarketCategory | null;
  city: MarketCity | null;
  params: ListingParams;
  items: MarketProduct[];
  total: number;
  totals: Totals;
}) {
  const [counts, allBanners] = await Promise.all([getMarketCounts(), getMarketBanners()]);
  const path = listingPath(category, city);
  // Bannière « À la une » ciblée sur cette page (ou sans ciblage), en 1re page seulement.
  const banner = params.page === 1 ? bannersFor(allBanners, category, city?.slug ?? null)[0] ?? null : null;
  const trail = category ? categoryTrail(category) : [];
  const links: { name: string; href: string }[] = [
    { name: "Market", href: "/market" },
    ...trail.map((c) => ({ name: c.label, href: listingPath(c, null) })),
    ...(city ? [{ name: city.name, href: path }] : []),
  ];
  // Dernier élément = page courante (non cliquable).
  const crumbs: { name: string; href?: string }[] = links.map((c, i) => (i === links.length - 1 ? { name: c.name } : c));

  // Sous-catégories (ou catégories racines sur une page ville) qui ont des produits.
  const children = (category ? category.childSlugs.map((s) => getMarketCategory(s)) : marketRootCategories())
    .filter((c): c is MarketCategory => !!c)
    .map((c) => ({ cat: c, n: totalsFor(counts, c, city?.slug ?? null).products }))
    .filter((c) => c.n > 0);
  const cities = citiesWithProducts(counts, category)
    .map((c) => ({ city: getMarketCity(c.slug)!, n: c.products }))
    .filter((c) => c.city);

  const hrefFor = (p: number, type: typeof params.type = params.type) => {
    const q = new URLSearchParams();
    if (type) q.set("type", type === "service" ? "services" : "produits");
    if (params.sort !== "relevance") q.set("tri", params.sort);
    if (params.min != null) q.set("min", String(params.min));
    if (params.max != null) q.set("max", String(params.max));
    if (params.available) q.set("dispo", "1");
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };

  const faq = listingFaq(category, city);
  const jsonLd = [
    breadcrumbLd(links.map((c) => ({ name: c.name, url: absoluteUrl(c.href) }))),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: listingH1(category, city),
      numberOfItems: total,
      itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: (params.page - 1) * MARKET_PAGE_SIZE + i + 1, url: absoluteUrl(p.url), name: p.name })),
    },
    faqLd(faq),
  ];

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Breadcrumbs items={crumbs} />

      <div className="mt-5 max-w-3xl">
        <h1 className="font-[family-name:var(--font-market-display)] text-[34px] font-extrabold leading-[1.02] tracking-tight sm:text-5xl">
          {listingH1(category, city)}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[#5E5A6B] sm:text-[17px]">{listingIntro(category, city, totals)}</p>
      </div>

      {children.length > 0 && (
        <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {children.map(({ cat, n }) => (
            <Link
              key={cat.slug}
              href={listingPath(cat, city)}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#E4E1D8] bg-white px-4 text-sm font-semibold hover:border-[#17151F]"
            >
              {cat.label}
              <span className="text-xs font-bold text-[#8A8698]">{n}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-7">
        <section aria-label="Produits" className="min-w-0">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          {/* Produits / services : filtre (non indexé, comme les autres filtres). */}
          <nav aria-label="Type d’annonce" className="inline-flex rounded-full bg-[#F2F0EA] p-1">
            {([
              [null, "Tout"],
              ["product", "Produits"],
              ["service", "Services"],
            ] as const).map(([t, label]) => (
              <Link
                key={label}
                href={hrefFor(1, t)}
                aria-current={params.type === t ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-sm font-bold",
                  params.type === t ? "bg-[#17151F] text-white" : "text-[#4A4656] hover:text-[#17151F]"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
            <MarketFilters
              action={path}
              fields={["price", "available", "sort"]}
              values={{ category: null, city: null, min: params.min, max: params.max, available: params.available, sort: params.sort }}
              hidden={{ type: params.type === "service" ? "services" : params.type === "product" ? "produits" : null }}
              resetHref={path}
              total={total}
            />
          </div>
          {banner && (
            <div className="mb-6">
              <PromoBanner banner={banner} compact />
            </div>
          )}
          {items.length > 0 ? (
            <>
              <ProductGrid products={items} priorityCount={4} />
              <Pagination page={params.page} total={total} pageSize={MARKET_PAGE_SIZE} hrefFor={hrefFor} />
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-[#D9D5CB] bg-white px-6 py-14 text-center">
              <p className="font-[family-name:var(--font-market-display)] text-2xl font-bold">Rien ici pour l’instant</p>
              <p className="mx-auto mt-2 max-w-md text-[#5E5A6B]">
                {params.filtered ? "Aucun produit ne correspond à ces filtres." : "Les boutiques n’ont pas encore de produit dans cette sélection."}
              </p>
              <Link href={params.filtered ? path : "/market"} className="mt-5 inline-flex h-11 items-center rounded-full bg-[#17151F] px-5 font-bold text-white">
                {params.filtered ? "Effacer les filtres" : "Voir tout le Market"}
              </Link>
            </div>
          )}
        </section>
      </div>

      <section className="mt-20 grid grid-cols-1 gap-12 border-t border-[#ECE9E1] pt-14 lg:grid-cols-2">
        <div>
          <h2 className="font-[family-name:var(--font-market-display)] text-3xl font-bold tracking-tight">
            {category ? `Acheter : ${category.label.toLowerCase()}${city ? ` à ${city.name}` : ""}` : `Commander à ${city?.name ?? "travers le Sénégal"}`}
          </h2>
          <p className="mt-4 leading-[1.75] text-[#4A4656]">{listingIntro(category, city, totals)}</p>
          {children.length > 0 && (
            <p className="mt-3 leading-[1.75] text-[#4A4656]">
              On y trouve notamment : {children.slice(0, 6).map((c) => c.cat.label.toLowerCase()).join(", ")}.
            </p>
          )}
          {cities.filter((c) => c.city.slug !== city?.slug).length > 0 && (
            <>
              <h3 className="mb-3 mt-7 font-extrabold">{category ? "Dans d’autres villes" : "Autres villes"}</h3>
              <div className="flex flex-wrap gap-2">
                {cities
                  .filter((c) => c.city.slug !== city?.slug)
                  .slice(0, 10)
                  .map(({ city: c }) => (
                    <Link key={c.slug} href={listingPath(category, c)} className="inline-flex h-10 items-center rounded-full border border-[#E4E1D8] bg-white px-4 text-sm font-semibold hover:border-[#17151F]">
                      {category ? `${category.label} à ${c.name}` : c.name}
                    </Link>
                  ))}
              </div>
            </>
          )}
        </div>
        <div>
          <h2 className="mb-2 font-[family-name:var(--font-market-display)] text-3xl font-bold tracking-tight">Questions fréquentes</h2>
          {faq.map((f, i) => (
            <details key={f.q} open={i === 0} className="border-b border-[#ECE9E1] py-4">
              <summary className="cursor-pointer list-none font-extrabold [&::-webkit-details-marker]:hidden">{f.q}</summary>
              <p className="mt-2 leading-relaxed text-[#4A4656]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

