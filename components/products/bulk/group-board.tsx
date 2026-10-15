"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Ban, Check, CheckSquare, GripVertical, Layers, Loader2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shopMediaThumbUrl } from "@/lib/shops/media";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";
import { MediaThumb, PhotoSheet, groupTitle, type PhotoAction } from "@/components/products/bulk/group-card";
import { applyVariantChoices, variantFamilies, type ImportGroup, type ImportState } from "@/lib/products/bulk-import";

// Import en lot — étape « Valider les groupes » : AVANT toute fiche IA, le vendeur confirme quelles
// photos vont ensemble. Trois façons de fusionner des produits, toutes annulables :
//  1. Familles « même modèle, autre couleur » : un seul produit avec l'option Couleur (par défaut).
//  2. Sélection : « Sélectionner », toucher les produits, « Fusionner N produits » (le 1er touché
//     reçoit les autres). Fiable à une main, sans précision.
//  3. Glisser-déposer (raccourci) : appui long sur la photo de couverture d'un produit ; pendant le
//     geste, tous les produits se réduisent en une grille de vignettes qui tient sur l'écran (pas de
//     défilement à gérer en tenant le produit) ; on lâche sur un autre produit pour fusionner.

const LONG_PRESS_MS = 280;

/** La cible est le produit SOUS LE DOIGT (ou la souris) ; au clavier, celui que recouvre la vignette. */
const underPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length || args.pointerCoordinates ? hits : rectIntersection(args);
};

type Sel = { groupId: string | null; itemId: string } | null;

export function GroupBoard({
  state,
  choices,
  onChoice,
  selected,
  onSelect,
  onPhotoAction,
  onMerge,
  onExclude,
  onConfirm,
  confirming,
  saveLabel,
}: {
  state: ImportState;
  /** Choix par famille de variantes (index → oui / non ; absent = oui). */
  choices: Record<number, boolean>;
  onChoice: (index: number, merge: boolean) => void;
  selected: Sel;
  onSelect: (sel: Sel) => void;
  onPhotoAction: (fromGroupId: string | null, itemId: string, a: PhotoAction) => void;
  /** Fusionne `fromIds` dans `intoId` (le parent garde de quoi annuler). */
  onMerge: (intoId: string, fromIds: string[]) => void;
  onExclude: (groupId: string, excluded: boolean) => void;
  onConfirm: () => void;
  confirming: boolean;
  saveLabel: string;
}) {
  const { t } = useLocale();
  const items = React.useMemo(() => new Map(state.items.map((i) => [i.id, i])), [state.items]);
  const families = variantFamilies(state);
  const familyOf = new Map<string, number>();
  families.forEach((f) => f.groupIds.forEach((id) => familyOf.has(id) || familyOf.set(id, f.index)));
  const products = applyVariantChoices(state, choices).groups.filter((g) => !g.excluded && !g.productId).length;
  const open = state.groups.filter((g) => !g.productId);
  const singles = open.filter((g) => !familyOf.has(g.id));
  const mergeable = open.filter((g) => !g.excluded);

  // ─── Sélection ──────────────────────────────────────────────────────────────────────────────────
  const [selecting, setSelecting] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const togglePick = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };
  const mergePicked = () => {
    const [into, ...from] = picked.filter((id) => mergeable.some((g) => g.id === id));
    if (into && from.length) onMerge(into, from);
    stopSelecting();
  };

  // ─── Glisser-déposer ────────────────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    // Souris : un petit déplacement suffit. Toucher : appui long, pour ne pas gêner le défilement.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const [dragId, setDragId] = React.useState<string | null>(null);
  // Après un glisser, le navigateur peut envoyer un « clic » : on l'ignore un court instant.
  const dragEndedAt = React.useRef(0);
  const justDragged = React.useCallback(() => Date.now() - dragEndedAt.current < 350, []);
  const dragged = dragId ? state.groups.find((g) => g.id === dragId) ?? null : null;
  const onDragStart = (e: DragStartEvent) => {
    onSelect(null);
    setDragId(String(e.active.id));
    try {
      navigator.vibrate?.(12);
    } catch {
      /* non disponible (iOS) */
    }
  };
  const onDragEnd = (e: DragEndEvent) => {
    const from = String(e.active.id);
    const into = e.over ? String(e.over.id) : null;
    dragEndedAt.current = Date.now();
    setDragId(null);
    if (into && into !== from) onMerge(into, [from]);
  };

  const title = (g: ImportGroup) => groupTitle(g, state.groups.indexOf(g), t);
  /** Valeur de l'option (ex. « Vert ») pour un produit de la famille, si l'IA l'a donnée dans l'ordre. */
  const valueOf = (f: { groupIds: string[]; values: string[] }, g: ImportGroup) =>
    f.values.length === f.groupIds.length ? f.values[f.groupIds.indexOf(g.id)] ?? "" : "";
  /** Touche courte sur la couverture : actions sur la photo principale. */
  const openMain = (g: ImportGroup) => {
    if (justDragged()) return;
    const id = g.mainId ?? g.itemIds[0];
    if (id) onSelect(selected?.itemId === id ? null : { groupId: g.id, itemId: id });
  };
  /** Feuille d'actions si la photo choisie appartient à l'un de ces produits. */
  const sheetFor = (groupIds: string[]) => {
    const g = selected?.groupId ? state.groups.find((x) => x.id === selected.groupId && groupIds.includes(x.id)) : undefined;
    return g ? sheet(g.id, g.itemIds) : null;
  };
  const cover = (g: ImportGroup) => {
    const it = g.mainId ? items.get(g.mainId) : undefined;
    return it ? shopMediaThumbUrl(it.path) : null;
  };

  const photoStrip = (groupId: string | null, ids: string[], mainId: string | null) => (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {ids.map((id) => {
        const item = items.get(id);
        return item ? (
          <MediaThumb
            key={id}
            item={item}
            main={!!mainId && id === mainId}
            selected={selected?.itemId === id}
            onClick={() => onSelect(selected?.itemId === id ? null : { groupId, itemId: id })}
          />
        ) : null;
      })}
    </div>
  );
  const sheet = (groupId: string | null, ids: string[]) =>
    selected && selected.groupId === groupId && ids.includes(selected.itemId) ? (
      <PhotoSheet
        state={state}
        fromGroupId={groupId}
        canSetMain={!!groupId}
        onAction={(a) => onPhotoAction(groupId, selected.itemId, a)}
        onClose={() => onSelect(null)}
      />
    ) : null;

  const card = (g: ImportGroup) => (
    <ProductCard
      key={g.id}
      group={g}
      title={title(g)}
      cover={cover(g)}
      selecting={selecting}
      pickedRank={picked.indexOf(g.id)}
      onPick={() => togglePick(g.id)}
      onOpen={() => openMain(g)}
      onExclude={() => onExclude(g.id, !g.excluded)}
      t={t}
    >
      {!selecting && (g.itemIds.length > 1 || (selected?.groupId === g.id && g.itemIds.includes(selected.itemId))) ? (
        <>
          {/* Une seule photo : la couverture suffit (la toucher ouvre ses actions). */}
          {g.itemIds.length > 1 && photoStrip(g.id, g.itemIds, g.mainId)}
          {sheet(g.id, g.itemIds)}
        </>
      ) : null}
    </ProductCard>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={underPointer} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => {
        dragEndedAt.current = Date.now();
        setDragId(null);
      }} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}>
      <section>
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{selecting ? t("bulk.selectIntro") : t("bulk.groupsIntro")}</p>
          {mergeable.length >= 2 && (
            <Button type="button" size="sm" variant={selecting ? "default" : "secondary"} className="shrink-0" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
              {selecting ? t("bulk.cancel") : t("bulk.select")}
            </Button>
          )}
        </div>
        {!selecting && mergeable.length >= 2 && <p className="-mt-2 mb-4 text-xs text-muted-foreground">{t("bulk.dragHint")}</p>}

        {!selecting && state.unsorted.length > 0 && (
          <div className="mb-4 rounded-2xl border border-warning/40 bg-card p-4">
            <p className="font-semibold">{t("bulk.unsortedTitle").replace("{n}", String(state.unsorted.length))}</p>
            <p className="mb-3 text-xs text-muted-foreground">{t("bulk.unsortedDesc")}</p>
            {photoStrip(null, state.unsorted, null)}
            {sheet(null, state.unsorted)}
          </div>
        )}

        {families.length > 0 && (
          <ul className="mb-4 flex flex-col gap-3">
            {families.map((f) => {
              const merge = choices[f.index] !== false;
              return (
                <li key={f.index} className={cn("rounded-2xl border-2 p-3", merge ? "border-primary/50 bg-accent/30" : "border-border bg-card")}>
                  <p className="font-semibold">{t("bulk.familyTitle").replace("{n}", String(f.groupIds.length)).replace("{option}", f.option.toLowerCase())}</p>
                  {f.values.length > 0 && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      {f.option} : {f.values.join(", ")}
                    </p>
                  )}
                  {!selecting && (
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          onClick={() => onChoice(f.index, value)}
                          className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm", merge === value ? "border-primary bg-primary/10 font-semibold" : "border-border")}
                        >
                          {merge === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          {value ? t("bulk.familyOne").replace("{option}", f.option.toLowerCase()) : t("bulk.familySeparate").replace("{n}", String(f.groupIds.length))}
                        </button>
                      ))}
                    </div>
                  )}
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {f.groupIds
                      .filter((id) => familyOf.get(id) === f.index)
                      .map((id) => state.groups.find((g) => g.id === id))
                      .filter((g): g is ImportGroup => !!g)
                      .map((g) => (
                        <FamilyTile
                          key={g.id}
                          group={g}
                          caption={valueOf(f, g) || title(g)}
                          cover={cover(g)}
                          selecting={selecting}
                          pickedRank={picked.indexOf(g.id)}
                          onPick={() => togglePick(g.id)}
                          onOpen={() => openMain(g)}
                          onExclude={() => onExclude(g.id, !g.excluded)}
                          justDragged={justDragged}
                          t={t}
                        />
                      ))}
                  </ul>
                  {!selecting && sheetFor(f.groupIds)}
                </li>
              );
            })}
          </ul>
        )}

        <ul className="flex flex-col gap-2">{singles.map((g) => card(g))}</ul>

        {/* Barre du bas : fusion de la sélection, ou validation des groupes */}
        <div className="sticky bottom-20 z-10 mt-6 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:bottom-4">
          {selecting ? (
            <>
              <p className="mb-2 text-center text-xs text-muted-foreground">
                {picked.length === 0 ? t("bulk.selectNone") : picked.length === 1 ? t("bulk.selectOne") : t("bulk.selectMany").replace("{name}", title(state.groups.find((g) => g.id === picked[0])!))}
              </p>
              <Button type="button" variant="accent" size="lg" className="w-full" disabled={picked.length < 2} onClick={mergePicked}>
                <Layers className="h-4 w-4" />
                {t("bulk.mergeN").replace("{n}", String(Math.max(picked.length, 2)))}
              </Button>
            </>
          ) : (
            <>
              <p className="mb-2 text-center text-xs text-muted-foreground">
                {t("bulk.groupsSummary").replace("{n}", String(products))}
                {saveLabel ? ` · ${saveLabel}` : ""}
              </p>
              <Button type="button" variant="accent" size="lg" className="w-full" disabled={confirming || products === 0} onClick={onConfirm}>
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("bulk.groupsConfirm").replace("{n}", String(products))}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("bulk.groupsConfirmHint")}</p>
            </>
          )}
        </div>
      </section>

      {/* Pendant le glisser : tous les produits en vignettes, sur un seul écran */}
      {dragged && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
          <p className="px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] text-center text-sm font-semibold">
            {t("bulk.dropTitle").replace("{name}", title(dragged))}
          </p>
          <ul className="grid flex-1 auto-rows-min grid-cols-4 gap-x-2 gap-y-1 overflow-y-auto px-3 pb-24 sm:grid-cols-6">
            {mergeable.map((g) => (
              <DropTile key={g.id} group={g} title={title(g)} cover={cover(g)} isSource={g.id === dragged.id} t={t} />
            ))}
          </ul>
          <p className="pointer-events-none absolute inset-x-0 bottom-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
            {t("bulk.dropCancel")}
          </p>
        </div>
      )}
      <DragOverlay dropAnimation={null}>
        {dragged ? (
          // Au-dessus du doigt (pas dessous) : la cible et « Fusionner ici » restent visibles.
          <div className="pointer-events-none h-16 w-16 -translate-y-20 -rotate-3 overflow-hidden rounded-2xl border-2 border-primary bg-muted shadow-2xl">
            {cover(dragged) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover(dragged)!} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Couverture d'un produit : poignée du glisser (appui long) et, touchée brièvement, ses actions photo. */
function Cover({
  group,
  cover,
  disabled,
  onOpen,
  label,
  className,
  children,
}: {
  group: ImportGroup;
  cover: string | null;
  disabled: boolean;
  onOpen: () => void;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: group.id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      onClick={disabled ? undefined : onOpen}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-muted",
        !disabled && "cursor-grab touch-manipulation select-none active:cursor-grabbing",
        isDragging && "opacity-30",
        className
      )}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
      )}
      {!disabled && (
        <span className="absolute bottom-1 right-1 rounded-md bg-black/55 p-0.5 text-white">
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      {children}
    </div>
  );
}

/** Pastille de sélection (1er = produit principal). */
function PickBadge({ rank }: { rank: number }) {
  const picked = rank >= 0;
  return (
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-card", picked ? "border-primary bg-primary text-white" : "border-border")}>
      {picked && (rank === 0 ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{rank + 1}</span>)}
    </span>
  );
}

/** Carte compacte d'un produit hors famille. En sélection, toute la carte se touche. */
function ProductCard({
  group,
  title,
  cover,
  selecting,
  pickedRank,
  onPick,
  onOpen,
  onExclude,
  t,
  children,
}: {
  group: ImportGroup;
  title: string;
  cover: string | null;
  selecting: boolean;
  /** Ordre dans la sélection (0 = reçoit les autres), -1 = non sélectionné. */
  pickedRank: number;
  onPick: () => void;
  onOpen: () => void;
  onExclude: () => void;
  t: (k: string) => string;
  children?: React.ReactNode;
}) {
  const picked = pickedRank >= 0;
  const locked = selecting || group.excluded;
  return (
    <li
      className={cn(
        "rounded-2xl border border-border bg-card p-3 transition",
        group.excluded && "opacity-50",
        selecting && !group.excluded && "cursor-pointer",
        picked && "border-primary ring-2 ring-primary/40"
      )}
      onClick={selecting && !group.excluded ? onPick : undefined}
    >
      <div className="flex items-center gap-3">
        <Cover group={group} cover={cover} disabled={locked} onOpen={onOpen} label={t("bulk.dragHandle").replace("{name}", title)} className="h-16 w-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
          <p className="text-xs text-muted-foreground">
            {t("bulk.photosN").replace("{n}", String(group.itemIds.length))}
            {pickedRank === 0 ? ` · ${t("bulk.selectMain")}` : ""}
          </p>
        </div>
        {selecting ? (
          !group.excluded && <PickBadge rank={pickedRank} />
        ) : (
          <button
            type="button"
            onClick={onExclude}
            className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            aria-label={group.excluded ? t("bulk.groupsRestore") : t("bulk.groupsSkip")}
          >
            {group.excluded ? (
              <span className="flex items-center gap-1">
                <Undo2 className="h-3.5 w-3.5" />
                {t("bulk.groupsRestore")}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Ban className="h-3.5 w-3.5" />
                {t("bulk.groupsSkipShort")}
              </span>
            )}
          </button>
        )}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </li>
  );
}

/** Vignette d'une déclinaison dans une famille (ex. la couleur « Vert »). */
function FamilyTile({
  group,
  caption,
  cover,
  selecting,
  pickedRank,
  onPick,
  onOpen,
  onExclude,
  t,
}: {
  group: ImportGroup;
  caption: string;
  cover: string | null;
  selecting: boolean;
  pickedRank: number;
  onPick: () => void;
  onOpen: () => void;
  onExclude: () => void;
  justDragged: () => boolean;
  t: (k: string) => string;
}) {
  const picked = pickedRank >= 0;
  const locked = selecting || group.excluded;
  return (
    <li className={cn("relative flex flex-col gap-1", group.excluded && "opacity-40")} onClick={selecting && !group.excluded ? onPick : undefined}>
      <Cover
        group={group}
        cover={cover}
        disabled={locked}
        onOpen={onOpen}
        label={t("bulk.dragHandle").replace("{name}", caption)}
        className={cn("aspect-square w-full", picked && "ring-2 ring-primary ring-offset-1")}
      >
        {selecting && !group.excluded && (
          <span className="absolute left-1 top-1">
            <PickBadge rank={pickedRank} />
          </span>
        )}
        {!selecting && group.itemIds.length > 1 && (
          <span className="absolute left-1 top-1 rounded-md bg-black/55 px-1 text-[10px] font-semibold text-white">{group.itemIds.length}</span>
        )}
      </Cover>
      <div className="flex items-center justify-between gap-1">
        <p className="min-w-0 truncate text-xs font-medium">{caption}</p>
        {!selecting && (
          <button
            type="button"
            onClick={onExclude}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
            aria-label={group.excluded ? t("bulk.groupsRestore") : t("bulk.groupsSkip")}
          >
            {group.excluded ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </li>
  );
}

/** Vignette-cible pendant le glisser (compacte : tous les produits tiennent sur un écran). */
function DropTile({ group, title, cover, isSource, t }: { group: ImportGroup; title: string; cover: string | null; isSource: boolean; t: (k: string) => string }) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id, disabled: isSource });
  return (
    <li ref={setNodeRef} className={cn("flex flex-col items-center gap-0.5 rounded-xl p-1 transition", isOver && "scale-110 bg-primary/15 ring-2 ring-primary", isSource && "opacity-25")}>
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" draggable={false} className="h-full w-full object-cover" />
        )}
        {group.itemIds.length > 1 && (
          <span className="absolute left-0.5 top-0.5 rounded bg-black/55 px-1 text-[9px] font-semibold text-white">{group.itemIds.length}</span>
        )}
        {isOver && (
          <span className="absolute inset-0 flex items-center justify-center bg-primary/70 px-1 text-center text-[10px] font-bold leading-tight text-white">{t("bulk.dropHere")}</span>
        )}
      </div>
      <p className="line-clamp-2 w-full text-center text-[10px] leading-tight">{title}</p>
    </li>
  );
}
