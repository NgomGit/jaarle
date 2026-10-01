import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Grande barre de recherche de l'accueil du Market (+ suggestions). Formulaire GET simple :
// fonctionne sans JavaScript, la page de résultats prend le relais.

export const SEARCH_SUGGESTIONS = ["Chaussures", "Parfum", "Robe", "Téléphone", "Sac"];

export function MarketSearchHero({ className, defaultValue }: { className?: string; defaultValue?: string }) {
  return (
    <div className={className}>
      <form action="/market/recherche" role="search" className="relative">
        <label htmlFor="hero-q" className="sr-only">
          Que recherchez-vous ?
        </label>
        <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#17151F]" strokeWidth={2.2} aria-hidden />
        <input
          id="hero-q"
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          defaultValue={defaultValue}
          placeholder="Que recherchez-vous ?"
          className="h-14 w-full rounded-full border-[1.5px] border-[#17151F] bg-white pl-[52px] pr-16 sm:pr-[118px] text-base text-[#17151F] shadow-[0_8px_24px_-16px_rgba(23,21,31,0.45)] outline-none placeholder:text-[#8A8698] focus:border-[#4F43E0] sm:h-16 sm:text-[17px]"
        />
        <button
          type="submit"
          aria-label="Chercher"
          className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#17151F] text-sm font-bold text-white transition-colors hover:bg-[#4F43E0] sm:h-[52px] sm:w-auto sm:px-6 sm:text-[15px]"
        >
          <ArrowRight className="h-5 w-5 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Chercher</span>
        </button>
      </form>
      <ul
        className={cn("-mx-4 mt-3.5 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0")}
        aria-label="Recherches fréquentes"
      >
        {SEARCH_SUGGESTIONS.map((s) => (
          <li key={s} className="shrink-0">
            <Link
              href={`/market/recherche?${new URLSearchParams({ q: s.toLowerCase() }).toString()}`}
              className="inline-flex h-9 items-center rounded-full bg-[#F2F0EA] px-3.5 text-[13px] font-semibold text-[#4A4656] transition-colors hover:bg-[#E9E6DD] hover:text-[#17151F]"
            >
              {s}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
