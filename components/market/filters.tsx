"use client";

import * as React from "react";
import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import { MarketCategoryPicker } from "@/components/market/market-category-picker";
import { cn } from "@/lib/utils";

// Filtres du Market (recherche, catégories, villes). Formulaires GET : ils marchent sans JavaScript.
// Mobile : un bouton « Filtrer » ouvre un panneau par le bas ; ordinateur : une barre en ligne.
// On ne montre que les filtres utiles à la page (jamais 15 à la fois).

export type FilterField = "category" | "city" | "price" | "available" | "promo" | "sort";
export type Option = { value: string; label: string; group?: string };

export interface FilterValues {
  category: string | null;
  city: string | null;
  min: number | null;
  max: number | null;
  available: boolean;
  /** En promo uniquement (?promo=1). */
  promo?: boolean;
  sort: string;
}

const SORTS: Option[] = [
  { value: "relevance", label: "Pertinence" },
  { value: "new", label: "Plus récents" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "promo", label: "Meilleures remises" },
];

export function MarketFilters({
  action,
  fields,
  values,
  hidden = {},
  categories = [],
  cities = [],
  resetHref,
  total,
}: {
  action: string;
  fields: FilterField[];
  values: FilterValues;
  /** Paramètres conservés (recherche, type d'annonce…). */
  hidden?: Record<string, string | null | undefined>;
  categories?: Option[];
  cities?: Option[];
  resetHref: string;
  total: number;
}) {
  const [open, setOpen] = React.useState(false);
  const has = (f: FilterField) => fields.includes(f);
  const active =
    (has("category") && values.category ? 1 : 0) +
    (has("city") && values.city ? 1 : 0) +
    (has("price") && (values.min != null || values.max != null) ? 1 : 0) +
    (has("available") && values.available ? 1 : 0) +
    (has("promo") && values.promo ? 1 : 0) +
    (values.sort !== "relevance" ? 1 : 0);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const hiddenInputs = Object.entries(hidden)
    .filter(([, v]) => v)
    .map(([k, v]) => <input key={k} type="hidden" name={k} value={v!} />);

  const submitOnChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => e.currentTarget.form?.requestSubmit();

  return (
    <>
      {/* Ordinateur : barre en ligne (les listes déroulantes s'appliquent tout de suite). */}
      <form method="get" action={action} className="hidden flex-wrap items-end gap-3 sm:flex">
        {hiddenInputs}
        {has("category") && categories.length > 0 && (
          <div className="flex w-[240px] flex-col gap-1 text-xs font-bold text-[#5E5A6B]">
            Catégorie
            <MarketCategoryPicker name="categorie" value={values.category ?? ""} allowGroups autoSubmit placeholder="Toutes" className="font-normal" />
          </div>
        )}
        {has("city") && cities.length > 0 && (
          <Field label="Ville">
            <Select name="ville" defaultValue={values.city ?? ""} onChange={submitOnChange} options={cities} empty="Tout le Sénégal" />
          </Field>
        )}
        {has("price") && <PriceInputs values={values} compact />}
        {has("available") && (
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#D9D5CB] bg-white px-3.5 text-sm font-semibold">
            <input type="checkbox" name="dispo" value="1" defaultChecked={values.available} onChange={submitOnChange} className="h-4 w-4 accent-[#17151F]" />
            Disponible
          </label>
        )}
        {has("promo") && (
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#D9D5CB] bg-white px-3.5 text-sm font-semibold">
            <input type="checkbox" name="promo" value="1" defaultChecked={values.promo} onChange={submitOnChange} className="h-4 w-4 accent-[#E5484D]" />
            En promo
          </label>
        )}
        <Field label="Trier par" className="ml-auto">
          <Select name="tri" defaultValue={values.sort} onChange={submitOnChange} options={SORTS} />
        </Field>
        {has("price") && (
          <button type="submit" className="h-11 rounded-xl bg-[#17151F] px-4 text-sm font-bold text-white">
            Appliquer
          </button>
        )}
        {active > 0 && (
          <Link href={resetHref} className="flex h-11 items-center text-sm font-bold text-[#4F43E0]">
            Effacer
          </Link>
        )}
      </form>

      {/* Mobile : bouton + panneau */}
      <div className="flex items-center gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-[#17151F] bg-white px-4 text-sm font-bold"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filtrer
          {active > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#17151F] px-1 text-[11px] text-white">{active}</span>
          )}
        </button>
        {active > 0 && (
          <Link href={resetHref} className="inline-flex h-11 items-center px-2 text-sm font-bold text-[#4F43E0]">
            Effacer
          </Link>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Filtres">
          <button type="button" aria-label="Fermer" className="absolute inset-0 bg-[#17151F]/40 animate-in fade-in" onClick={() => setOpen(false)} />
          <form
            method="get"
            action={action}
            onSubmit={() => setOpen(false)}
            className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[28px] bg-[#FAFAF7] pb-[env(safe-area-inset-bottom)] text-[#17151F] shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.4)] animate-in slide-in-from-bottom duration-200"
          >
            {hiddenInputs}
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <span className="mx-auto h-1 w-10 rounded-full bg-[#D9D5CB]" aria-hidden />
            </div>
            <div className="flex items-center justify-between px-5 pb-3">
              <p className="font-[family-name:var(--font-market-display)] text-xl font-bold">Filtrer et trier</p>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F0EA]" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-5">
              <fieldset>
                <legend className="mb-2 text-sm font-bold">Trier par</legend>
                <div className="grid grid-cols-2 gap-2">
                  {SORTS.map((s) => (
                    <label key={s.value} className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-[#D9D5CB] bg-white text-sm font-semibold has-[:checked]:border-[#17151F] has-[:checked]:bg-[#17151F] has-[:checked]:text-white">
                      <input type="radio" name="tri" value={s.value} defaultChecked={values.sort === s.value} className="sr-only" />
                      {s.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {has("category") && categories.length > 0 && (
                <div className="flex flex-col gap-2 text-sm font-bold text-[#17151F]">
                  Catégorie
                  <MarketCategoryPicker name="categorie" value={values.category ?? ""} allowGroups placeholder="Toutes les catégories" className="font-normal" />
                </div>
              )}
              {has("city") && cities.length > 0 && (
                <Field label="Ville" strong>
                  <Select name="ville" defaultValue={values.city ?? ""} options={cities} empty="Tout le Sénégal" />
                </Field>
              )}
              {has("price") && <PriceInputs values={values} />}
              {has("available") && (
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#D9D5CB] bg-white px-4 text-sm font-semibold">
                  Disponible uniquement
                  <input type="checkbox" name="dispo" value="1" defaultChecked={values.available} className="h-5 w-5 accent-[#17151F]" />
                </label>
              )}
              {has("promo") && (
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#D9D5CB] bg-white px-4 text-sm font-semibold">
                  En promo uniquement
                  <input type="checkbox" name="promo" value="1" defaultChecked={values.promo} className="h-5 w-5 accent-[#E5484D]" />
                </label>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-[#ECE9E1] bg-white px-5 py-3">
              <Link href={resetHref} className="flex h-12 items-center px-2 text-sm font-bold text-[#4F43E0]" onClick={() => setOpen(false)}>
                Réinitialiser
              </Link>
              <button type="submit" className="h-12 flex-1 rounded-full bg-[#17151F] text-[15px] font-bold text-white">
                Afficher les résultats{total > 0 ? ` (${total})` : ""}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({ label, className, strong = false, children }: { label: string; className?: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex min-w-[150px] flex-col", strong ? "gap-2 text-sm font-bold text-[#17151F]" : "gap-1 text-xs font-bold text-[#5E5A6B]", className)}>
      {label}
      {children}
    </label>
  );
}

function Select({
  name,
  defaultValue,
  options,
  empty,
  onChange,
}: {
  name: string;
  defaultValue: string;
  options: Option[];
  empty?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  const groups = new Map<string, Option[]>();
  for (const o of options) {
    const g = o.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={onChange}
      className="h-11 w-full rounded-xl border border-[#D9D5CB] bg-white px-3 text-sm font-semibold text-[#17151F]"
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {[...groups.entries()].map(([g, opts]) =>
        g ? (
          <optgroup key={g} label={g}>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        )
      )}
    </select>
  );
}

function PriceInputs({ values, compact = false }: { values: FilterValues; compact?: boolean }) {
  const input = "h-11 w-full rounded-xl border border-[#D9D5CB] bg-white px-3 text-sm text-[#17151F]";
  return (
    <fieldset className={cn("flex gap-2", compact ? "w-[220px]" : "")}>
      <legend className={cn("text-xs font-bold text-[#5E5A6B]", compact ? "mb-1" : "mb-2 text-sm text-[#17151F]")}>Prix (FCFA)</legend>
      <input name="min" type="number" inputMode="numeric" min={0} step={500} defaultValue={values.min ?? ""} placeholder="Min" aria-label="Prix minimum" className={input} />
      <input name="max" type="number" inputMode="numeric" min={0} step={500} defaultValue={values.max ?? ""} placeholder="Max" aria-label="Prix maximum" className={input} />
    </fieldset>
  );
}
