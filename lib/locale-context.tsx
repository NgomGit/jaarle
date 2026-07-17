"use client";

import * as React from "react";
import fr from "@/lib/dictionaries/fr.json";
import en from "@/lib/dictionaries/en.json";

type Locale = "fr" | "en";
const dictionaries = { fr, en } as const;

// Simple dot-path getter, e.g. t("hero.title")
function getPath(obj: any, path: string): string {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : path), obj);
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string) => string;
}

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("fr");

  React.useEffect(() => {
    const stored = window.localStorage.getItem("affisse-locale") as Locale | null;
    if (stored === "fr" || stored === "en") setLocaleState(stored);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    window.localStorage.setItem("affisse-locale", l);
  };

  const t = React.useCallback((path: string) => getPath(dictionaries[locale], path), [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
