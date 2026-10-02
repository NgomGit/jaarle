"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { allMarketCategories, getMarketCategory, marketRootCategories, type MarketCategory } from "@/lib/market/categories";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

// Choix d'une catégorie Jaarle Market, même composant visuel que le choix du secteur (CategoryPicker) :
// recherche, puis grandes catégories en grille → sous-catégories → catégories finales.
// • value / onChange : slug de catégorie (feuille, ou aussi sous-catégorie / grande catégorie si
//   `allowGroups`), "" quand rien n'est choisi.
// • name : ajoute un champ caché pour les formulaires serveur (GET / server actions).
// • autoSubmit : envoie le formulaire parent dès qu'une catégorie est choisie (filtres).

const LEAVES = allMarketCategories().filter((c) => c.level === 3);

function trail(c: MarketCategory): string {
  const parent = getMarketCategory(c.parentSlug);
  const root = getMarketCategory(c.industrySlug);
  return parent && parent.slug !== root?.slug ? `${root?.label ?? ""} › ${parent.label}` : root?.label ?? "";
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function MarketCategoryPicker({
  value,
  onChange,
  name,
  allowGroups = false,
  autoSubmit = false,
  required = false,
  clearable = true,
  placeholder,
  className,
  size = "md",
}: {
  value: string;
  onChange?: (slug: string) => void;
  name?: string;
  allowGroups?: boolean;
  autoSubmit?: boolean;
  required?: boolean;
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { t } = useLocale();
  const [current, setCurrent] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [rootSlug, setRootSlug] = React.useState<string | null>(null);
  const [subSlug, setSubSlug] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const hiddenRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setCurrent(value), [value]);

  React.useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const selected = getMarketCategory(current);
  const selectedRoot = selected ? getMarketCategory(selected.industrySlug) : null;
  const Icon = selectedRoot?.icon ?? null;
  const roots = marketRootCategories();
  const root = getMarketCategory(rootSlug);
  const sub = getMarketCategory(subSlug);

  function choose(slug: string) {
    setCurrent(slug);
    onChange?.(slug);
    setOpen(false);
    setQuery("");
    setRootSlug(null);
    setSubSlug(null);
    if (autoSubmit) {
      // Le champ caché doit porter la nouvelle valeur avant l'envoi.
      if (hiddenRef.current) hiddenRef.current.value = slug;
      setTimeout(() => containerRef.current?.closest("form")?.requestSubmit(), 0);
    }
  }

  function openPicker() {
    // Rouvre à l'endroit de la catégorie choisie.
    if (selected && !open) {
      setRootSlug(selected.industrySlug);
      setSubSlug(selected.level === 3 && selected.parentSlug !== selected.industrySlug ? selected.parentSlug : null);
    }
    setOpen((o) => !o);
  }

  const q = norm(query.trim());
  const results = q
    ? (allowGroups ? allMarketCategories() : LEAVES).filter((c) => norm(`${c.label} ${trail(c)}`).includes(q)).slice(0, 40)
    : [];

  const h = size === "sm" ? "h-10" : "h-11";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {name && <input ref={hiddenRef} type="hidden" name={name} value={current} required={required} />}
      <div
        className={cn(
          "flex w-full items-center rounded-xl border border-input bg-card text-sm text-foreground transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
          h
        )}
      >
        <button type="button" onClick={openPicker} aria-expanded={open} className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3.5 text-left outline-none">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} /> : <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
          <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
            {selected ? (
              <>
                {selected.label}
                {selected.level > 1 && <span className="ml-1.5 text-xs text-muted-foreground">{trail(selected)}</span>}
              </>
            ) : (
              placeholder ?? t("products.marketCategoryNone")
            )}
          </span>
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        </button>
        {clearable && selected && (
          <button type="button" onClick={() => choose("")} aria-label="Retirer la catégorie" className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full min-w-[280px] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setRootSlug(null);
                setSubSlug(null);
              }}
              placeholder="Rechercher une catégorie…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {q ? (
              results.length > 0 ? (
                results.map((c) => {
                  const RIcon = getMarketCategory(c.industrySlug)?.icon;
                  return (
                    <button key={c.slug} type="button" onClick={() => choose(c.slug)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                      {RIcon && <RIcon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />}
                      <span className="flex-1 truncate">{c.label}</span>
                      <span className="shrink-0 truncate text-[11px] text-muted-foreground">{c.level > 1 ? trail(c) : ""}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">{t("creation.industryNoResults")}</p>
              )
            ) : root && sub ? (
              <>
                <BackButton onClick={() => setSubSlug(null)} label={root.label} />
                {allowGroups && <WholeButton label={sub.label} onClick={() => choose(sub.slug)} />}
                {sub.childSlugs.map((s) => {
                  const leaf = getMarketCategory(s);
                  if (!leaf) return null;
                  return (
                    <button key={s} type="button" onClick={() => choose(s)} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                      {leaf.label}
                      {current === s && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </>
            ) : root ? (
              <>
                <BackButton onClick={() => setRootSlug(null)} label="Toutes les catégories" />
                {allowGroups && <WholeButton label={root.label} icon={root.icon} onClick={() => choose(root.slug)} />}
                {root.childSlugs.map((s) => {
                  const c = getMarketCategory(s);
                  if (!c) return null;
                  const isLeaf = c.level === 3;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => (isLeaf ? choose(s) : setSubSlug(s))}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                    >
                      {c.label}
                      {isLeaf ? current === s && <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </button>
                  );
                })}
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2 p-1">
                {roots.map((r) => {
                  const RIcon = r.icon;
                  return (
                    <button
                      key={r.slug}
                      type="button"
                      onClick={() => setRootSlug(r.slug)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors",
                        selected?.industrySlug === r.slug ? "border-primary bg-accent" : "border-border hover:bg-muted"
                      )}
                    >
                      {RIcon && <RIcon className="h-5 w-5 text-primary" strokeWidth={1.75} />}
                      <span className="text-[11px] font-medium leading-tight">{r.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
      <ChevronLeft className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function WholeButton({ label, icon: Icon, onClick }: { label: string; icon?: MarketCategory["icon"]; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-sm font-medium hover:bg-muted"
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />}
      Tout « {label} »
    </button>
  );
}
