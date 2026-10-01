import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Pagination, ProductGrid } from "@/components/market/cards";
import { MarketShell } from "@/components/market/shell";
import { getMarketCity } from "@/lib/market/cities";
import { getMarketProducts, MARKET_PAGE_SIZE } from "@/lib/market/queries";
import { parseListingParams, sortLabel } from "@/lib/market/seo";

// Recherche : jamais indexée (contenu infini et dupliqué), mais les liens sont suivis.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Recherche | Jaarle Market" },
  robots: { index: false, follow: true },
};

type Props = { searchParams: Record<string, string | string[] | undefined> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MarketSearchPage({ searchParams }: Props) {
  const q = one(searchParams.q).trim().slice(0, 80);
  const city = getMarketCity(one(searchParams.ville));
  const lp = parseListingParams(searchParams);
  const { items, total } = await getMarketProducts({ q, city: city?.slug ?? null, sort: lp.sort, min: lp.min, max: lp.max, type: lp.type, page: lp.page });

  const hrefFor = (p: number, type: typeof lp.type = lp.type) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (type) s.set("type", type === "service" ? "services" : "produits");
    if (city) s.set("ville", city.slug);
    if (lp.sort !== "relevance") s.set("tri", lp.sort);
    if (p > 1) s.set("page", String(p));
    return `/market/recherche?${s.toString()}`;
  };

  return (
    <MarketShell query={q} city={city?.slug ?? null}>
      <main className="mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
        <Breadcrumbs items={[{ name: "Market", href: "/market" }, { name: "Recherche" }]} />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-market-display)] text-[32px] font-extrabold leading-tight tracking-tight sm:text-[44px]">
              {q ? `« ${q} »` : "Tous les produits"}
              {city ? ` à ${city.name}` : ""}
            </h1>
            <p className="mt-2 text-[#5E5A6B]">
              {total} résultat{total > 1 ? "s" : ""}
            </p>
          </div>
          <form method="get" action="/market/recherche" className="flex items-end gap-2">
            {q && <input type="hidden" name="q" value={q} />}
            {city && <input type="hidden" name="ville" value={city.slug} />}
            <label className="flex flex-col gap-1 text-xs font-bold text-[#5E5A6B]">
              Trier par
              <select name="tri" defaultValue={lp.sort} className="h-11 rounded-xl border border-[#D9D5CB] bg-white px-3 text-sm font-semibold text-[#17151F]">
                {(["relevance", "new", "price_asc", "price_desc"] as const).map((s) => (
                  <option key={s} value={s}>
                    {sortLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="h-11 rounded-xl bg-[#17151F] px-4 text-sm font-bold text-white">
              Trier
            </button>
          </form>
        </div>
        <nav aria-label="Type d’annonce" className="mt-6 inline-flex rounded-full bg-[#F2F0EA] p-1">
          {([
            [null, "Tout"],
            ["product", "Produits"],
            ["service", "Services"],
          ] as const).map(([t, label]) => (
            <Link
              key={label}
              href={hrefFor(1, t)}
              aria-current={lp.type === t ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-bold ${lp.type === t ? "bg-[#17151F] text-white" : "text-[#4A4656] hover:text-[#17151F]"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6">
          {items.length > 0 ? (
            <>
              <ProductGrid products={items} priorityCount={4} />
              <Pagination page={lp.page} total={total} pageSize={MARKET_PAGE_SIZE} hrefFor={hrefFor} />
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-[#D9D5CB] bg-white px-6 py-14 text-center">
              <p className="font-[family-name:var(--font-market-display)] text-2xl font-bold">Aucun résultat</p>
              <p className="mx-auto mt-2 max-w-md text-[#5E5A6B]">Essayez un autre mot, ou parcourez les catégories.</p>
              <Link href="/market#categories" className="mt-5 inline-flex h-11 items-center rounded-full bg-[#17151F] px-5 font-bold text-white">
                Voir les catégories
              </Link>
            </div>
          )}
        </div>
      </main>
    </MarketShell>
  );
}
