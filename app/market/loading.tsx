import { MarketShell } from "@/components/market/shell";

// Squelette du Market pendant le chargement d'une page (accueil, catégorie, ville, recherche).
export default function MarketLoading() {
  return (
    <MarketShell>
      <main className="mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6" aria-busy="true" aria-label="Chargement">
        <div className="h-9 w-2/3 max-w-md animate-pulse rounded-xl bg-[#ECE9E1]" />
        <div className="mt-3 h-4 w-1/2 max-w-sm animate-pulse rounded-lg bg-[#F0EEE8]" />
        <div className="mt-6 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-11 w-28 shrink-0 animate-pulse rounded-full bg-[#F0EEE8]" />
          ))}
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <div className="aspect-square animate-pulse rounded-[20px] bg-[#ECE9E1]" />
              <div className="mt-3 h-3.5 w-4/5 animate-pulse rounded bg-[#F0EEE8]" />
              <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-[#ECE9E1]" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-[#F0EEE8]" />
            </li>
          ))}
        </ul>
      </main>
    </MarketShell>
  );
}
