import Link from "next/link";
import { Search } from "lucide-react";
import { marketBody, marketDisplay } from "@/components/market/fonts";
import { marketRootCategories } from "@/lib/market/categories";
import { MARKET_CITIES } from "@/lib/market/cities";
import { cn } from "@/lib/utils";

// Habillage commun du Market et de l'annuaire : en-tête (recherche + ville), catégories, pied de
// page avec maillage catégories × villes. Toujours en clair (indépendant du thème du tableau de bord).

export const INK = "#17151F";

/** `home` : accueil du Market — la recherche et les catégories sont dans la page (pas en double dans l'en-tête). */
/** `searchInHeader={false}` : la page a sa propre recherche (page de résultats). */
export function MarketShell({
  children,
  query,
  city,
  home = false,
  searchInHeader = true,
}: {
  children: React.ReactNode;
  query?: string;
  city?: string | null;
  home?: boolean;
  searchInHeader?: boolean;
}) {
  return (
    <div
      className={cn(
        marketBody.variable,
        marketDisplay.variable,
        "min-h-screen bg-[#FAFAF7] font-[family-name:var(--font-market-body)] text-[#17151F] [color-scheme:light]"
      )}
      // Les cartes produit de la vitrine lisent ces variables (couleur d'accent de la boutique) :
      // sur le Market, on utilise le violet Jaarle.
      style={{ ["--sf-accent" as string]: "#4F43E0", ["--sf-accent-text" as string]: "#FFFFFF", ["--sf-accent-soft" as string]: "#EEECFD" }}
    >
      <div className="bg-[#17151F] text-[12px] font-medium text-[#E9E7F2] sm:text-[13px]">
        <div className="mx-auto flex max-w-[1240px] justify-center gap-x-5 px-4 py-1.5 sm:gap-x-7 sm:px-6 sm:py-2">
          <span>Commande directe sur WhatsApp</span>
          <span aria-hidden className="hidden opacity-50 sm:inline">•</span>
          <span className="hidden sm:inline">Aucun paiement sur le site</span>
          <span aria-hidden className="hidden opacity-50 sm:inline">•</span>
          <span className="hidden sm:inline">Boutiques du Sénégal</span>
        </div>
      </div>
      <MarketHeader query={query} city={city} home={home} search={searchInHeader && !home} />
      {children}
      <MarketFooter />
    </div>
  );
}

export function MarketLogo() {
  return (
    <Link href="/market" className="flex items-center gap-2.5 text-[#17151F]" aria-label="Jaarle Market — accueil">
      {/* Logo Jaarle (même icône que le site vitrine). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo-icon-96.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
      <span className="font-[family-name:var(--font-market-display)] text-[22px] font-extrabold tracking-tight">Jaarle</span>
      <span className="rounded-md border-[1.5px] border-[#4F43E0] px-1.5 py-px text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#4F43E0]">
        Market
      </span>
    </Link>
  );
}

function MarketHeader({ query, city, home, search }: { query?: string; city?: string | null; home: boolean; search: boolean }) {
  const roots = marketRootCategories();
  return (
    <header className="border-b border-[#ECE9E1] bg-[#FAFAF7]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-7 gap-y-3 px-4 py-3 sm:px-6 sm:py-4">
        <MarketLogo />
        {search && (
        <form
          action="/market/recherche"
          role="search"
          className={cn(
            "order-3 h-12 w-full min-w-0 items-center gap-2.5 rounded-full border-[1.5px] border-[#17151F] bg-white pl-4 pr-1.5 sm:order-none sm:w-auto sm:flex-1",
            home ? "hidden sm:flex" : "flex"
          )}
        >
          <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
          <label htmlFor="market-q" className="sr-only">
            Rechercher un produit ou une boutique
          </label>
          <input
            id="market-q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Robe wax, thiouraye, sac en cuir…"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8A8698]"
          />
          <label htmlFor="market-ville" className="sr-only">
            Ville
          </label>
          <select
            id="market-ville"
            name="ville"
            defaultValue={city ?? ""}
            className="hidden h-8 border-l border-[#E4E1D8] bg-transparent px-3 text-sm font-semibold outline-none md:block"
          >
            <option value="">Tout le Sénégal</option>
            {MARKET_CITIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="h-9 shrink-0 rounded-full bg-[#17151F] px-4 text-sm font-bold text-white">
            Chercher
          </button>
        </form>
        )}
        <nav aria-label="Principal" className={cn("ml-auto flex items-center gap-5 text-[15px] font-bold", search && "sm:ml-0")}>
          <Link href="/boutiques" className="text-[#17151F] hover:text-[#4F43E0]">
            Boutiques
          </Link>
          <Link
            href="/tarifs"
            className="hidden h-10 items-center rounded-full bg-[#4F43E0] px-4 text-white hover:bg-[#3F34C4] sm:inline-flex"
          >
            Vendre sur Jaarle
          </Link>
        </nav>
      </div>
      <nav
        aria-label="Catégories"
        className={cn("mx-auto max-w-[1240px] gap-6 overflow-x-auto whitespace-nowrap px-4 pb-3 text-sm font-semibold [scrollbar-width:none] sm:px-6", home ? "hidden" : "flex")}
      >
        {roots.map((c) => (
          <Link key={c.slug} href={`/market/${c.slug}`} className="text-[#5E5A6B] hover:text-[#17151F]">
            {c.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function MarketFooter() {
  const roots = marketRootCategories();
  const cities = MARKET_CITIES.slice(0, 8);
  return (
    <footer className="mt-20 bg-[#17151F] pb-9 pt-16 text-white">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          <div className="col-span-2 lg:col-span-1">
            <p className="font-[family-name:var(--font-market-display)] text-2xl font-extrabold">
              Jaarle <span className="text-[#F2B441]">Market</span>
            </p>
            <p className="mt-3 text-sm leading-7 text-[#C9C6D6]">
              Le marché en ligne des boutiques du Sénégal. Commande directe sur WhatsApp, sans paiement sur le site.
            </p>
          </div>
          <nav aria-label="Catégories">
            <p className="mb-2 font-extrabold">Catégories</p>
            {roots.map((c) => (
              <Link key={c.slug} href={`/market/${c.slug}`} className="block text-sm leading-8 text-[#C9C6D6] hover:text-white">
                {c.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Villes">
            <p className="mb-2 font-extrabold">Villes</p>
            {cities.map((c) => (
              <Link key={c.slug} href={`/market/${c.slug}`} className="block text-sm leading-8 text-[#C9C6D6] hover:text-white">
                Acheter à {c.name}
              </Link>
            ))}
          </nav>
          <nav aria-label="Jaarle" className="col-span-2 lg:col-span-1">
            <p className="mb-2 font-extrabold">Jaarle</p>
            <Link href="/boutiques" className="block text-sm leading-8 text-[#C9C6D6] hover:text-white">
              Toutes les boutiques
            </Link>
            <Link href="/tarifs" className="block text-sm leading-8 text-[#C9C6D6] hover:text-white">
              Vendre sur Jaarle Market
            </Link>
            <Link href="/register" className="block text-sm leading-8 text-[#C9C6D6] hover:text-white">
              Créer ma boutique gratuite
            </Link>
          </nav>
        </div>
        <div className="mt-12 flex flex-wrap justify-between gap-3 border-t border-[#2E2B3A] pt-5 text-[13px] text-[#9E9AAE]">
          <span>© Jaarle · Dakar, Sénégal</span>
          <span>Jaarle met en relation acheteurs et vendeurs ; chaque vente se conclut avec la boutique.</span>
        </div>
      </div>
    </footer>
  );
}
