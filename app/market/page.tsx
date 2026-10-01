import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketShopCard, ProductGrid, ProBadge } from "@/components/market/cards";
import { MarketImage } from "@/components/market/market-image";
import { MarketShell } from "@/components/market/shell";
import { marketRootCategories } from "@/lib/market/categories";
import { getMarketCity } from "@/lib/market/cities";
import { citiesWithProducts, getMarketCounts, getMarketProducts, getMarketShops, totalsFor } from "@/lib/market/queries";
import { absoluteUrl, breadcrumbLd, jsonLdString, SITE_LOCALE } from "@/lib/seo";
import { shopInitials } from "@/lib/shops/media";
import { cn } from "@/lib/utils";

// Accueil de Jaarle Market : produits et boutiques des commerçants Pro. Rendue côté serveur,
// mise en cache 5 minutes (ISR).
export const revalidate = 300;

const TITLE = "Jaarle Market — les boutiques du Sénégal, commande sur WhatsApp";
const DESCRIPTION =
  "Mode, beauté, épicerie, maison, artisanat… Les produits des boutiques Pro du Sénégal avec leurs prix en FCFA. Commandez directement sur WhatsApp.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/market") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/market"), siteName: "Jaarle Market", locale: SITE_LOCALE, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const POPULAR = [
  { label: "Robes", href: "/market/robes" },
  { label: "Thiouraye", href: "/market/thiouraye" },
  { label: "Sacs", href: "/market/sacs" },
  { label: "Karité", href: "/market/huiles-karite" },
  { label: "Sandales", href: "/market/sandales" },
];

export default async function MarketHome() {
  const [counts, selection, shops] = await Promise.all([
    getMarketCounts(),
    getMarketProducts({ sort: "relevance", limit: 15 }),
    getMarketShops({ limit: 6 }),
  ]);
  const roots = marketRootCategories().map((c) => ({ cat: c, n: totalsFor(counts, c, null).products }));
  const cities = citiesWithProducts(counts, null)
    .map((c) => ({ city: getMarketCity(c.slug), n: c.products }))
    .filter((c): c is { city: NonNullable<ReturnType<typeof getMarketCity>>; n: number } => !!c.city)
    .slice(0, 8);
  const [hero, second, ...rest] = selection.items;
  const featuredShop = shops.items[0] ?? null;
  const empty = selection.items.length === 0;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": absoluteUrl("/market#website"),
      name: "Jaarle Market",
      url: absoluteUrl("/market"),
      inLanguage: "fr-SN",
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/market/recherche")}?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    breadcrumbLd([
      { name: "Jaarle", url: absoluteUrl("/") },
      { name: "Market", url: absoluteUrl("/market") },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Sélection Jaarle Market",
      itemListElement: selection.items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(p.url), name: p.name })),
    },
  ];

  return (
    <MarketShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:gap-12">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#3F34C4]">
              <span className="h-2 w-2 rounded-full bg-[#F2B441]" aria-hidden />
              Le marché des boutiques Pro
            </p>
            <h1 className="font-[family-name:var(--font-market-display)] text-[40px] font-extrabold leading-[0.98] tracking-tight sm:text-6xl lg:text-[68px]">
              Les boutiques du Sénégal, réunies au même endroit.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[#5E5A6B] sm:text-lg">
              Mode, beauté, maison, épicerie… Trouvez le bon produit chez un commerçant Pro, voyez son prix en FCFA et commandez-le directement sur WhatsApp.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-semibold text-[#5E5A6B]">Populaire :</span>
              {POPULAR.map((p) => (
                <Link key={p.href} href={p.href} className="inline-flex h-9 items-center rounded-full border border-[#E4E1D8] bg-white px-3.5 text-sm font-semibold hover:border-[#17151F]">
                  {p.label}
                </Link>
              ))}
            </div>
          </div>

          {hero ? (
            <div className="grid grid-cols-2 gap-4">
              <Link href={hero.url} className="relative row-span-2 min-h-[340px] overflow-hidden rounded-[22px] bg-[#EFEBE3] sm:min-h-[460px]">
                <MarketImage src={hero.fullUrl} fallback={hero.thumbUrl} alt={hero.name} priority className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-2xl bg-white/95 px-3.5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-[#5E5A6B]">
                      {hero.shop.name}
                      {hero.shop.city ? ` · ${hero.shop.city}` : ""}
                    </span>
                    <span className="block truncate font-extrabold">{hero.name}</span>
                  </span>
                  <span className="shrink-0 font-extrabold">{hero.priceLabel}</span>
                </span>
              </Link>
              {second ? (
                <Link href={second.url} className="relative aspect-square overflow-hidden rounded-[22px] bg-[#EFEBE3]">
                  <MarketImage src={second.thumbUrl} fallback={second.fullUrl} alt={second.name} priority className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute bottom-3 left-3 max-w-[85%] truncate rounded-full bg-[#17151F] px-3 py-1.5 text-xs font-bold text-white">{second.name}</span>
                </Link>
              ) : (
                <span className="aspect-square rounded-[22px] bg-[#EFEBE3]" />
              )}
              {featuredShop ? (
                // Boutique à la une : son logo en grand (fond bleu seulement si elle n'en a pas).
                <Link
                  href={featuredShop.url}
                  className={cn(
                    "group relative flex aspect-square flex-col overflow-hidden rounded-[22px]",
                    featuredShop.logoUrl ? "bg-white ring-1 ring-black/5" : "bg-[#4F43E0] text-white"
                  )}
                >
                  <ProBadge className={cn("absolute left-4 top-4 z-10", !featuredShop.logoUrl && "bg-white/15 text-white")} />
                  <span className="flex min-h-0 flex-1 items-center justify-center p-6 pb-2">
                    {featuredShop.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={featuredShop.logoUrl}
                        alt={`Logo ${featuredShop.name}`}
                        className="max-h-full max-w-[80%] object-contain transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <span className="font-[family-name:var(--font-market-display)] text-5xl font-extrabold">{shopInitials(featuredShop.name)}</span>
                    )}
                  </span>
                  <span className={cn("px-5 pb-4", featuredShop.logoUrl && "border-t border-[#ECE9E1] pt-3")}>
                    <span className="block truncate font-[family-name:var(--font-market-display)] text-lg font-bold leading-tight">{featuredShop.name}</span>
                    <span className={cn("mt-0.5 flex items-center justify-between gap-2 text-[13px]", featuredShop.logoUrl ? "text-[#5E5A6B]" : "text-white/85")}>
                      <span className="truncate">{[featuredShop.categoryLabel, featuredShop.city].filter(Boolean).join(" · ")}</span>
                      <span className={cn("shrink-0 font-extrabold", featuredShop.logoUrl ? "text-[#4F43E0]" : "text-white")}>Voir →</span>
                    </span>
                  </span>
                </Link>
              ) : (
                <span className="aspect-square rounded-[22px] bg-[#EEECFD]" />
              )}
            </div>
          ) : (
            <div className="rounded-[26px] bg-[#EEECFD] p-8">
              <p className="font-[family-name:var(--font-market-display)] text-2xl font-bold">Le Market ouvre ses portes.</p>
              <p className="mt-2 text-[#4A4656]">Les premières boutiques Pro arrivent. Vous vendez ? Soyez parmi les premières.</p>
              <Link href="/tarifs" className="mt-5 inline-flex h-11 items-center rounded-full bg-[#4F43E0] px-5 font-bold text-white">
                Découvrir l’offre Pro
              </Link>
            </div>
          )}
        </section>

        {/* Catégories */}
        <section id="categories" className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6" aria-labelledby="t-cat">
          <h2 id="t-cat" className="mb-5 font-[family-name:var(--font-market-display)] text-3xl font-bold tracking-tight sm:text-[34px]">
            Explorer par catégorie
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {roots.map(({ cat, n }) => {
              const Icon = cat.icon;
              return (
                <Link key={cat.slug} href={`/market/${cat.slug}`} className="flex min-h-[132px] flex-col justify-between gap-4 rounded-[18px] p-4 transition-transform hover:-translate-y-0.5 sm:p-5" style={{ background: cat.tone }}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/75">{Icon && <Icon className="h-[22px] w-[22px]" strokeWidth={1.7} aria-hidden />}</span>
                  <span>
                    <span className="block font-extrabold">{cat.label}</span>
                    <span className="mt-0.5 block text-[13px] text-[#4A4656]">{n > 0 ? `${n} produit${n > 1 ? "s" : ""}` : "Bientôt"}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Sélection */}
        {!empty && (
          <section className="border-y border-[#ECE9E1] bg-white py-14 sm:py-16" aria-labelledby="t-sel">
            <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="t-sel" className="font-[family-name:var(--font-market-display)] text-3xl font-bold tracking-tight sm:text-[34px]">
                    À découvrir en ce moment
                  </h2>
                  <p className="mt-1.5 text-[#5E5A6B]">Les nouveautés et les produits en stock des boutiques Pro.</p>
                </div>
                <Link href="/market/recherche" className="inline-flex items-center gap-1.5 font-extrabold text-[#4F43E0]">
                  Tous les produits <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <ProductGrid products={rest.length >= 8 ? rest.slice(0, 8) : selection.items.slice(0, 8)} />
            </div>
          </section>
        )}

        {/* Boutiques */}
        {shops.items.length > 0 && (
          <section className="mx-auto max-w-[1240px] px-4 pt-16 sm:px-6" aria-labelledby="t-shops">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="t-shops" className="font-[family-name:var(--font-market-display)] text-3xl font-bold tracking-tight sm:text-[34px]">
                  Boutiques à découvrir
                </h2>
                <p className="mt-1.5 text-[#5E5A6B]">Leur catalogue complet, leurs prix et un contact WhatsApp direct.</p>
              </div>
              <Link href="/boutiques" className="inline-flex items-center gap-1.5 font-extrabold text-[#4F43E0]">
                Toutes les boutiques <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shops.items.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <MarketShopCard shop={s} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Villes */}
        {cities.length > 0 && (
          <section className="mt-16 bg-[#F2F0EA] py-14" aria-labelledby="t-city">
            <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
              <h2 id="t-city" className="mb-5 font-[family-name:var(--font-market-display)] text-3xl font-bold tracking-tight sm:text-[34px]">
                Acheter près de chez vous
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {cities.map(({ city, n }) => (
                  <Link key={city.slug} href={`/market/${city.slug}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-5 py-4 hover:shadow-sm">
                    <span>
                      <span className="block font-[family-name:var(--font-market-display)] text-xl font-bold">{city.name}</span>
                      <span className="block text-[13px] text-[#5E5A6B]">
                        {n} produit{n > 1 ? "s" : ""}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Comment commander */}
        <section className="mx-auto max-w-[1240px] px-4 pt-16 sm:px-6" aria-labelledby="t-how">
          <h2 id="t-how" className="mb-6 font-[family-name:var(--font-market-display)] text-3xl font-bold tracking-tight sm:text-[34px]">
            Comment commander ?
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              ["Trouvez le produit", "Cherchez par nom, catégorie ou ville. Chaque fiche affiche le prix en FCFA et la boutique qui le vend."],
              ["Écrivez sur WhatsApp", "Un message prêt à envoyer part vers le vendeur, avec le produit, le prix et le lien."],
              ["Réglez avec le vendeur", "Livraison, retrait et paiement se conviennent directement avec la boutique. Jaarle n’encaisse rien."],
            ].map(([title, text], i) => (
              <li key={title} className="rounded-[20px] border border-[#ECE9E1] bg-white p-6">
                <span className="block font-[family-name:var(--font-market-display)] text-[44px] font-extrabold leading-none text-[#4F43E0]">{i + 1}</span>
                <span className="mt-3 block text-lg font-extrabold">{title}</span>
                <span className="mt-1.5 block leading-relaxed text-[#5E5A6B]">{text}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Vendeurs */}
        <section className="mx-auto max-w-[1240px] px-4 pt-16 sm:px-6">
          <div className="grid items-center gap-7 rounded-[28px] bg-[#4F43E0] p-7 text-white sm:p-12 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="font-[family-name:var(--font-market-display)] text-3xl font-extrabold leading-[1.02] sm:text-[40px]">Vous vendez ? Votre catalogue mérite d’être vu ici.</h2>
              <p className="mt-3.5 text-[17px] leading-relaxed text-white/90">
                Jaarle Market est réservé aux boutiques Pro : vos produits apparaissent dans les recherches, les catégories et les pages de votre ville, en plus de votre boutique.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link href="/tarifs" className="inline-flex h-[52px] items-center rounded-full bg-[#F2B441] px-6 font-extrabold text-[#17151F]">
                Passer Pro
              </Link>
              <Link href="/register" className="inline-flex h-[52px] items-center rounded-full border-[1.5px] border-white/70 px-6 font-extrabold text-white">
                Créer ma boutique gratuite
              </Link>
            </div>
          </div>
        </section>

      </main>
    </MarketShell>
  );
}
