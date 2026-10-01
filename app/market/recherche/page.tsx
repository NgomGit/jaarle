import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { Breadcrumbs, Pagination, ProductGrid } from "@/components/market/cards";
import { MarketFilters, type Option } from "@/components/market/filters";
import { LiveSearch, SearchResults } from "@/components/market/live-search";
import { SEARCH_SUGGESTIONS } from "@/components/market/search-hero";
import { MarketShell } from "@/components/market/shell";
import { allMarketCategories, getMarketCategory, marketRootCategories } from "@/lib/market/categories";
import { getMarketCity, MARKET_CITIES } from "@/lib/market/cities";
import { citiesWithProducts, getMarketCounts, getMarketProducts, MARKET_PAGE_SIZE, totalsFor } from "@/lib/market/queries";
import { parseMarketSearch } from "@/lib/market/search";
import { parseListingParams } from "@/lib/market/seo";
import { cn } from "@/lib/utils";

// Recherche du Market : jamais indexée (contenu infini et dupliqué), mais les liens sont suivis.
// Recherche par nom, catégorie (reconnue dans le texte), boutique et ville ; filtres catégorie,
// ville, prix, disponibilité ; tris. La saisie met la page à jour toute seule (LiveSearch).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Recherche | Jaarle Market" },
  robots: { index: false, follow: true },
};

type Props = { searchParams: Record<string, string | string[] | undefined> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PATH = "/market/recherche";

export default async function MarketSearchPage({ searchParams }: Props) {
  const q = one(searchParams.q).trim().slice(0, 80);
  const chosenCity = getMarketCity(one(searchParams.ville));
  const chosenCategory = getMarketCategory(one(searchParams.categorie));
  const lp = parseListingParams(searchParams);

  // « robe dakar » → texte « robe » + ville Dakar ; « chaussures » → catégorie reconnue.
  const parsed = parseMarketSearch(q, { cityAlreadySet: !!chosenCity });
  const city = chosenCity ?? parsed.city;
  const text = parsed.text;

  const [{ items, total }, counts] = await Promise.all([
    getMarketProducts({
      q: text || null,
      category: chosenCategory,
      city: city?.slug ?? null,
      sort: lp.sort,
      min: lp.min,
      max: lp.max,
      type: lp.type,
      available: lp.available,
      qCategories: text && !chosenCategory ? parsed.leafKeys : null,
      page: lp.page,
    }),
    getMarketCounts(),
  ]);

  // Paramètres d'URL courants (sans la page) → liens qui changent une seule chose.
  const base: Record<string, string> = {};
  if (q) base.q = q;
  if (chosenCity) base.ville = chosenCity.slug;
  if (chosenCategory) base.categorie = chosenCategory.slug;
  if (lp.type) base.type = lp.type === "service" ? "services" : "produits";
  if (lp.sort !== "relevance") base.tri = lp.sort;
  if (lp.min != null) base.min = String(lp.min);
  if (lp.max != null) base.max = String(lp.max);
  if (lp.available) base.dispo = "1";
  const href = (changes: Record<string, string | null>) => {
    const s = new URLSearchParams(base);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) s.delete(k);
      else s.set(k, v);
    }
    const str = s.toString();
    return str ? `${PATH}?${str}` : PATH;
  };

  // Options des filtres : uniquement ce qui a des produits (pas de liste interminable).
  const categoryOptions: Option[] = marketRootCategories()
    .filter((r) => totalsFor(counts, r, null).products > 0)
    .flatMap((root) => [
      { value: root.slug, label: `Tout « ${root.label} »`, group: root.label },
      ...root.childSlugs
        .map((s) => getMarketCategory(s))
        .filter((c): c is NonNullable<typeof c> => !!c && totalsFor(counts, c, null).products > 0)
        .map((c) => ({ value: c.slug, label: c.label, group: root.label })),
    ]);
  const cityCounts = citiesWithProducts(counts, null);
  const cityOptions: Option[] = (cityCounts.length ? cityCounts.map((c) => getMarketCity(c.slug)).filter((c): c is NonNullable<typeof c> => !!c) : MARKET_CITIES.slice(0, 12)).map(
    (c) => ({ value: c.slug, label: c.name })
  );
  if (chosenCity && !cityOptions.some((o) => o.value === chosenCity.slug)) cityOptions.unshift({ value: chosenCity.slug, label: chosenCity.name });
  if (chosenCategory && !categoryOptions.some((o) => o.value === chosenCategory.slug)) categoryOptions.unshift({ value: chosenCategory.slug, label: chosenCategory.label });

  // « robe dakar » → titre « robe » à Dakar (la ville reconnue n'est pas répétée).
  const heading = text ? `« ${text} »` : chosenCategory ? chosenCategory.label : "Tous les produits";
  // Une seule catégorie proposée (la plus précise) : pas de liste de liens au-dessus des résultats.
  const recognized = !chosenCategory && text ? parsed.categories.slice(0, 1) : [];
  const pageHref = (p: number) => href({ page: p > 1 ? String(p) : null });

  return (
    <MarketShell query={q} city={city?.slug ?? null} searchInHeader={false}>
      <main className="mx-auto max-w-[1240px] px-4 pb-10 pt-5 sm:px-6 sm:pt-6">
        <Breadcrumbs items={[{ name: "Market", href: "/market" }, { name: "Recherche" }]} />

        <LiveSearch initial={q}>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h1 className="min-w-0 font-[family-name:var(--font-market-display)] text-[28px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
              {heading}
              {city ? <span className="text-[#77738A]"> à {city.name}</span> : null}
            </h1>
            <p className="pb-1.5 text-sm font-semibold text-[#5E5A6B]">
              {total} résultat{total > 1 ? "s" : ""}
            </p>
          </div>

          {/* Ce qui a été compris dans la recherche : ville et catégories, retirables. */}
          {(parsed.city || recognized.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {parsed.city && !chosenCity && (
                <Link href={href({ q: text || null, ville: null })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#EEECFD] pl-3 pr-2.5 font-semibold text-[#3F34C4]">
                  Ville : {parsed.city.name} <X className="h-3.5 w-3.5" aria-label="Retirer la ville" />
                </Link>
              )}
              {recognized.map((c) => (
                <Link key={c.slug} href={`/market/${c.slug}${city ? `/${city.slug}` : ""}`} className="inline-flex h-9 items-center rounded-full bg-[#F2F0EA] px-3 font-semibold text-[#4A4656] hover:text-[#17151F]">
                  Voir la catégorie {c.label}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Type d’annonce" className="inline-flex rounded-full bg-[#F2F0EA] p-1">
              {(
                [
                  [null, "Tout"],
                  ["product", "Produits"],
                  ["service", "Services"],
                ] as const
              ).map(([t, label]) => (
                <Link
                  key={label}
                  href={href({ type: t === "service" ? "services" : t === "product" ? "produits" : null, page: null })}
                  aria-current={lp.type === t ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-4 text-sm font-bold",
                    lp.type === t ? "bg-[#17151F] text-white" : "text-[#4A4656] hover:text-[#17151F]"
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <MarketFilters
              action={PATH}
              fields={["category", "city", "price", "available", "sort"]}
              values={{ category: chosenCategory?.slug ?? null, city: chosenCity?.slug ?? null, min: lp.min, max: lp.max, available: lp.available, sort: lp.sort }}
              hidden={{ q: q || null, type: base.type }}
              categories={categoryOptions}
              cities={cityOptions}
              resetHref={q ? `${PATH}?${new URLSearchParams({ q }).toString()}` : PATH}
              total={total}
            />
          </div>

          <SearchResults>
            <div className="mt-6">
              {items.length > 0 ? (
                <>
                  <ProductGrid products={items} priorityCount={4} />
                  <Pagination page={lp.page} total={total} pageSize={MARKET_PAGE_SIZE} hrefFor={pageHref} />
                </>
              ) : (
                <div className="rounded-[28px] border border-dashed border-[#D9D5CB] bg-white px-6 py-14 text-center">
                  <p className="font-[family-name:var(--font-market-display)] text-2xl font-bold">Nous n’avons pas encore trouvé ce que vous cherchez.</p>
                  <p className="mx-auto mt-2 max-w-md text-[#5E5A6B]">
                    {lp.filtered || chosenCategory || chosenCity ? "Essayez une autre recherche, ou retirez un filtre." : "Essayez une autre recherche."}
                  </p>
                  <ul className="mt-5 flex flex-wrap justify-center gap-2">
                    {SEARCH_SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <Link href={`${PATH}?${new URLSearchParams({ q: s.toLowerCase() }).toString()}`} className="inline-flex h-10 items-center rounded-full bg-[#F2F0EA] px-4 text-sm font-semibold">
                          {s}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href="/market" className="mt-5 inline-flex h-11 items-center rounded-full bg-[#17151F] px-5 font-bold text-white">
                    Retour au Market
                  </Link>
                </div>
              )}
            </div>
          </SearchResults>
        </LiveSearch>

        {/* Raccourcis quand rien n'est encore cherché */}
        {!q && !chosenCategory && items.length > 0 && (
          <p className="mt-10 text-center text-sm text-[#77738A]">
            Vous cherchez une catégorie précise ?{" "}
            {allMarketCategories()
              .filter((c) => c.level === 1 && totalsFor(counts, c, null).products > 0)
              .slice(0, 4)
              .map((c, i) => (
                <span key={c.slug}>
                  {i > 0 ? " · " : ""}
                  <Link href={`/market/${c.slug}`} className="font-semibold text-[#4F43E0]">
                    {c.label}
                  </Link>
                </span>
              ))}
          </p>
        )}
      </main>
    </MarketShell>
  );
}
