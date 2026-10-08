import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageCircle, Search, Store } from "lucide-react";
import { MarketShopCard, ProductRail } from "@/components/market/cards";
import { MarketSearchHero } from "@/components/market/search-hero";
import { MarketShell } from "@/components/market/shell";
import { PromoBanners, ProPicks } from "@/components/market/promo";
import { allMarketCategories, marketRootCategories, type MarketCategory } from "@/lib/market/categories";
import { getMarketCity } from "@/lib/market/cities";
import {
  bannersFor,
  citiesWithProducts,
  frDayMonth,
  getMarketBanners,
  getMarketCounts,
  getMarketProducts,
  getMarketPublicSettings,
  getMarketShops,
  getProPicks,
  totalsFor,
  type MarketBanner,
  type MarketProduct,
  type MarketShop,
} from "@/lib/market/queries";
import { absoluteUrl, breadcrumbLd, jsonLdString, SITE_LOCALE } from "@/lib/seo";

// Accueil de Jaarle Market, pensé pour la découverte sur mobile :
// recherche au centre → catégories en puces → sections (à la une, nouveautés, boutiques, Dakar,
// plus de produits). Une section n'apparaît que si elle a assez de contenu réel.
// Rendue côté serveur, mise en cache 5 minutes (ISR).
export const revalidate = 300;

const TITLE = "Jaarle Market — découvrez les produits des boutiques du Sénégal";
const DESCRIPTION =
  "Mode, beauté, épicerie, maison, artisanat… Découvrez les produits des boutiques présentes sur Jaarle, avec leurs prix en FCFA, et contactez le vendeur directement sur WhatsApp.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/market") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/market"), siteName: "Jaarle Market", locale: SITE_LOCALE, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/** Nombre minimum d'éléments pour afficher une section (jamais de section vide ou maigre). */
const MIN_SECTION = 4;
const HOME_CITY = "dakar";

export default async function MarketHome() {
  const [counts, newest, shops, relevant, local, allBanners, settings, promos] = await Promise.all([
    getMarketCounts(),
    getMarketProducts({ sort: "new", limit: 8 }),
    getMarketShops({ limit: 8 }),
    getMarketProducts({ sort: "relevance", limit: 20 }),
    getMarketProducts({ city: HOME_CITY, sort: "relevance", limit: 16 }),
    getMarketBanners(),
    getMarketPublicSettings(),
    // Promos des boutiques Pro (0046), plus fortes remises d'abord.
    getMarketProducts({ promo: true, sort: "promo", limit: 12 }),
  ]);

  // À la une : bannières programmées dans l'admin (sans ciblage) ; à défaut, une boutique Pro
  // choisie chaque jour (bannière automatique), pour qu'il y ait toujours une mise en avant.
  const programmed = bannersFor(allBanners, null, null);
  const picks = programmed.length === 0 ? await getProPicks(8) : [];
  const auto = programmed.length === 0 ? autoProBanner(shops.items, picks) : null;
  const banners = programmed.length ? programmed : auto ? [auto] : [];

  // Chaque produit n'apparaît qu'une fois sur la page, dans la première section qui le montre.
  const shown = new Set<string>(picks.map((p) => p.id));
  const take = (items: MarketProduct[], max = 8) => {
    const out = items.filter((p) => !shown.has(p.id)).slice(0, max);
    if (out.length < MIN_SECTION) return [];
    out.forEach((p) => shown.add(p.id));
    return out;
  };
  const newSection = take(newest.items);
  const homeCity = getMarketCity(HOME_CITY);
  const localSection = homeCity ? take(local.items) : [];
  const moreSection = take(relevant.items, 12);

  const chips = categoryChips(counts);
  const cities = citiesWithProducts(counts, null)
    .map((c) => ({ city: getMarketCity(c.slug), n: c.products }))
    .filter((c): c is { city: NonNullable<ReturnType<typeof getMarketCity>>; n: number } => !!c.city)
    .slice(0, 8);
  const totalProducts = totalsFor(counts, null, null).products;
  const empty = totalProducts === 0 && newest.items.length === 0;

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
    ...(relevant.items.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Produits sur Jaarle Market",
            itemListElement: relevant.items.slice(0, 12).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(p.url), name: p.name })),
          },
        ]
      : []),
  ];

  return (
    <MarketShell home>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <main>
        {/* Recherche au centre */}
        <section className="mx-auto max-w-[1240px] px-4 pb-6 pt-7 sm:px-6 sm:pb-10 sm:pt-14">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-[family-name:var(--font-market-display)] text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[48px]">
              Découvrez les produits près de chez vous
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[#5E5A6B] sm:text-[17px]">
              Explorez les produits des boutiques présentes sur Jaarle.
            </p>
            <MarketSearchHero className="mt-6 sm:mt-8" />
          </div>
        </section>

        {/* Catégories en puces */}
        {chips.length > 0 && (
          <nav aria-label="Catégories" className="mx-auto max-w-[1240px] pb-10 sm:px-6 sm:pb-14">
            <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:px-0">
              {chips.map(({ cat, n }) => {
                const Icon = cat.icon;
                return (
                  <li key={cat.slug} className="shrink-0">
                    <Link
                      href={`/market/${cat.slug}`}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E4E1D8] bg-white pl-3 pr-4 text-sm font-semibold text-[#17151F] transition-colors hover:border-[#17151F]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: cat.tone }}>
                        {Icon && <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden />}
                      </span>
                      {cat.label}
                      {n > 0 && <span className="text-xs font-bold text-[#A19DB0]">{n}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {empty ? (
          <section className="mx-auto max-w-[1240px] px-4 sm:px-6">
            <div className="rounded-[28px] border border-dashed border-[#D9D5CB] bg-white px-6 py-14 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEECFD] text-[#3F34C4]">
                <Store className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-4 font-[family-name:var(--font-market-display)] text-2xl font-bold">Les premières boutiques arrivent bientôt.</p>
              <p className="mx-auto mt-2 max-w-md text-[#5E5A6B]">Revenez dans quelques jours pour découvrir leurs produits.</p>
            </div>
          </section>
        ) : (
          <>
            <PromoBanners banners={banners} />
            <ProPicks products={picks} />

            {promos.items.length > 0 && (
              <Section title="Promos" subtitle="Les bonnes affaires du moment, chez les boutiques Pro." href="/market/recherche?promo=1&tri=promo" linkLabel="Toutes les promos">
                <ProductRail products={promos.items} priorityCount={2} />
              </Section>
            )}

            {newSection.length > 0 && (
              <Section title="Nouveautés" subtitle="Les derniers produits publiés par les boutiques." href="/market/recherche?tri=new" linkLabel="Tout voir">
                <ProductRail products={newSection} priorityCount={2} />
              </Section>
            )}

            {shops.items.length >= 2 && (
              <Section title="Boutiques à découvrir" subtitle="Leur catalogue, leurs prix et un contact WhatsApp direct." href="/boutiques" linkLabel="Toutes les boutiques">
                <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                  {shops.items.slice(0, 8).map((s) => (
                    <li key={s.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                      <MarketShopCard shop={s} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {homeCity && localSection.length > 0 && (
              <Section title={`Produits à ${homeCity.name}`} subtitle="Chez des boutiques de la ville." href={`/market/${homeCity.slug}`} linkLabel="Tout voir">
                <ProductRail products={localSection} />
              </Section>
            )}

            {moreSection.length > 0 && (
              <Section title="Plus de produits" href="/market/recherche" linkLabel="Tous les produits">
                <ProductRail products={moreSection.slice(0, 8)} />
                {moreSection.length > 8 && (
                  <div className="mt-6 text-center sm:hidden">
                    <Link href="/market/recherche" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#17151F] px-6 font-bold">
                      Voir tous les produits <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                )}
              </Section>
            )}

            {cities.length >= 2 && (
              <Section title="Acheter près de chez vous">
                <ul className="flex flex-wrap gap-2">
                  {cities.map(({ city, n }) => (
                    <li key={city.slug}>
                      <Link
                        href={`/market/${city.slug}`}
                        className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E4E1D8] bg-white px-4 text-sm font-semibold hover:border-[#17151F]"
                      >
                        {city.name}
                        <span className="text-xs font-bold text-[#A19DB0]">{n}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        {/* Comment ça marche */}
        <section aria-labelledby="t-how" className="mx-auto max-w-[1240px] px-4 pt-14 sm:px-6">
          <h2 id="t-how" className="sr-only">
            Comment ça marche
          </h2>
          <ol className="grid gap-px overflow-hidden rounded-[22px] border border-[#ECE9E1] bg-[#ECE9E1] sm:grid-cols-3">
            {[
              { Icon: Search, title: "Trouvez un produit", text: "Cherchez par nom, catégorie ou ville. Le prix est affiché en FCFA." },
              { Icon: Store, title: "Découvrez la boutique", text: "Son catalogue complet, sa ville et ses autres produits." },
              { Icon: MessageCircle, title: "Écrivez au vendeur", text: "Sur WhatsApp, avec un message prêt. Vous réglez directement avec lui." },
            ].map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3.5 bg-white p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F2F0EA]">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-[#5E5A6B]">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Vendeurs (secondaire) */}
        <section className="mx-auto max-w-[1240px] px-4 pt-6 sm:px-6">
          <div className="flex flex-col gap-4 rounded-[22px] bg-[#F2F0EA] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="font-[family-name:var(--font-market-display)] text-lg font-bold">Vous vendez des produits ?</p>
              <p className="mt-0.5 text-sm text-[#5E5A6B]">
                {settings.launchActive
                  ? `Créez gratuitement votre boutique sur Jaarle. Jusqu’au ${frDayMonth(settings.launchLastDay)}, avec ${settings.launchMinItems} produits en photo, elle apparaît aussi ici.`
                  : "Créez gratuitement votre boutique sur Jaarle et recevez vos commandes sur WhatsApp."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <Link href="/register" className="inline-flex h-11 items-center rounded-full bg-[#17151F] px-5 text-sm font-bold text-white">
                Créer ma boutique
              </Link>
              <Link href="/tarifs" className="text-sm font-bold text-[#4F43E0]">
                Offre Pro
              </Link>
            </div>
          </div>
        </section>
      </main>
    </MarketShell>
  );
}

function Section({ title, subtitle, href, linkLabel, children }: { title: string; subtitle?: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-12 sm:px-6 sm:pb-16">
      <div className="mb-4 flex items-end justify-between gap-4 sm:mb-6">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-market-display)] text-[24px] font-bold leading-tight tracking-tight sm:text-[30px]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-[#5E5A6B] sm:text-[15px]">{subtitle}</p>}
        </div>
        {href && linkLabel && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[#4F43E0]">
            {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Bannière automatique : une boutique Pro du Market, différente chaque jour, avec la photo d'un de
 * ses produits. Uniquement des données réelles (nom, activité, ville, nombre de produits).
 */
function autoProBanner(shops: MarketShop[], picks: MarketProduct[]): MarketBanner | null {
  const pro = shops.filter((s) => s.isPro);
  if (pro.length === 0) return null;
  const day = Math.floor(Date.now() / 86_400_000);
  const shop = pro[day % pro.length];
  const pick = picks.find((p) => p.shop.id === shop.id);
  // La ville est déjà affichée sous le bouton.
  const facts = [shop.categoryLabel, `${shop.productCount} produit${shop.productCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
  return {
    id: `auto-${shop.id}`,
    title: shop.name,
    subtitle: pick ? `${facts}. Par exemple : ${pick.name}, ${pick.priceLabel}.` : facts,
    ctaLabel: "Voir la boutique",
    categoryKeys: null,
    city: null,
    imageUrl: pick?.fullUrl ?? pick?.thumbUrl ?? shop.thumbs[0] ?? null,
    href: `${shop.url}?src=market`,
    priceLabel: null,
    shop: { name: shop.name, slug: shop.slug, city: shop.city, logoUrl: shop.logoUrl },
  };
}

/**
 * Puces de catégories : d'abord celles qui ont des produits (les plus fournies d'abord, avec leur
 * nombre), puis les autres grandes catégories du Market, sans nombre, pour que l'acheteur voie
 * tout ce qu'on peut y trouver (mode, beauté, auto & moto, électronique…).
 */
function categoryChips(counts: Awaited<ReturnType<typeof getMarketCounts>>): { cat: MarketCategory; n: number }[] {
  const withCount = (cats: MarketCategory[]) =>
    cats.map((cat) => ({ cat, n: totalsFor(counts, cat, null).products })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const subs = withCount(allMarketCategories().filter((c) => c.level === 2));
  const filled = subs.length >= 2 ? subs.slice(0, 8) : withCount(marketRootCategories());
  // Grandes catégories déjà couvertes par une puce (elle-même ou une de ses sous-catégories).
  const covered = new Set(filled.map(({ cat }) => cat.industrySlug));
  const others = marketRootCategories()
    .filter((r) => !covered.has(r.slug))
    .map((cat) => ({ cat, n: totalsFor(counts, cat, null).products }));
  return [...filled, ...others];
}
