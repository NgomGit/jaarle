"use client";

import * as React from "react";
import { AlertTriangle, Ban, Check, CheckCircle2, Film, ImageOff, Loader2, RotateCcw, Search, Sparkles, Star, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarketCategoryPicker } from "@/components/market/market-category-picker";
import { shopMediaThumbUrl } from "@/lib/shops/media";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";
import {
  PHOTOS_PER_PRODUCT,
  groupMissing,
  groupState,
  productPhotoIds,
  suggestKeyOf,
  type ImportDraft,
  type ImportGroup,
  type ImportItem,
  type ImportState,
  type ImportVariant,
} from "@/lib/products/bulk-import";

// Carte de révision d'un produit du lot : photos, nom, prix, catégorie, description, état.

export type PhotoAction =
  | { kind: "main" }
  | { kind: "move"; groupId: string }
  | { kind: "new" }
  | { kind: "unsorted" }
  | { kind: "removed" };

const STATE_BADGE = {
  created: { variant: "success", key: "bulk.stateCreated" },
  excluded: { variant: "neutral", key: "bulk.stateExcluded" },
  review: { variant: "warning", key: "bulk.stateReview" },
  incomplete: { variant: "warning", key: "bulk.stateIncomplete" },
  ready: { variant: "success", key: "bulk.stateReady" },
} as const;

export function groupTitle(g: ImportGroup, index: number, t: (k: string) => string): string {
  return g.draft.name.trim() || g.label || t("bulk.productN").replace("{n}", String(index + 1));
}

/** Vignette d'un média ; `selected` l'entoure, `main` affiche l'étoile. */
export function MediaThumb({
  item,
  main,
  unused,
  selected,
  onClick,
}: {
  item: ImportItem;
  main?: boolean;
  unused?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { t } = useLocale();
  const url = shopMediaThumbUrl(item.path);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted outline-none transition",
        selected ? "border-primary ring-2 ring-primary" : "border-border",
        unused && "opacity-50"
      )}
      aria-label={item.name || t("bulk.photo")}
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
      {main && (
        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
          <Star className="h-3 w-3 fill-current" />
        </span>
      )}
      {item.videoRef && (
        <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
          <Film className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

/**
 * Choix d'un produit du lot par sa photo (plus parlant qu'une liste de noms) : grille de vignettes
 * avec nom et nombre de photos, recherche quand il y a beaucoup de produits.
 */
export function ProductPicker({
  state,
  excludeId,
  title,
  onPick,
  onPickMany,
  mergedInto,
  onClose,
}: {
  state: ImportState;
  /** Produit à ne pas proposer (celui d'où l'on part). */
  excludeId: string | null;
  title: string;
  /** Choix unique : un tap suffit. */
  onPick?: (groupId: string) => void;
  /** Choix multiple : on coche plusieurs produits puis on valide. */
  onPickMany?: (groupIds: string[]) => void;
  /** Fusion : produit cible ; ceux déjà fusionnés dedans sont proposés cochés (décocher = recréer). */
  mergedInto?: ImportGroup;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = React.useState("");
  const alreadyMerged = (mergedInto?.merged ?? []).map((m) => m.id);
  const [checked, setChecked] = React.useState<string[]>(alreadyMerged);
  const multiple = !!onPickMany;
  const toggle = (id: string) => setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const items = new Map(state.items.map((i) => [i.id, i]));
  type Entry = { id: string; title: string; mainId: string | null; count: number; merged: boolean };
  const all: Entry[] = [
    // Déjà fusionnés dans ce produit : en tête, cochés.
    ...(mergedInto?.merged ?? []).map((m, k) => ({
      id: m.id,
      title: m.draft.name.trim() || m.label || t("bulk.productN").replace("{n}", String(k + 1)),
      mainId: m.mainId,
      count: m.itemIds.filter((x) => mergedInto?.itemIds.includes(x)).length,
      merged: true,
    })),
    ...state.groups
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.id !== excludeId && !g.productId && !g.excluded)
      .map(({ g, i }) => ({ id: g.id, title: groupTitle(g, i, t), mainId: g.mainId, count: g.itemIds.length, merged: false })),
  ];
  const changed = checked.length !== alreadyMerged.length || checked.some((id) => !alreadyMerged.includes(id));
  const q = query.trim().toLowerCase();
  const list = q ? all.filter((x) => x.merged || x.title.toLowerCase().includes(q)) : all;

  // Échap ferme ; la page derrière ne défile plus tant que la feuille est ouverte.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Feuille plein écran sur mobile (fenêtre centrée sur ordinateur) : en-tête et bouton d'action
  // toujours visibles, seule la grille défile.
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3 border-b border-border px-4 pb-3 pt-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{title}</p>
              {multiple && (
                <p className="text-xs text-muted-foreground">{alreadyMerged.length ? t("bulk.unmergeHint") : t("bulk.selectHint")}</p>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label={t("bulk.close")}>
              <X className="h-5 w-5" />
            </button>
          </div>
          {all.length > 8 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("bulk.searchProduct")} className="pl-9" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("bulk.noProductFound")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {list.map((e) => {
                const main = e.mainId ? items.get(e.mainId) : undefined;
                const url = main ? shopMediaThumbUrl(main.path) : null;
                const isChecked = checked.includes(e.id);
                const name = e.title;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-pressed={multiple ? isChecked : undefined}
                      onClick={() => (multiple ? toggle(e.id) : onPick?.(e.id))}
                      className={cn(
                        "group flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left outline-none transition hover:border-primary focus-visible:ring-2 focus-visible:ring-primary",
                        isChecked ? "border-primary ring-2 ring-primary" : "border-border"
                      )}
                    >
                      <span className="relative block aspect-square w-full bg-muted">
                        {multiple && (
                          <span
                            className={cn(
                              "absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2",
                              isChecked ? "border-primary bg-primary text-white" : "border-white bg-black/30"
                            )}
                          >
                            {isChecked && <Check className="h-3 w-3" />}
                          </span>
                        )}
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageOff className="h-5 w-5" />
                          </span>
                        )}
                        <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                          {e.count}
                        </span>
                        {e.merged && (
                          <span className="absolute bottom-1 left-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">{t("bulk.mergedTag")}</span>
                        )}
                      </span>
                      <span className="line-clamp-2 px-2 py-1.5 text-[11px] font-medium leading-tight group-hover:text-primary">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {multiple && (
          <div className="flex items-center gap-2 border-t border-border bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("bulk.selectedCount").replace("{n}", String(checked.length))}</p>
              {checked.length > 0 && (
                <button type="button" onClick={() => setChecked([])} className="text-xs text-muted-foreground underline">
                  {t("bulk.clearSelection")}
                </button>
              )}
            </div>
            <Button type="button" variant="accent" size="lg" disabled={!changed} onClick={() => onPickMany?.(checked)}>
              {alreadyMerged.length ? t("bulk.applyMerge") : t("bulk.mergeSelected").replace("{n}", String(checked.length))}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Actions sur la photo sélectionnée (feuille sous la carte, sans glisser-déposer : fiable sur mobile). */
export function PhotoSheet({
  state,
  fromGroupId,
  canSetMain,
  onAction,
  onClose,
}: {
  state: ImportState;
  /** Groupe d'où vient la photo ; null = non rangée. */
  fromGroupId: string | null;
  canSetMain: boolean;
  onAction: (a: PhotoAction) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [picking, setPicking] = React.useState(false);
  const hasTargets = state.groups.some((g) => g.id !== fromGroupId && !g.productId && !g.excluded);
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap gap-2">
        {canSetMain && (
          <Button type="button" size="sm" variant="secondary" onClick={() => onAction({ kind: "main" })}>
            <Star className="h-3.5 w-3.5" />
            {t("bulk.setMain")}
          </Button>
        )}
        {hasTargets && (
          <Button type="button" size="sm" variant={picking ? "default" : "secondary"} onClick={() => setPicking((v) => !v)}>
            {t("bulk.moveTo")}
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={() => onAction({ kind: "new" })}>
          {t("bulk.toNewProduct")}
        </Button>
        {fromGroupId && (
          <Button type="button" size="sm" variant="secondary" onClick={() => onAction({ kind: "unsorted" })}>
            {t("bulk.toUnsorted")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => onAction({ kind: "removed" })}>
          <Ban className="h-3.5 w-3.5" />
          {t("bulk.removePhoto")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t("bulk.close")}
        </Button>
      </div>
      {picking && (
        <ProductPicker
          state={state}
          excludeId={fromGroupId}
          title={t("bulk.moveTo")}
          onPick={(groupId) => onAction({ kind: "move", groupId })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

export function GroupCard({
  state,
  group,
  index,
  suggesting,
  selectedItem,
  onSelectItem,
  onPhotoAction,
  onDraft,
  onExclude,
  onMerge,
  onMergeMany,
  onUnmerge,
  onReviewed,
  onResuggest,
}: {
  state: ImportState;
  group: ImportGroup;
  index: number;
  suggesting: boolean;
  selectedItem: string | null;
  onSelectItem: (itemId: string | null) => void;
  onPhotoAction: (itemId: string, a: PhotoAction) => void;
  onDraft: (patch: Partial<ImportDraft>) => void;
  onExclude: (excluded: boolean) => void;
  onMerge: (fromId: string, option?: { name: string; values: string[] }) => void;
  /** Sélection complète du sélecteur de fusion : nouveaux cochés = fusionnés, déjà fusionnés décochés = recréés. */
  onMergeMany: (selectedIds: string[]) => void;
  /** Recrée un produit fusionné dans celui-ci. */
  onUnmerge: (mergedId: string) => void;
  onReviewed: () => void;
  onResuggest: () => void;
}) {
  const { t } = useLocale();
  const [showMore, setShowMore] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const priceRef = React.useRef<HTMLInputElement>(null);
  const items = new Map(state.items.map((i) => [i.id, i]));
  const st = groupState(group);
  const badge = STATE_BADGE[st];
  const locked = !!group.productId;
  const used = new Set(productPhotoIds(state, group));
  const missing = groupMissing(group);
  const staleSuggestion = group.suggestion === "ready" && group.suggestKey !== suggestKeyOf(state, group);
  const variants: ImportVariant[] = (state.variants ?? []).filter((v) => v.groupIds[0] === group.id);
  const others = state.groups.map((g, i) => ({ g, i })).filter(({ g }) => g.id !== group.id && !g.productId);
  const d = group.draft;

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-4",
        st === "review" || st === "incomplete" ? "border-warning/40" : "border-border",
        group.excluded && "opacity-60"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{groupTitle(group, index, t)}</p>
          <p className="text-xs text-muted-foreground">
            {t("bulk.photosCount").replace("{n}", String(group.itemIds.length))}
            {group.itemIds.length > PHOTOS_PER_PRODUCT ? ` · ${t("bulk.photosUnused").replace("{n}", String(group.itemIds.length - PHOTOS_PER_PRODUCT))}` : ""}
          </p>
        </div>
        <Badge variant={badge.variant} className="shrink-0">
          {st === "created" && <CheckCircle2 className="mr-1 h-3 w-3" />}
          {t(badge.key)}
        </Badge>
      </div>

      {!locked && group.reasons.length > 0 && !group.excluded && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1">
            {group.reasons.map((r) => (
              <p key={r}>{reasonText(r, t)}</p>
            ))}
          </div>
          <button type="button" onClick={onReviewed} className="shrink-0 font-semibold underline">
            {t("bulk.itsFine")}
          </button>
        </div>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {group.itemIds.map((id) => {
          const item = items.get(id);
          if (!item) return null;
          return (
            <MediaThumb
              key={id}
              item={item}
              main={group.mainId === id}
              unused={!used.has(id)}
              selected={selectedItem === id}
              onClick={locked ? undefined : () => onSelectItem(selectedItem === id ? null : id)}
            />
          );
        })}
      </div>

      {group.merged.length > 0 && !locked && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">{t("bulk.includes")}</span>
          {group.merged.map((m, k) => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
              {m.draft.name.trim() || m.label || t("bulk.productN").replace("{n}", String(k + 1))}
              <button type="button" onClick={() => onUnmerge(m.id)} aria-label={t("bulk.unmerge")} className="opacity-70 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {selectedItem && group.itemIds.includes(selectedItem) && !locked && (
        <PhotoSheet
          state={state}
          fromGroupId={group.id}
          canSetMain={group.mainId !== selectedItem}
          onAction={(a) => onPhotoAction(selectedItem, a)}
          onClose={() => onSelectItem(null)}
        />
      )}

      {!group.excluded && !locked && (
        <div className="mt-4 flex flex-col gap-3">
          {suggesting && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("bulk.writing")}
            </p>
          )}
          {group.suggestion === "failed" && !suggesting && (
            <p className="text-xs text-muted-foreground">{t("bulk.suggestFailed")}</p>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium">
            {t("bulk.name")}
            <Input
              value={d.name}
              maxLength={120}
              placeholder={suggesting ? "…" : t("bulk.namePlaceholder")}
              onChange={(e) => onDraft({ name: e.target.value })}
              className={cn(missing.includes("name") && "border-warning")}
            />
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium">
            {t("bulk.price")}
            <div className="flex flex-wrap items-center gap-3">
              <Input
                ref={priceRef}
                inputMode="numeric"
                value={d.price == null ? "" : String(d.price)}
                placeholder={t("bulk.pricePlaceholder")}
                onChange={(e) => {
                  // Un prix tapé décoche « sur demande » ; un champ vidé le recoche.
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                  onDraft(digits ? { price: Number(digits), priceOnRequest: false } : { price: null, priceOnRequest: true });
                }}
                className="max-w-[180px]"
              />
              <label className="flex items-center gap-2 text-sm font-normal">
                <input
                  type="checkbox"
                  checked={d.price == null}
                  onChange={(e) => {
                    if (e.target.checked) onDraft({ price: null, priceOnRequest: true });
                    else priceRef.current?.focus(); // décocher = je vais taper un prix
                  }}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                {t("bulk.priceOnRequest")}
              </label>
            </div>
            {d.price == null && <p className="font-normal text-muted-foreground">{t("bulk.priceOnRequestHint")}</p>}
          </div>
          <div className="flex flex-col gap-1 text-xs font-medium">
            {t("bulk.marketCategory")}
            <MarketCategoryPicker value={d.marketCategory} onChange={(v) => onDraft({ marketCategory: v })} size="sm" />
          </div>
          {d.options.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {d.options.map((o) => `${o.name} : ${o.values.join(", ")}`).join(" · ")}
            </p>
          )}
          <button type="button" onClick={() => setShowMore((v) => !v)} className="self-start text-xs font-semibold text-primary">
            {showMore ? t("bulk.lessDetails") : t("bulk.moreDetails")}
          </button>
          {showMore && (
            <>
              <label className="flex flex-col gap-1 text-xs font-medium">
                {t("bulk.description")}
                <Textarea value={d.description} maxLength={2000} rows={4} onChange={(e) => onDraft({ description: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium">
                {t("bulk.shopCategory")}
                <Input value={d.category} maxLength={60} onChange={(e) => onDraft({ category: e.target.value })} />
              </label>
            </>
          )}

          {variants.map((v) => {
            const other = state.groups.find((g) => g.id === v.groupIds[1]);
            if (!other || other.productId) return null;
            const otherIndex = state.groups.indexOf(other);
            return (
              <div key={v.groupIds.join("-")} className="rounded-xl border border-dashed border-border px-3 py-2 text-xs">
                <p className="mb-2">
                  {t("bulk.variantHint")
                    .replace("{other}", groupTitle(other, otherIndex, t))
                    .replace("{option}", v.option)
                    .replace("{values}", v.values.join(", "))}
                </p>
                <Button type="button" size="sm" variant="secondary" onClick={() => onMerge(other.id, { name: v.option, values: v.values })}>
                  {t("bulk.variantMerge")}
                </Button>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {(group.suggestion === "failed" || group.suggestion === "manual" || staleSuggestion) && !suggesting && (
              <Button type="button" size="sm" variant="secondary" onClick={onResuggest}>
                <Sparkles className="h-3.5 w-3.5" />
                {t("bulk.writeWithAi")}
              </Button>
            )}
            {(others.length > 0 || group.merged.length > 0) && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setMergeOpen((v) => !v)}>
                {t("bulk.mergeWith")}
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => onExclude(true)}>
              <Ban className="h-3.5 w-3.5" />
              {t("bulk.dontCreate")}
            </Button>
          </div>
          {mergeOpen && (
            <ProductPicker
              state={state}
              excludeId={group.id}
              title={t("bulk.mergeChoose")}
              mergedInto={group}
              onPickMany={(fromIds) => {
                onMergeMany(fromIds);
                setMergeOpen(false);
              }}
              onClose={() => setMergeOpen(false)}
            />
          )}
        </div>
      )}

      {group.excluded && !locked && (
        <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => onExclude(false)}>
          <Undo2 className="h-3.5 w-3.5" />
          {t("bulk.restore")}
        </Button>
      )}
      {locked && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
          <Check className="h-3.5 w-3.5" />
          {t("bulk.createdHint")}
        </p>
      )}
      {staleSuggestion && !locked && !group.excluded && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RotateCcw className="h-3 w-3" />
          {t("bulk.staleHint")}
        </p>
      )}
    </li>
  );
}

function reasonText(r: string, t: (k: string) => string): string {
  if (/faible/.test(r)) return t("bulk.reasonLow");
  if (/moyenne/.test(r)) return t("bulk.reasonMedium");
  if (/presque identique/.test(r)) return t("bulk.reasonDuplicate");
  if (/autre couleur/.test(r)) return t("bulk.reasonVariant");
  return r;
}
