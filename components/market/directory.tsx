import Link from "next/link";
import { Breadcrumbs, MarketShopCard, Pagination } from "@/components/market/cards";
import { MARKET_CITIES, type MarketCity } from "@/lib/market/cities";
import type { MarketShop } from "@/lib/market/queries";
import { absoluteUrl, breadcrumbLd, jsonLdString } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const DIRECTORY_PAGE_SIZE = 24;

/** Annuaire des boutiques (/boutiques et /boutiques/{ville}). */
export function ShopDirectory({ city, shops, total, page }: { city: MarketCity | null; shops: MarketShop[]; total: number; page: number }) {
  const path = city ? `/boutiques/${city.slug}` : "/boutiques";
  const jsonLd = [
    breadcrumbLd([
      { name: "Jaarle", url: absoluteUrl("/") },
      { name: "Boutiques", url: absoluteUrl("/boutiques") },
      ...(city ? [{ name: city.name, url: absoluteUrl(path) }] : []),
    ]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: city ? `Boutiques à ${city.name}` : "Boutiques Jaarle",
      numberOfItems: total,
      itemListElement: shops.map((s, i) => ({ "@type": "ListItem", position: (page - 1) * DIRECTORY_PAGE_SIZE + i + 1, url: absoluteUrl(s.url), name: s.name })),
    },
  ];
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <section className="bg-[#17151F] pb-12 pt-10 text-white sm:pt-14">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="[&_a]:text-[#B9B5C9] [&_span[aria-current]]:text-white [&_nav]:text-[#B9B5C9]">
            <Breadcrumbs items={[{ name: "Market", href: "/market" }, ...(city ? [{ name: "Boutiques", href: "/boutiques" }, { name: city.name }] : [{ name: "Boutiques" }])]} />
          </div>
          <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-market-display)] text-[36px] font-extrabold leading-none tracking-tight sm:text-[56px]">
            {city ? `Boutiques en ligne à ${city.name}` : "Les boutiques en ligne du Sénégal"}
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-[#D6D3E2]">
            {total > 0
              ? `${total} boutique${total > 1 ? "s" : ""}${city ? ` à ${city.name}` : ""}, avec leur catalogue, leurs prix en FCFA et un contact WhatsApp direct.`
              : "Les premières boutiques arrivent bientôt."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 pt-7 sm:px-6">
        <nav aria-label="Filtrer par ville" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ slug: "", name: "Toutes" }, ...MARKET_CITIES.slice(0, 14)].map((c) => {
            const active = (city?.slug ?? "") === c.slug;
            return (
              <Link
                key={c.slug || "all"}
                href={c.slug ? `/boutiques/${c.slug}` : "/boutiques"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-bold",
                  active ? "border-[#17151F] bg-[#17151F] text-white" : "border-[#E4E1D8] bg-white text-[#17151F] hover:border-[#17151F]"
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>

        {shops.length > 0 ? (
          <>
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((s) => (
                <li key={s.id} className="min-w-0">
                  <MarketShopCard shop={s} />
                </li>
              ))}
            </ul>
            <Pagination page={page} total={total} pageSize={DIRECTORY_PAGE_SIZE} hrefFor={(p) => (p > 1 ? `${path}?page=${p}` : path)} />
          </>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-[#D9D5CB] bg-white px-6 py-14 text-center">
            <p className="font-[family-name:var(--font-market-display)] text-2xl font-bold">Pas encore de boutique ici</p>
            <p className="mx-auto mt-2 max-w-md text-[#5E5A6B]">Créez la vôtre gratuitement et recevez vos commandes sur WhatsApp.</p>
          </div>
        )}

        <section className="mt-16 grid items-center gap-6 rounded-[26px] bg-[#EEECFD] p-7 sm:p-10 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="font-[family-name:var(--font-market-display)] text-3xl font-extrabold leading-tight">Votre boutique a sa place ici.</h2>
            <p className="mt-2 leading-relaxed text-[#4A4656]">
              Créez votre boutique gratuitement. En Pro, vos produits apparaissent aussi sur Jaarle Market, dans les catégories et les recherches.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link href="/register" className="inline-flex h-12 items-center rounded-full bg-[#4F43E0] px-6 font-extrabold text-white">
              Créer ma boutique
            </Link>
            <Link href="/tarifs" className="inline-flex h-12 items-center rounded-full border-[1.5px] border-[#4F43E0] px-6 font-extrabold text-[#4F43E0]">
              Voir l’offre Pro
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
