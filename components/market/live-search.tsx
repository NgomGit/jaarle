"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

// Recherche instantanée de la page de résultats : l'URL suit la saisie (après une courte pause),
// la page serveur se recharge seule. Pas d'API dédiée, pas de requête à chaque lettre.

const DEBOUNCE_MS = 400;
const PendingContext = React.createContext(false);

/** Résultats atténués pendant le chargement d'une nouvelle recherche. */
export function SearchResults({ children }: { children: React.ReactNode }) {
  const pending = React.useContext(PendingContext);
  return (
    <div aria-busy={pending} className={pending ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
      {children}
    </div>
  );
}

export function LiveSearch({ initial, children }: { initial: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const timer = React.useRef<ReturnType<typeof setTimeout>>();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Retour arrière / lien de suggestion : la saisie suit l'URL.
  React.useEffect(() => setValue(initial), [initial]);

  function navigate(q: string) {
    const next = new URLSearchParams(params.toString());
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function onChange(v: string) {
    setValue(v);
    clearTimeout(timer.current);
    // Rien avant 2 lettres (sauf pour vider la recherche).
    if (v.trim().length === 1) return;
    timer.current = setTimeout(() => navigate(v), DEBOUNCE_MS);
  }

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <PendingContext.Provider value={pending}>
      <form
        role="search"
        action={pathname}
        onSubmit={(e) => {
          e.preventDefault();
          clearTimeout(timer.current);
          navigate(value);
          inputRef.current?.blur();
        }}
        className="relative"
      >
        <label htmlFor="live-q" className="sr-only">
          Que recherchez-vous ?
        </label>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" strokeWidth={2.2} aria-hidden />
        <input
          ref={inputRef}
          id="live-q"
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Que recherchez-vous ?"
          className="h-14 w-full rounded-full border-[1.5px] border-[#17151F] bg-white pl-12 pr-12 text-base outline-none placeholder:text-[#8A8698] focus:border-[#4F43E0] [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center">
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#4F43E0]" aria-label="Recherche en cours" />
          ) : value ? (
            <button
              type="button"
              onClick={() => {
                setValue("");
                clearTimeout(timer.current);
                navigate("");
                inputRef.current?.focus();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F2F0EA]"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </span>
      </form>
      {children}
    </PendingContext.Provider>
  );
}
