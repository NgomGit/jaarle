"use client";

import * as React from "react";
import { Search, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { categoryTree, type CategoryNode } from "@/lib/knowledge/category-tree";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

interface FlatLeaf {
  category: CategoryNode;
  subLabel: string;
  leafLabel: string;
  searchText: string;
}

const ALL_LEAVES: FlatLeaf[] = categoryTree.flatMap((category) =>
  category.subCategories.flatMap((sub) =>
    sub.leaves.map((leaf) => ({
      category,
      subLabel: sub.label,
      leafLabel: leaf.label,
      searchText: `${category.label} ${sub.label} ${leaf.label}`.toLowerCase(),
    }))
  )
);

export function CategoryPicker({ value, onChange }: { value: string; onChange: (industryKey: string) => void }) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [catIndex, setCatIndex] = React.useState<number | null>(null);
  const [subIndex, setSubIndex] = React.useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!value) setSelectedLabel(null);
  }, [value]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCategory = categoryTree.find((c) => c.industryKey === value);
  const SelectedIcon = selectedCategory?.icon;

  function resetNav() {
    setQuery("");
    setCatIndex(null);
    setSubIndex(null);
  }

  function selectLeaf(industryKey: string, label: string) {
    onChange(industryKey);
    setSelectedLabel(label);
    setOpen(false);
    resetNav();
  }

  const filtered = query.trim() ? ALL_LEAVES.filter((l) => l.searchText.includes(query.trim().toLowerCase())) : [];
  const activeCategory = catIndex !== null ? categoryTree[catIndex] : null;
  const activeSub = activeCategory && subIndex !== null ? activeCategory.subCategories[subIndex] : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
      >
        {SelectedIcon ? (
          <SelectedIcon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        )}
        <span className={cn("flex-1 truncate text-left", !value && "text-muted-foreground")}>
          {value ? selectedLabel ?? selectedCategory?.label : t("creation.industryPlaceholder")}
        </span>
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCatIndex(null);
                setSubIndex(null);
              }}
              placeholder={t("creation.industrySearchPlaceholder")}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {query.trim() ? (
              filtered.length > 0 ? (
                filtered.map((l) => (
                  <button
                    key={`${l.category.industryKey}-${l.leafLabel}`}
                    type="button"
                    onClick={() => selectLeaf(l.category.industryKey, l.leafLabel)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                  >
                    <l.category.icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{l.leafLabel}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{l.category.label}</span>
                  </button>
                ))
              ) : (
                <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">{t("creation.industryNoResults")}</p>
              )
            ) : activeCategory && activeSub ? (
              <>
                <button
                  type="button"
                  onClick={() => setSubIndex(null)}
                  className="mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> {activeCategory.label}
                </button>
                {activeSub.leaves.map((leaf) => (
                  <button
                    key={leaf.key}
                    type="button"
                    onClick={() => selectLeaf(activeCategory.industryKey, leaf.label)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                  >
                    {leaf.label}
                    {value === activeCategory.industryKey && selectedLabel === leaf.label && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </>
            ) : activeCategory ? (
              <>
                <button
                  type="button"
                  onClick={() => setCatIndex(null)}
                  className="mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> {t("creation.industryAllCategories")}
                </button>
                <button
                  type="button"
                  onClick={() => selectLeaf(activeCategory.industryKey, activeCategory.label)}
                  className="mb-1 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-sm font-medium hover:bg-muted"
                >
                  <activeCategory.icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                  {t("creation.industrySelectWhole").replace("{category}", activeCategory.label)}
                </button>
                {activeCategory.subCategories.map((sub, i) => (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() => setSubIndex(i)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                  >
                    {sub.label}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2 p-1">
                {categoryTree.map((cat, i) => (
                  <button
                    key={cat.industryKey}
                    type="button"
                    onClick={() => setCatIndex(i)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors",
                      value === cat.industryKey ? "border-primary bg-accent" : "border-border hover:bg-muted"
                    )}
                  >
                    <cat.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                    <span className="text-[11px] font-medium leading-tight">{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
