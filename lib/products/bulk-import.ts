import { z } from "zod";

// Import en lot (Bulk Upload) — modèle partagé client / serveur, sans dépendance serveur.
// Une session = des médias (photos déjà envoyées dans shop-media) répartis en groupes
// (un groupe = un futur produit), plus un bac « non rangés » et une liste « retirés du lot ».
// Invariant central (vérifié par checkImportInvariants, appliqué par normalizeImportState) :
// chaque média est à UN seul endroit : un groupe, les non rangés, ou les retirés.

// ─── Limites ──────────────────────────────────────────────────────────────────────────────────
/** Images tirées de chaque vidéo pour l'analyse (Claude ne lit pas la vidéo). */
export const FRAMES_PER_VIDEO = 3;
/** Lots analysés par jour et par compte. */
export const BULK_IMPORTS_PER_DAY = 3;
/** Fiches rédigées par l'IA au plus par lot (relances comprises : 20 produits + marge). */
export const BULK_SUGGESTIONS_PER_IMPORT = 30;
/** Produits créés au plus par lot. */
export const BULK_GROUPS_MAX = 20;
/** Photos par produit (contrainte product_images, positions 0-3). */
export const PHOTOS_PER_PRODUCT = 4;
/** Photos envoyées à l'IA pour rédiger une fiche. */
export const SUGGEST_IMAGES = 3;

// ─── Schémas ──────────────────────────────────────────────────────────────────────────────────
const uuid = z.string().uuid();

export const ImportItemSchema = z.object({
  id: uuid,
  path: z.string().min(1).max(300),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  /** Image tirée d'une vidéo : identifiant (nom) de la vidéo source. */
  videoRef: z.string().max(120).nullable().optional(),
  name: z.string().max(200).nullable().optional(),
  /** Date du fichier sur le téléphone (ms, File.lastModified) : indice « photos prises à la suite ». */
  takenAt: z.number().int().positive().nullable().optional(),
  /** Inventaire IA du regroupement (type · couleurs · motif · détails), relu pour la fiche. */
  aiNote: z.string().max(200).nullable().optional(),
  /** Vue détectée par l'IA (face, dos, gros_plan…). */
  aiView: z.string().max(20).nullable().optional(),
  /** false si l'IA a jugé la photo illisible. */
  aiReadable: z.boolean().nullable().optional(),
});
export type ImportItem = z.infer<typeof ImportItemSchema>;

export const ImportDraftSchema = z.object({
  name: z.string().max(120).default(""),
  /** null = pas encore saisi (ou « sur demande » si priceOnRequest). */
  price: z.number().int().min(0).max(100_000_000).nullable().default(null),
  priceOnRequest: z.boolean().default(false),
  description: z.string().max(2000).default(""),
  category: z.string().max(60).default(""),
  marketCategory: z.string().max(80).default(""),
  subjectType: z.enum(["product", "service"]).default("product"),
  options: z
    .array(z.object({ name: z.string().min(1).max(30), values: z.array(z.string().min(1).max(30)).min(1).max(20) }))
    .max(3)
    .default([]),
});
export type ImportDraft = z.infer<typeof ImportDraftSchema>;

/**
 * Produit fusionné dans un autre : on garde sa fiche et ses photos d'origine pour pouvoir le
 * recréer tel quel si le vendeur le désélectionne (« défusionner »).
 */
export const MergedSnapshotSchema = z.object({
  id: uuid,
  itemIds: z.array(uuid),
  mainId: uuid.nullable(),
  confidence: z.enum(["high", "medium", "low"]).default("high"),
  reasons: z.array(z.string().max(200)).max(10).default([]),
  label: z.string().max(120).default(""),
  suggestion: z.enum(["pending", "ready", "failed", "manual"]).default("pending"),
  suggestKey: z.string().max(2000).nullable().default(null),
  draft: ImportDraftSchema,
});
export type MergedSnapshot = z.infer<typeof MergedSnapshotSchema>;

export const ImportGroupSchema = z.object({
  id: uuid,
  itemIds: z.array(uuid),
  mainId: uuid.nullable(),
  confidence: z.enum(["high", "medium", "low"]).default("high"),
  reasons: z.array(z.string().max(200)).max(10).default([]),
  label: z.string().max(120).default(""),
  /** État de la fiche IA : pending = pas encore rédigée, ready = rédigée, failed = à écrire à la main. */
  suggestion: z.enum(["pending", "ready", "failed", "manual"]).default("pending"),
  /** Médias pour lesquels la fiche a été rédigée (pour savoir s'il faut la refaire). */
  suggestKey: z.string().max(2000).nullable().default(null),
  draft: ImportDraftSchema,
  excluded: z.boolean().default(false),
  productId: uuid.nullable().default(null),
  /** Produits fusionnés dans celui-ci (restaurables). */
  merged: z.array(MergedSnapshotSchema).max(50).default([]),
});
export type ImportGroup = z.infer<typeof ImportGroupSchema>;

export const ImportVariantSchema = z.object({
  groupIds: z.array(uuid).min(2),
  option: z.string().max(30),
  values: z.array(z.string().max(30)).max(20),
  reason: z.string().max(300).default(""),
});
export type ImportVariant = z.infer<typeof ImportVariantSchema>;

export const ImportStateSchema = z.object({
  items: z.array(ImportItemSchema),
  groups: z.array(ImportGroupSchema),
  unsorted: z.array(uuid),
  removed: z.array(uuid),
  variants: z.array(ImportVariantSchema).default([]),
});
export type ImportState = z.infer<typeof ImportStateSchema>;

export type ImportStatus = "uploading" | "analyzing" | "review" | "done" | "canceled";

export function emptyDraft(name = ""): ImportDraft {
  return { name, price: null, priceOnRequest: true, description: "", category: "", marketCategory: "", subjectType: "product", options: [] };
}

export function newGroup(id: string, itemIds: string[], name = ""): ImportGroup {
  return {
    id,
    itemIds,
    mainId: itemIds[0] ?? null,
    confidence: "high",
    reasons: [],
    label: name,
    suggestion: "manual",
    suggestKey: null,
    draft: emptyDraft(name),
    excluded: false,
    productId: null,
    merged: [],
  };
}

// ─── Invariants ───────────────────────────────────────────────────────────────────────────────

/** Liste des anomalies (vide = état valide). */
export function checkImportInvariants(s: ImportState): string[] {
  const errors: string[] = [];
  const known = new Set(s.items.map((i) => i.id));
  const seen = new Map<string, number>();
  const mark = (id: string) => seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const g of s.groups) {
    g.itemIds.forEach(mark);
    if (g.mainId && !g.itemIds.includes(g.mainId)) errors.push(`main hors du groupe ${g.id}`);
    if (g.itemIds.length === 0 && !g.productId) errors.push(`groupe vide ${g.id}`);
  }
  s.unsorted.forEach(mark);
  s.removed.forEach(mark);
  for (const [id, n] of seen) {
    if (!known.has(id)) errors.push(`média inconnu ${id}`);
    if (n > 1) errors.push(`média à plusieurs endroits ${id}`);
  }
  for (const id of known) if (!seen.has(id)) errors.push(`média perdu ${id}`);
  const groupIds = new Set(s.groups.map((g) => g.id));
  if (groupIds.size !== s.groups.length) errors.push("identifiants de groupe en double");
  for (const g of s.groups) for (const m of g.merged ?? []) if (groupIds.has(m.id)) errors.push(`produit fusionné encore présent ${m.id}`);
  return errors;
}

/**
 * Remet un état en ordre sans rien perdre : médias inconnus retirés, médias en double gardés au
 * 1er endroit (groupes, puis non rangés, puis retirés), médias oubliés → non rangés, principale
 * valide, groupes vides (non créés) supprimés, variantes vers des groupes disparus retirées.
 * Les groupes déjà créés (productId) sont figés : leurs médias ne bougent plus.
 */
export function normalizeImportState(s: ImportState): ImportState {
  const known = new Set(s.items.map((i) => i.id));
  const placed = new Set<string>();
  const take = (id: string) => {
    if (!known.has(id) || placed.has(id)) return false;
    placed.add(id);
    return true;
  };
  const seenGroups = new Set<string>();
  const groups: ImportGroup[] = [];
  // Groupes créés d'abord : ils gardent leurs médias quoi qu'il arrive.
  const ordered = [...s.groups.filter((g) => g.productId), ...s.groups.filter((g) => !g.productId)];
  for (const g of ordered) {
    if (seenGroups.has(g.id)) continue;
    seenGroups.add(g.id);
    const itemIds = g.itemIds.filter(take);
    if (itemIds.length === 0 && !g.productId) continue;
    const mainId = g.mainId && itemIds.includes(g.mainId) ? g.mainId : itemIds[0] ?? null;
    groups.push({ ...g, itemIds, mainId, merged: g.merged ?? [] });
  }
  // Ordre d'affichage d'origine conservé.
  const order = new Map(s.groups.map((g, i) => [g.id, i]));
  groups.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const unsorted = s.unsorted.filter(take);
  const removed = s.removed.filter(take);
  for (const it of s.items) if (!placed.has(it.id)) unsorted.push(it.id);
  const ids = new Set(groups.map((g) => g.id));
  for (const g of groups) if (g.merged.some((m) => ids.has(m.id))) g.merged = g.merged.filter((m) => !ids.has(m.id));
  const variants = (s.variants ?? [])
    .map((v) => ({ ...v, groupIds: v.groupIds.filter((id) => ids.has(id)) }))
    .filter((v) => v.groupIds.length >= 2);
  return { items: s.items, groups, unsorted, removed, variants };
}

// ─── Opérations de révision (pures) ────────────────────────────────────────────────────────────

export type MoveTarget = { kind: "group"; groupId: string } | { kind: "new"; groupId: string } | { kind: "unsorted" } | { kind: "removed" };

function frozen(s: ImportState, itemId: string): boolean {
  return s.groups.some((g) => g.productId && g.itemIds.includes(itemId));
}

/** Déplace un média vers un groupe, un nouveau groupe (id fourni), les non rangés ou les retirés. */
export function moveItem(s: ImportState, itemId: string, to: MoveTarget): ImportState {
  if (!s.items.some((i) => i.id === itemId) || frozen(s, itemId)) return s;
  if (to.kind === "group") {
    const target = s.groups.find((g) => g.id === to.groupId);
    if (!target || target.productId) return s;
  }
  const strip = (ids: string[]) => ids.filter((id) => id !== itemId);
  let groups = s.groups.map((g) => (g.productId ? g : { ...g, itemIds: strip(g.itemIds) }));
  let unsorted = strip(s.unsorted);
  let removed = strip(s.removed);
  if (to.kind === "group") {
    groups = groups.map((g) => (g.id === to.groupId ? { ...g, itemIds: [...g.itemIds, itemId], mainId: g.mainId ?? itemId } : g));
  } else if (to.kind === "new") {
    if (groups.some((g) => g.id === to.groupId)) return s;
    groups = [...groups, newGroup(to.groupId, [itemId])];
  } else if (to.kind === "unsorted") {
    unsorted = [...unsorted, itemId];
  } else {
    removed = [...removed, itemId];
  }
  return normalizeImportState({ ...s, groups, unsorted, removed });
}

export function setMain(s: ImportState, groupId: string, itemId: string): ImportState {
  return {
    ...s,
    groups: s.groups.map((g) => (g.id === groupId && !g.productId && g.itemIds.includes(itemId) ? { ...g, mainId: itemId } : g)),
  };
}

/**
 * Fusionne `fromId` dans `intoId` (médias ajoutés à la suite, fiche de `intoId` gardée). Avec
 * `option`, ajoute l'option (ex. Couleur : Rouge, Bleu) à la fiche — cas d'une variante acceptée.
 */
export function mergeGroups(s: ImportState, intoId: string, fromId: string, option?: { name: string; values: string[] }): ImportState {
  const into = s.groups.find((g) => g.id === intoId);
  const from = s.groups.find((g) => g.id === fromId);
  if (!into || !from || into === from || into.productId || from.productId) return s;
  let draft = into.draft;
  if (option && option.name.trim() && option.values.length) {
    const values = [...new Set(option.values.map((v) => v.trim().slice(0, 30)).filter(Boolean))].slice(0, 20);
    const others = draft.options.filter((o) => o.name.toLowerCase() !== option.name.trim().toLowerCase());
    if (values.length) draft = { ...draft, options: [...others, { name: option.name.trim().slice(0, 30), values }].slice(0, 3) };
  }
  if (!draft.name && from.draft.name) draft = { ...draft, name: from.draft.name };
  const { merged: fromMerged, productId: _p, excluded: _e, ...fromSnapshot } = from;
  void _p;
  void _e;
  const merged: ImportGroup = {
    ...into,
    itemIds: [...into.itemIds, ...from.itemIds],
    draft,
    // Raisons qui suggéraient justement cette fusion : réglées par le geste du vendeur.
    reasons: into.reasons.filter((r) => !/autre couleur|presque identique|même vidéo|même nom|vues partielles/.test(r)),
    // L'ordre compte : défusionner rend à chacun ses photos d'origine.
    merged: [...(into.merged ?? []), ...(fromMerged ?? []), fromSnapshot],
  };
  return normalizeImportState({
    ...s,
    groups: s.groups.filter((g) => g.id !== fromId).map((g) => (g.id === intoId ? merged : g)),
    variants: (s.variants ?? []).filter((v) => !(v.groupIds.includes(intoId) && v.groupIds.includes(fromId))),
  });
}

/**
 * Recrée un produit fusionné dans `intoId` (le vendeur l'a désélectionné) : il reprend sa fiche et
 * celles de ses photos d'origine qui sont encore dans `intoId`. Placé juste après `intoId`.
 */
export function unmergeGroup(s: ImportState, intoId: string, mergedId: string): ImportState {
  const into = s.groups.find((g) => g.id === intoId);
  const snap = into?.merged?.find((m) => m.id === mergedId);
  if (!into || !snap || into.productId) return s;
  const back = snap.itemIds.filter((id) => into.itemIds.includes(id));
  const restored: ImportGroup = {
    ...snap,
    itemIds: back,
    mainId: snap.mainId && back.includes(snap.mainId) ? snap.mainId : back[0] ?? null,
    excluded: false,
    productId: null,
    merged: [],
  };
  const remaining: ImportGroup = {
    ...into,
    itemIds: into.itemIds.filter((id) => !back.includes(id)),
    merged: into.merged.filter((m) => m.id !== mergedId),
  };
  const groups: ImportGroup[] = [];
  for (const g of s.groups) {
    if (g.id !== intoId) {
      groups.push(g);
      continue;
    }
    groups.push(remaining);
    if (back.length) groups.push(restored);
  }
  return normalizeImportState({ ...s, groups });
}

export function setExcluded(s: ImportState, groupId: string, excluded: boolean): ImportState {
  return { ...s, groups: s.groups.map((g) => (g.id === groupId && !g.productId ? { ...g, excluded } : g)) };
}

export function updateDraft(s: ImportState, groupId: string, patch: Partial<ImportDraft>): ImportState {
  return {
    ...s,
    groups: s.groups.map((g) => (g.id === groupId && !g.productId ? { ...g, draft: { ...g.draft, ...patch }, reasons: g.reasons } : g)),
  };
}

/** Marque un groupe « vérifié » : retire les raisons « à vérifier ». */
export function markReviewed(s: ImportState, groupId: string): ImportState {
  return { ...s, groups: s.groups.map((g) => (g.id === groupId ? { ...g, reasons: [], confidence: "high" } : g)) };
}

/** Ordre des photos d'un produit : principale d'abord, vraies photos avant images de vidéo. 4 max. */
export function productPhotoIds(s: Pick<ImportState, "items">, g: Pick<ImportGroup, "itemIds" | "mainId">): string[] {
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const rest = g.itemIds.filter((id) => id !== g.mainId);
  const real = rest.filter((id) => !byId.get(id)?.videoRef);
  const frames = rest.filter((id) => byId.get(id)?.videoRef);
  return [...(g.mainId ? [g.mainId] : []), ...real, ...frames].slice(0, PHOTOS_PER_PRODUCT);
}

/**
 * Photos envoyées à l'IA pour rédiger la fiche (SUGGEST_IMAGES au plus) : la principale, puis des
 * vues DIFFÉRENTES de l'article (une vue de dos ou un gros plan apporte plus qu'une 2e vue de face),
 * vraies photos avant images de vidéo, photos jugées illisibles en dernier.
 */
export function suggestPhotoIds(s: Pick<ImportState, "items">, g: Pick<ImportGroup, "itemIds" | "mainId">): string[] {
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const main = g.mainId && g.itemIds.includes(g.mainId) ? g.mainId : g.itemIds[0];
  if (!main) return [];
  const score = (id: string) => {
    const it = byId.get(id);
    return (it?.aiReadable === false ? 4 : 0) + (it?.videoRef ? 2 : 0);
  };
  const rest = g.itemIds.filter((id) => id !== main).map((id, k) => ({ id, k })).sort((a, b) => score(a.id) - score(b.id) || a.k - b.k).map((x) => x.id);
  const picked = [main];
  const views = new Set([byId.get(main)?.aiView ?? "?"]);
  // 1er passage : une photo par vue encore absente ; 2e passage : compléter dans l'ordre.
  for (const id of rest) {
    if (picked.length >= SUGGEST_IMAGES) break;
    const v = byId.get(id)?.aiView;
    if (v && !views.has(v) && byId.get(id)?.aiReadable !== false) {
      picked.push(id);
      views.add(v);
    }
  }
  for (const id of rest) {
    if (picked.length >= SUGGEST_IMAGES) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked;
}

/** Clé « médias de la fiche » : la fiche IA est à refaire quand les photos envoyées changent. */
export function suggestKeyOf(s: Pick<ImportState, "items">, g: Pick<ImportGroup, "itemIds" | "mainId">): string {
  return suggestPhotoIds(s, g).join(",");
}

// ─── États de révision ────────────────────────────────────────────────────────────────────────

export type GroupState = "created" | "excluded" | "review" | "ready" | "incomplete";

export function groupMissing(g: ImportGroup): ("name" | "photo")[] {
  const missing: ("name" | "photo")[] = [];
  if (!g.draft.name.trim()) missing.push("name");
  // Sans prix = « Prix sur demande » (choisi automatiquement) : le prix ne bloque jamais la création.
  if (g.itemIds.length === 0) missing.push("photo");
  return missing;
}

export function groupState(g: ImportGroup): GroupState {
  if (g.productId) return "created";
  if (g.excluded) return "excluded";
  if (groupMissing(g).length) return "incomplete";
  if (g.reasons.length) return "review";
  return "ready";
}

/** Groupes prêts à créer : complets, non exclus, pas encore créés. Ceux « à vérifier » comptent : le vendeur les a sous les yeux. */
export function creatableGroups(s: ImportState): ImportGroup[] {
  return s.groups.filter((g) => {
    const st = groupState(g);
    return st === "ready" || st === "review";
  });
}

export interface ImportSummary {
  files: number;
  products: number;
  toReview: number;
  incomplete: number;
  ready: number;
  created: number;
  excluded: number;
  unsorted: number;
}

export function importSummary(s: ImportState): ImportSummary {
  const states = s.groups.map(groupState);
  const count = (st: GroupState) => states.filter((x) => x === st).length;
  return {
    files: s.items.length - s.removed.length,
    products: s.groups.filter((g) => !g.excluded).length,
    toReview: count("review"),
    incomplete: count("incomplete"),
    ready: count("ready") + count("review"),
    created: count("created"),
    excluded: count("excluded"),
    unsorted: s.unsorted.length,
  };
}

/** Médias à effacer à la fin d'un lot : ceux qui ne servent à aucun produit créé. */
export function unusedItemPaths(s: ImportState, usedPaths: Set<string>): string[] {
  return s.items.map((i) => i.path).filter((p) => !usedPaths.has(p));
}

/** Construit l'état initial à partir du regroupement IA (indices 0-based, voir normalizeGrouping). */
export function stateFromGrouping(
  items: ImportItem[],
  grouping: {
    groups: { key: string; items: number[]; main: number; confidence: "high" | "medium" | "low"; label: string; reviewReasons: string[] }[];
    unsorted: { item: number }[];
    variants: { groups: string[]; option: string; values: string[]; reason: string }[];
    /** Groupes fusionnés par la 2e vérification, par clé du groupe qui les a reçus (annulables). */
    mergedFrom?: Record<string, { key: string; items: number[]; main: number; label: string }[]>;
  },
  newId: () => string
): ImportState {
  const keyToId = new Map<string, string>();
  const ids = (list: number[]) => list.map((i) => items[i]?.id).filter((x): x is string => !!x);
  const groups: ImportGroup[] = grouping.groups.map((g) => {
    const id = newId();
    keyToId.set(g.key, id);
    const itemIds = ids(g.items);
    // Fusion faite par la vérification : instantané gardé pour que le vendeur puisse « défusionner ».
    const merged: MergedSnapshot[] = (grouping.mergedFrom?.[g.key] ?? []).map((m) => {
      const mIds = ids(m.items);
      return {
        id: newId(),
        itemIds: mIds,
        mainId: items[m.main]?.id ?? mIds[0] ?? null,
        confidence: "medium" as const,
        reasons: [],
        label: m.label,
        suggestion: "pending" as const,
        suggestKey: null,
        draft: emptyDraft(""),
      };
    });
    return {
      ...newGroup(id, itemIds, g.label),
      mainId: items[g.main]?.id ?? itemIds[0] ?? null,
      confidence: g.confidence,
      reasons: g.reviewReasons.slice(0, 10),
      label: g.label,
      suggestion: "pending",
      draft: emptyDraft(""),
      merged: merged.slice(0, 50),
    };
  });
  const variants: ImportVariant[] = grouping.variants
    .map((v) => ({ groupIds: v.groups.map((k) => keyToId.get(k)).filter((x): x is string => !!x), option: v.option, values: v.values, reason: v.reason }))
    .filter((v) => v.groupIds.length >= 2);
  return normalizeImportState({
    items,
    groups,
    unsorted: grouping.unsorted.map((u) => items[u.item]?.id).filter((x): x is string => !!x),
    removed: [],
    variants,
  });
}

// ─── Mesure des corrections du vendeur ──────────────────────────────────────────────────────────

/** Répartition des médias (identifiants) : produits non exclus et non rangés. */
export interface ImportPartition {
  groups: string[][];
  unsorted: string[];
}

export function partitionOf(s: Pick<ImportState, "groups" | "unsorted">): ImportPartition {
  return { groups: s.groups.filter((g) => !g.excluded && g.itemIds.length).map((g) => [...g.itemIds]), unsorted: [...s.unsorted] };
}

export const ImportPartitionSchema = z.object({ groups: z.array(z.array(z.string())), unsorted: z.array(z.string()) });

export interface CorrectionStats {
  /** Photos qui ont fini dans un produit créé (base de la mesure). */
  photos: number;
  /** Fragments d'un même produit final que l'IA avait séparés (le vendeur a dû fusionner). */
  merges: number;
  /** Photos sorties d'un groupe IA qui mélangeait des articles (le vendeur a dû séparer). */
  movesOut: number;
  /** Photos laissées « non rangées » par l'IA et placées par le vendeur. */
  placedFromUnsorted: number;
  /** Total des gestes estimés (même définition que scoreLot du banc). */
  corrections: number;
  /** Corrections pour 10 photos. */
  per10: number;
  /** Produits finaux identiques à un groupe proposé par l'IA. */
  exactGroups: number;
  finalGroups: number;
}

/**
 * Compare la proposition de l'IA (`initial`) aux produits réellement créés (`final`, ex. groupes
 * avec productId). Même logique que le banc : chaque produit final est la « vérité ».
 *  - movesOut : dans chaque groupe IA, photos qui ne vont pas avec la majorité de ses photos ;
 *  - merges : un produit final réparti entre k groupes IA compte k - 1 ;
 *  - placedFromUnsorted : photos non rangées par l'IA qui finissent dans un produit.
 * Les photos jamais utilisées (retirées, produits exclus) ne comptent pas.
 */
export function correctionStats(initial: ImportPartition, final: string[][]): CorrectionStats {
  const finalOf = new Map<string, number>();
  final.forEach((g, k) => g.forEach((id) => finalOf.set(id, k)));
  const photos = finalOf.size;
  const initialOf = new Map<string, number>();
  initial.groups.forEach((g, k) => g.forEach((id) => initialOf.set(id, k)));
  const unsorted = new Set(initial.unsorted);

  let movesOut = 0;
  for (const g of initial.groups) {
    const used = g.filter((id) => finalOf.has(id));
    if (!used.length) continue;
    const counts = new Map<number, number>();
    for (const id of used) counts.set(finalOf.get(id)!, (counts.get(finalOf.get(id)!) ?? 0) + 1);
    const top = Math.max(...counts.values());
    movesOut += used.length - top;
  }
  let merges = 0;
  let placedFromUnsorted = 0;
  let exactGroups = 0;
  for (const g of final) {
    const fromGroups = new Set(g.filter((id) => initialOf.has(id)).map((id) => initialOf.get(id)!));
    merges += Math.max(0, fromGroups.size - 1);
    placedFromUnsorted += g.filter((id) => unsorted.has(id) || (!initialOf.has(id) && !unsorted.has(id))).length;
    if (fromGroups.size === 1 && g.every((id) => initialOf.has(id))) {
      const src = initial.groups[[...fromGroups][0]];
      if (src.length === g.length) exactGroups++;
    }
  }
  const corrections = merges + movesOut + placedFromUnsorted;
  return { photos, merges, movesOut, placedFromUnsorted, corrections, per10: photos ? Math.round((corrections / photos) * 100) / 10 : 0, exactGroups, finalGroups: final.length };
}

// ─── Étape « Valider les groupes » (avant toute fiche IA) ───────────────────────────────────────

/**
 * Les groupes sont validés dès qu'une fiche a été demandée, saisie ou créée. Après le regroupement
 * (IA ou « ranger moi-même »), toutes les fiches sont « pending » : le vendeur passe d'abord par
 * l'étape de validation, et aucune fiche IA n'est rédigée pour des produits qu'il va fusionner.
 */
export function groupsConfirmed(s: Pick<ImportState, "groups">): boolean {
  return s.groups.some((g) => !!g.productId || g.suggestion !== "pending" || !!g.draft.name.trim());
}

export interface VariantFamily {
  /** Index dans state.variants. */
  index: number;
  groupIds: string[];
  option: string;
  values: string[];
  reason: string;
}

/** Familles « même modèle, autre couleur » encore applicables (au moins 2 produits non créés). */
export function variantFamilies(s: Pick<ImportState, "groups" | "variants">): VariantFamily[] {
  const open = new Set(s.groups.filter((g) => !g.productId && !g.excluded).map((g) => g.id));
  return (s.variants ?? [])
    .map((v, index) => ({ index, groupIds: v.groupIds.filter((id) => open.has(id)), option: v.option.trim() || "Couleur", values: v.values.map((x) => x.trim()).filter(Boolean), reason: v.reason }))
    .filter((f) => f.groupIds.length >= 2);
}

const VARIANT_REASON = /autre couleur/;

/**
 * Applique les choix du vendeur sur les familles de variantes (index → oui / non ; défaut : oui).
 *  - oui : les produits de la famille sont fusionnés dans le 1er, avec l'option (ex. Couleur :
 *    Blanc, Noir, Marron). Fusion annulable ensuite (« Recréer ce produit à part »).
 *  - non : la suggestion est retirée et l'alerte « autre couleur » disparaît des produits.
 */
export function applyVariantChoices(s: ImportState, choices: Record<number, boolean> = {}): ImportState {
  const families = variantFamilies(s);
  const absorbedInto = new Map<string, string>();
  const root = (id: string) => {
    let cur = id;
    while (absorbedInto.has(cur)) cur = absorbedInto.get(cur)!;
    return cur;
  };
  let next = s;
  const declined = new Set<string>();
  for (const f of families) {
    if (choices[f.index] === false) {
      f.groupIds.forEach((id) => declined.add(id));
      continue;
    }
    const ids = [...new Set(f.groupIds.map(root))];
    const [into, ...rest] = ids;
    for (const from of rest) {
      const option = f.values.length >= 2 ? { name: f.option, values: f.values } : undefined;
      const merged = mergeGroups(next, into, from, option);
      if (merged !== next) absorbedInto.set(from, into);
      next = merged;
    }
  }
  // Familles refusées : la suggestion disparaît (ses produits restent séparés).
  const variants = (next.variants ?? []).filter((v) => !v.groupIds.every((id) => declined.has(id)));
  const stillInVariant = new Set(variants.flatMap((v) => v.groupIds));
  return normalizeImportState({
    ...next,
    variants,
    groups: next.groups.map((g) =>
      declined.has(g.id) && !stillInVariant.has(g.id) ? { ...g, reasons: g.reasons.filter((r) => !VARIANT_REASON.test(r)) } : g
    ),
  });
}
