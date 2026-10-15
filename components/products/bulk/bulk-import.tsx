"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Film, ImagePlus, Loader2, RefreshCw, Sparkles, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadShopMedia } from "@/lib/client-image";
import { bulkFetch, runLimited, videoFrames } from "@/lib/products/bulk-client";
import {
  applyVariantChoices,
  creatableGroups,
  groupsConfirmed,
  importSummary,
  markReviewed,
  mergeGroups,
  moveItem,
  unmergeGroup,
  setExcluded,
  setMain,
  suggestKeyOf,
  suggestPhotoIds,
  updateDraft,
  BULK_IMPORTS_PER_DAY,
  type ImportDraft,
  type ImportState,
} from "@/lib/products/bulk-import";
import { createFromImportGroup } from "@/app/dashboard/produits/bulk-actions";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";
import { GroupCard, MediaThumb, PhotoSheet, type PhotoAction } from "@/components/products/bulk/group-card";
import { GroupBoard } from "@/components/products/bulk/group-board";

// Import en lot (Bulk Upload) — parcours piloté par le navigateur, en petites requêtes rejouables :
// 1 Photos (envoi) · 2 Analyse (regroupement IA + fiches) · 3 Vérification · 4 Création.
// Tout est enregistré en base au fur et à mesure (session product_imports) : on peut reprendre.

export interface BulkImportInitial {
  id: string;
  status: "uploading" | "analyzing" | "review" | "done" | "canceled";
  version: number;
  grouped: boolean;
  state: ImportState;
}

type Phase = "pick" | "sending" | "analyzing" | "groupFailed" | "groups" | "review" | "creating" | "done";

interface Picked {
  key: string;
  file: File;
  kind: "image" | "video";
  preview: string | null;
  over: boolean;
  status: "waiting" | "sending" | "sent" | "failed";
  error?: string;
  uploaded: { path: string; width: number; height: number; videoRef: string | null; name: string; takenAt: number | null }[];
}

type CreateResult = { ok: true } | { ok: false; error: string };

const SAVE_DELAY = 800;
const SUGGEST_CONCURRENCY = 2;

/** Date du fichier (ms) : indice faible « photos prises à la suite » pour le regroupement. */
function takenAtOf(file: File): number | null {
  return Number.isFinite(file.lastModified) && file.lastModified > 0 ? Math.round(file.lastModified) : null;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

export function BulkImport({
  initial,
  limits,
  firstFree,
  creditsLeft,
  analysesLeftToday,
}: {
  initial: BulkImportInitial | null;
  limits: { photosPerLot: number; videosPerLot: number };
  firstFree: boolean;
  /** Générations restantes du mois + crédits achetés ; null = illimité / inconnu. */
  creditsLeft: number | null;
  /** Lots que le vendeur peut encore faire analyser sur 24 h (plafond vérifié par le serveur). */
  analysesLeftToday?: number;
}) {
  const { t } = useLocale();
  const router = useRouter();

  const initialPhase: Phase = !initial
    ? "pick"
    : initial.status === "done" || initial.status === "canceled"
      ? "done"
      : initial.grouped || initial.state.groups.length > 0
        ? groupsConfirmed(initial.state)
          ? "review"
          : "groups"
        : "groupFailed";

  const [phase, setPhase] = React.useState<Phase>(initialPhase);
  const [files, setFiles] = React.useState<Picked[]>([]);
  const [state, setStateRaw] = React.useState<ImportState | null>(initial?.state ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [limitHit, setLimitHit] = React.useState(false);
  const [canManual, setCanManual] = React.useState(initialPhase === "groupFailed");
  const [suggesting, setSuggesting] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<{ groupId: string | null; itemId: string } | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, CreateResult>>({});
  const [confirmPublish, setConfirmPublish] = React.useState(false);
  /** Étape « Valider les groupes » : choix par famille de variantes (absent = un seul produit). */
  const [variantChoices, setVariantChoices] = React.useState<Record<number, boolean>>({});
  const [confirming, setConfirming] = React.useState(false);
  /** Dernière fusion faite à l'étape Groupes : annulable quelques secondes. */
  const [undo, setUndo] = React.useState<{ snapshot: ImportState; message: string } | null>(null);
  const undoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finishInfo, setFinishInfo] = React.useState<{ created: number } | null>(
    initial && initialPhase === "done" ? { created: initial.state.groups.filter((g) => g.productId).length } : null
  );

  const inputRef = React.useRef<HTMLInputElement>(null);
  const stateRef = React.useRef<ImportState | null>(initial?.state ?? null);
  const versionRef = React.useRef<number>(initial?.version ?? 0);
  const idRef = React.useRef<string | null>(initial?.id ?? null);
  const dirtyRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = React.useRef<Promise<boolean> | null>(null);
  const suggestRunning = React.useRef(false);
  // Ordre d'affichage figé à l'arrivée des groupes (à vérifier d'abord), pour que les cartes ne
  // sautent pas pendant la saisie ; les nouveaux produits s'ajoutent à la fin.
  const orderRef = React.useRef<string[]>([]);

  // ─── État + enregistrement différé ────────────────────────────────────────────────────────────
  const commit = React.useCallback((next: ImportState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  const flush = React.useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savingRef.current) {
      await savingRef.current;
      return dirtyRef.current ? flush() : true;
    }
    if (!dirtyRef.current || !idRef.current || !stateRef.current) return true;
    dirtyRef.current = false;
    const snapshot = stateRef.current;
    setSaveStatus("saving");
    const run = (async () => {
      const res = await bulkFetch<{ version?: number; import?: BulkImportInitial | null }>(`/api/products/imports/${idRef.current}`, {
        method: "PATCH",
        body: { version: versionRef.current, state: snapshot },
      });
      if (res.ok && typeof res.data.version === "number") {
        versionRef.current = res.data.version;
        setSaveStatus("saved");
        return true;
      }
      if (res.status === 409 && res.data.import) {
        // Modifié ailleurs (autre onglet ou appareil) : on reprend la version enregistrée.
        versionRef.current = res.data.import.version;
        commit(res.data.import.state);
        setNotice(t("bulk.conflict"));
        setSaveStatus("saved");
        return false;
      }
      dirtyRef.current = true;
      setSaveStatus("error");
      return false;
    })();
    savingRef.current = run;
    const ok = await run;
    savingRef.current = null;
    if (ok && dirtyRef.current) return flush();
    return ok;
  }, [commit, t]);

  const update = React.useCallback(
    (fn: (s: ImportState) => ImportState) => {
      const cur = stateRef.current;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      commit(next);
      dirtyRef.current = true;
      setSaveStatus("saving");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [commit, flush]
  );

  // Enregistre avant de quitter la page (au mieux).
  React.useEffect(() => {
    const onHide = () => {
      if (dirtyRef.current) void flush();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flush]);

  // ─── Fiches IA (2 à la fois) ──────────────────────────────────────────────────────────────────
  const runSuggestions = React.useCallback(
    async (onlyGroupId?: string) => {
      if (!onlyGroupId && suggestRunning.current) return;
      const s = stateRef.current;
      const id = idRef.current;
      if (!s || !id) return;
      const todo = s.groups.filter((g) =>
        onlyGroupId ? g.id === onlyGroupId : g.suggestion === "pending" && !g.productId && !g.excluded && g.itemIds.length > 0
      );
      if (!todo.length) return;
      if (!onlyGroupId) suggestRunning.current = true;
      let capped = false;
      await runLimited(todo, SUGGEST_CONCURRENCY, async (g0) => {
        if (capped) return;
        const cur = stateRef.current?.groups.find((g) => g.id === g0.id);
        if (!cur || !stateRef.current) return;
        const key = suggestKeyOf(stateRef.current, cur);
        const itemIds = suggestPhotoIds(stateRef.current, cur);
        setSuggesting((prev) => new Set(prev).add(g0.id));
        const res = await bulkFetch<{ suggestion?: Omit<ImportDraft, "price" | "priceOnRequest" | "options">; capped?: boolean }>(
          `/api/products/imports/${id}/suggest`,
          { body: { itemIds, groupId: g0.id } }
        );
        setSuggesting((prev) => {
          const n = new Set(prev);
          n.delete(g0.id);
          return n;
        });
        if (res.data.capped) capped = true;
        update((st) => ({
          ...st,
          groups: st.groups.map((g) => {
            if (g.id !== g0.id || g.productId) return g;
            const sug = res.ok ? res.data.suggestion : undefined;
            if (!sug) return { ...g, suggestion: "failed" as const };
            const d = g.draft;
            // Les champs déjà remplis par le vendeur ne sont jamais écrasés.
            return {
              ...g,
              suggestion: "ready" as const,
              suggestKey: key,
              draft: {
                ...d,
                name: d.name.trim() ? d.name : sug.name,
                description: d.description.trim() ? d.description : sug.description,
                category: d.category.trim() ? d.category : sug.category,
                marketCategory: d.marketCategory || sug.marketCategory,
                subjectType: sug.subjectType ?? d.subjectType,
              },
            };
          }),
        }));
      });
      if (capped) {
        update((st) => ({ ...st, groups: st.groups.map((g) => (g.suggestion === "pending" ? { ...g, suggestion: "failed" as const } : g)) }));
      }
      if (!onlyGroupId) suggestRunning.current = false;
    },
    [update]
  );

  // Reprise : fiches pas encore rédigées.
  React.useEffect(() => {
    if (initialPhase === "review") void runSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 1. Choix des fichiers ────────────────────────────────────────────────────────────────────
  function addFiles(list: FileList | null) {
    // Copie IMMÉDIATE : la FileList est vidée dès que le champ est remis à zéro (e.target.value = ""),
    // alors que React exécute la mise à jour plus tard (sauf au 1er ajout) — d'où les ajouts ignorés.
    const picked = list ? Array.from(list) : [];
    if (!picked.length) return;
    setError(null);
    setFiles((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((p) => `${p.file.name}-${p.file.size}`));
      for (const file of picked) {
        const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name) ? "image" : null;
        if (!kind) continue;
        const sig = `${file.name}-${file.size}`;
        if (seen.has(sig)) continue; // même fichier choisi deux fois
        seen.add(sig);
        next.push({
          key: uid(),
          file,
          kind,
          preview: kind === "image" ? URL.createObjectURL(file) : null,
          over: false,
          status: "waiting",
          uploaded: [],
        });
      }
      let photos = 0;
      let videos = 0;
      return next.map((p) => {
        const over = p.kind === "image" ? ++photos > limits.photosPerLot : ++videos > limits.videosPerLot;
        return { ...p, over };
      });
    });
  }

  function removeFile(key: string) {
    setFiles((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      let photos = 0;
      let videos = 0;
      return prev
        .filter((p) => p.key !== key)
        .map((p) => ({ ...p, over: p.kind === "image" ? ++photos > limits.photosPerLot : ++videos > limits.videosPerLot }));
    });
  }

  const usable = files.filter((f) => !f.over);
  const photoCount = usable.filter((f) => f.kind === "image").length;
  const videoCount = usable.filter((f) => f.kind === "video").length;

  async function sendAndAnalyze() {
    setError(null);
    setLimitHit(false);
    setPhase("sending");
    const names = new Map<string, number>();
    const work = usable.filter((f) => f.status !== "sent");
    const patch = (key: string, p: Partial<Picked>) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...p } : f)));
    const done = new Map<string, Picked["uploaded"]>(usable.filter((f) => f.status === "sent").map((f) => [f.key, f.uploaded]));
    await runLimited(work, 3, async (f) => {
      patch(f.key, { status: "sending", error: undefined });
      try {
        if (f.kind === "image") {
          const up = await uploadShopMedia(f.file, "product");
          const uploaded = [{ path: up.path, width: up.width, height: up.height, videoRef: null, name: f.file.name, takenAt: takenAtOf(f.file) }];
          done.set(f.key, uploaded);
          patch(f.key, { status: "sent", uploaded });
        } else {
          const n = (names.get(f.file.name) ?? 0) + 1;
          names.set(f.file.name, n);
          const ref = (n > 1 ? `${f.file.name} (${n})` : f.file.name).slice(0, 120);
          const frames = await videoFrames(f.file);
          if (!frames.length) throw new Error(t("bulk.videoUnreadable"));
          const uploaded: Picked["uploaded"] = [];
          for (const [i, b] of frames.entries()) {
            const up = await uploadShopMedia(new File([b], `${f.file.name}-${i + 1}.jpg`, { type: "image/jpeg" }), "product");
            uploaded.push({ path: up.path, width: up.width, height: up.height, videoRef: ref, name: f.file.name, takenAt: takenAtOf(f.file) });
          }
          done.set(f.key, uploaded);
          patch(f.key, { status: "sent", uploaded });
        }
      } catch (err) {
        patch(f.key, { status: "failed", error: err instanceof Error ? err.message : t("bulk.sendFailed") });
      }
    });

    const items = usable.flatMap((f) => done.get(f.key) ?? []);
    const failed = usable.length - usable.filter((f) => done.has(f.key)).length;
    if (failed > 0) {
      setPhase("pick");
      setError(t("bulk.someFailed").replace("{n}", String(failed)));
      return;
    }
    if (!items.length) {
      setPhase("pick");
      setError(t("bulk.nothingSent"));
      return;
    }
    const created = await bulkFetch<{ id?: string; import?: BulkImportInitial | null }>("/api/products/imports", {
      body: { items: items.map(({ path, width, height, videoRef, name, takenAt }) => ({ path, width, height, videoRef, name, takenAt })) },
    });
    if (!created.ok || !created.data.id || !created.data.import) {
      setPhase("pick");
      setError(created.data.error || t("bulk.startFailed"));
      return;
    }
    idRef.current = created.data.id;
    versionRef.current = created.data.import.version;
    commit(created.data.import.state);
    // Adresse de reprise, sans recharger la page (un rendu serveur remonterait l'écran en cours).
    window.history.replaceState(null, "", `/dashboard/produits/import?id=${created.data.id}`);
    await analyze(false);
  }

  /** Continuer sans les fichiers en échec. */
  function dropFailed() {
    setFiles((prev) => prev.filter((f) => f.status !== "failed"));
    setError(null);
  }

  // ─── 2. Analyse ───────────────────────────────────────────────────────────────────────────────
  async function analyze(manual: boolean) {
    const id = idRef.current;
    if (!id) return;
    setError(null);
    setLimitHit(false);
    setPhase("analyzing");
    const res = await bulkFetch<{ import?: BulkImportInitial | null; free?: boolean; canManual?: boolean; limit?: string }>(
      `/api/products/imports/${id}/group`,
      { body: { manual } }
    );
    if (!res.ok || !res.data.import) {
      setPhase("groupFailed");
      setCanManual(true);
      if (res.data.limit === "generations") setLimitHit(true);
      setError(res.data.message || res.data.error || t("bulk.groupFailed"));
      return;
    }
    versionRef.current = res.data.import.version;
    orderRef.current = [];
    commit(res.data.import.state);
    // Pas de fiche IA tout de suite : le vendeur valide d'abord les groupes.
    setVariantChoices({});
    setPhase("groups");
  }

  /** Fusionne des produits à l'étape Groupes (sélection ou glisser-déposer), avec « Annuler ». */
  function mergeWithUndo(intoId: string, fromIds: string[]) {
    const before = stateRef.current;
    if (!before || !fromIds.length) return;
    update((s) => fromIds.reduce((acc, id) => mergeGroups(acc, intoId, id), s));
    setUndo({ snapshot: before, message: t("bulk.mergedToast").replace("{n}", String(fromIds.length + 1)) });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function undoMerge() {
    if (!undo) return;
    const snapshot = undo.snapshot;
    update(() => snapshot);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  /** Valide les groupes (fusions des familles de variantes choisies), puis lance les fiches IA. */
  async function confirmGroups() {
    if (!stateRef.current) return;
    setConfirming(true);
    setSelected(null);
    setUndo(null);
    update((s) => applyVariantChoices(s, variantChoices));
    // La fiche lit les options du produit côté serveur : on enregistre avant de la demander.
    await flush();
    orderRef.current = [];
    setConfirming(false);
    setPhase("review");
    void runSuggestions();
  }

  // ─── 3. Révision ──────────────────────────────────────────────────────────────────────────────
  function photoAction(fromGroupId: string | null, itemId: string, a: PhotoAction) {
    setSelected(null);
    if (a.kind === "main" && fromGroupId) return update((s) => setMain(s, fromGroupId, itemId));
    if (a.kind === "move") return update((s) => moveItem(s, itemId, { kind: "group", groupId: a.groupId }));
    if (a.kind === "new") return update((s) => moveItem(s, itemId, { kind: "new", groupId: uid() }));
    if (a.kind === "unsorted") return update((s) => moveItem(s, itemId, { kind: "unsorted" }));
    if (a.kind === "removed") return update((s) => moveItem(s, itemId, { kind: "removed" }));
  }

  // ─── 4. Création ──────────────────────────────────────────────────────────────────────────────
  async function createAll(publish: boolean) {
    const id = idRef.current;
    if (!id || !stateRef.current) return;
    setConfirmPublish(false);
    setError(null);
    setPhase("creating");
    const saved = await flush();
    if (!saved && dirtyRef.current) {
      setPhase("review");
      setError(t("bulk.saveFailed"));
      return;
    }
    const todo = creatableGroups(stateRef.current);
    const out: Record<string, CreateResult> = {};
    for (const g of todo) {
      const res = await createFromImportGroup(id, g.id, publish).catch(() => ({ ok: false as const, error: t("bulk.createFailed") }));
      if (res.ok) {
        out[g.id] = { ok: true };
        update((s) => ({ ...s, groups: s.groups.map((x) => (x.id === g.id ? { ...x, productId: res.id } : x)) }));
      } else {
        out[g.id] = { ok: false, error: res.error };
        setResults((prev) => ({ ...prev, ...out }));
        if ("limit" in res && res.limit === "products") break;
      }
      setResults((prev) => ({ ...prev, ...out }));
    }
    await flush();
    const failures = Object.values(out).filter((r) => !r.ok).length;
    if (failures === 0 && stateRef.current && creatableGroups(stateRef.current).length === 0) {
      await finish(false);
    } else {
      setPhase("review");
      setError(t("bulk.someNotCreated").replace("{n}", String(failures)));
    }
    router.refresh();
  }

  async function finish(cancel: boolean) {
    const id = idRef.current;
    if (!id) return router.push("/dashboard/produits");
    await flush();
    const res = await bulkFetch<{ created?: number }>(`/api/products/imports/${id}/finish`, { body: { cancel } });
    if (cancel) {
      router.push("/dashboard/produits");
      router.refresh();
      return;
    }
    setFinishInfo({ created: res.data.created ?? stateRef.current?.groups.filter((g) => g.productId).length ?? 0 });
    setPhase("done");
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────────────────────────
  const step = phase === "pick" || phase === "sending" ? 1 : phase === "analyzing" || phase === "groupFailed" || phase === "groups" ? 2 : phase === "done" ? 4 : 3;
  const summary = state ? importSummary(state) : null;
  const toCreate = state ? creatableGroups(state).length : 0;
  const items = new Map((state?.items ?? []).map((i) => [i.id, i]));
  if (state) {
    const known = new Set(orderRef.current);
    const fresh = state.groups.map((g, i) => ({ g, i })).filter(({ g }) => !known.has(g.id));
    if (fresh.length) {
      if (orderRef.current.length === 0) {
        fresh.sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i);
        orderRef.current = fresh.map(({ g }) => g.id);
      } else {
        // Nouveau produit (défusionné, « Nouveau produit ») : juste après celui qui le précède.
        const order = [...orderRef.current];
        for (const { g, i } of fresh) {
          const prev = state.groups.slice(0, i).reverse().find((x) => order.includes(x.id));
          const at = prev ? order.indexOf(prev.id) + 1 : order.length;
          order.splice(at, 0, g.id);
        }
        orderRef.current = order;
      }
    }
  }
  const position = new Map(orderRef.current.map((id, i) => [id, i]));

  return (
    <div className="mx-auto w-full max-w-3xl pb-40">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/produits" aria-label={t("bulk.back")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("bulk.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("bulk.pilot")}</p>
        </div>
      </div>

      <ol className="mb-5 grid grid-cols-4 gap-1.5 text-[11px] font-medium">
        {["bulk.step1", "bulk.step2", "bulk.step3", "bulk.step4"].map((k, i) => (
          <li key={k} className={cn("rounded-full px-2 py-1 text-center", i + 1 <= step ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
            {i + 1} · {t(k)}
          </li>
        ))}
      </ol>

      {notice && (
        <p className="mb-4 flex items-start justify-between gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label={t("bulk.close")}>
            <X className="h-4 w-4" />
          </button>
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <p>{error}</p>
          {limitHit && (
            <Link href="/dashboard/abonnement" className="mt-1 inline-block font-semibold underline">
              {t("bulk.getCredits")}
            </Link>
          )}
        </div>
      )}

      {/* 1. Photos */}
      {(phase === "pick" || phase === "sending") && (
        <section>
          <div className="mb-4 rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="mb-1 font-semibold">{t("bulk.pickTitle")}</p>
            <p className="text-muted-foreground">{t("bulk.pickDesc")}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("bulk.pickLimits").replace("{photos}", String(limits.photosPerLot)).replace("{videos}", String(limits.videosPerLot))}
            </p>
            <p className="mt-1 text-xs font-medium">
              {firstFree
                ? t("bulk.firstFree")
                : creditsLeft == null
                  ? t("bulk.costOne")
                  : t("bulk.costOneLeft").replace("{n}", String(creditsLeft))}
            </p>
            {analysesLeftToday != null && (
              <p className={cn("mt-1 text-xs", analysesLeftToday === 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
                {analysesLeftToday === 0
                  ? t("bulk.dailyNone")
                  : t("bulk.dailyLeft").replace("{n}", String(analysesLeftToday)).replace("{max}", String(BULK_IMPORTS_PER_DAY))}
              </p>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {files.length === 0 ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center hover:bg-muted/50"
            >
              <ImagePlus className="h-8 w-8 text-primary" />
              <span className="font-semibold">{t("bulk.choose")}</span>
              <span className="text-xs text-muted-foreground">{t("bulk.chooseHint")}</span>
            </button>
          ) : (
            <>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {files.map((f) => (
                  <li key={f.key} className={cn("relative aspect-square overflow-hidden rounded-xl border border-border bg-muted", f.over && "opacity-40")}>
                    {f.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[10px] text-muted-foreground">
                        <Film className="h-6 w-6" />
                        <span className="line-clamp-2 break-all">{f.file.name}</span>
                      </div>
                    )}
                    {f.status === "sending" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </span>
                    )}
                    {f.status === "sent" && (
                      <span className="absolute bottom-1 left-1 rounded-full bg-success p-0.5 text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {f.status === "failed" && (
                      <span className="absolute inset-x-0 bottom-0 bg-destructive px-1 py-0.5 text-center text-[10px] text-white" title={f.error}>
                        {t("bulk.failedShort")}
                      </span>
                    )}
                    {f.over && (
                      <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[10px] text-white">{t("bulk.nextLot")}</span>
                    )}
                    {phase === "pick" && (
                      <button
                        type="button"
                        onClick={() => removeFile(f.key)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                        aria-label={t("bulk.remove")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
                {phase === "pick" && (
                  <li>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      <ImagePlus className="h-5 w-5" />
                      {t("bulk.addMore")}
                    </button>
                  </li>
                )}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("bulk.counts")
                  .replace("{photos}", String(photoCount))
                  .replace("{maxPhotos}", String(limits.photosPerLot))
                  .replace("{videos}", String(videoCount))
                  .replace("{maxVideos}", String(limits.videosPerLot))}
              </p>
              {files.some((f) => f.status === "failed") && phase === "pick" && (
                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={dropFailed}>
                  {t("bulk.dropFailed")}
                </Button>
              )}
            </>
          )}

          {usable.length > 0 && (
            <div className="sticky bottom-20 mt-6 sm:bottom-4">
              <Button type="button" variant="accent" size="lg" className="w-full" disabled={phase === "sending"} onClick={() => void sendAndAnalyze()}>
                {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {phase === "sending"
                  ? t("bulk.sending")
                      .replace("{n}", String(usable.filter((f) => f.status === "sent").length))
                      .replace("{total}", String(usable.length))
                  : t("bulk.analyze").replace("{n}", String(usable.length))}
              </Button>
            </div>
          )}
        </section>
      )}

      {/* 2. Analyse */}
      {phase === "analyzing" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-semibold">{t("bulk.analyzing").replace("{n}", String(state?.items.length ?? 0))}</p>
          <p className="text-xs text-muted-foreground">{t("bulk.analyzingHint")}</p>
        </div>
      )}

      {phase === "groupFailed" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <p className="font-semibold">{t("bulk.groupFailedTitle")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="accent" onClick={() => void analyze(false)}>
              <RefreshCw className="h-4 w-4" />
              {t("bulk.retry")}
            </Button>
            {canManual && (
              <Button type="button" variant="secondary" onClick={() => void analyze(true)}>
                {t("bulk.manual")}
              </Button>
            )}
          </div>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void finish(true)}>
            {t("bulk.cancelImport")}
          </button>
        </div>
      )}

      {/* 2 bis. Valider les groupes (avant les fiches) */}
      {phase === "groups" && state && (
        <GroupBoard
          state={state}
          choices={variantChoices}
          onChoice={(index, merge) => setVariantChoices((prev) => ({ ...prev, [index]: merge }))}
          selected={selected}
          onSelect={setSelected}
          onPhotoAction={photoAction}
          onMerge={mergeWithUndo}
          onExclude={(groupId, ex) => update((s) => setExcluded(s, groupId, ex))}
          onConfirm={() => void confirmGroups()}
          confirming={confirming}
          saveLabel={saveStatus === "saving" ? t("bulk.saving") : saveStatus === "saved" ? t("bulk.saved") : saveStatus === "error" ? t("bulk.saveError") : ""}
        />
      )}

      {undo && phase === "groups" && (
        <div role="status" className="fixed inset-x-4 bottom-44 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-xl sm:bottom-28">
          <span>{undo.message}</span>
          <button type="button" className="shrink-0 font-semibold underline" onClick={undoMerge}>
            {t("bulk.undo")}
          </button>
        </div>
      )}

      {/* 3. Vérification */}
      {(phase === "review" || phase === "creating") && state && summary && (
        <section>
          <p className="mb-4 text-sm text-muted-foreground">{t("bulk.reviewIntro")}</p>

          {state.unsorted.length > 0 && (
            <div className="mb-4 rounded-2xl border border-warning/40 bg-card p-4">
              <p className="font-semibold">{t("bulk.unsortedTitle").replace("{n}", String(state.unsorted.length))}</p>
              <p className="mb-3 text-xs text-muted-foreground">{t("bulk.unsortedDesc")}</p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {state.unsorted.map((id) => {
                  const item = items.get(id);
                  return item ? (
                    <MediaThumb
                      key={id}
                      item={item}
                      selected={selected?.itemId === id}
                      onClick={() => setSelected(selected?.itemId === id ? null : { groupId: null, itemId: id })}
                    />
                  ) : null;
                })}
              </div>
              {selected && selected.groupId === null && state.unsorted.includes(selected.itemId) && (
                <PhotoSheet
                  state={state}
                  fromGroupId={null}
                  canSetMain={false}
                  onAction={(a) => photoAction(null, selected.itemId, a)}
                  onClose={() => setSelected(null)}
                />
              )}
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {[...state.groups]
              .map((g, i) => ({ g, i }))
              .sort((a, b) => (position.get(a.g.id) ?? 0) - (position.get(b.g.id) ?? 0))
              .map(({ g, i }) => (
                <React.Fragment key={g.id}>
                  <GroupCard
                    state={state}
                    group={g}
                    index={i}
                    suggesting={suggesting.has(g.id)}
                    selectedItem={selected?.groupId === g.id ? selected.itemId : null}
                    onSelectItem={(itemId) => setSelected(itemId ? { groupId: g.id, itemId } : null)}
                    onPhotoAction={(itemId, a) => photoAction(g.id, itemId, a)}
                    onDraft={(p) => update((s) => updateDraft(s, g.id, p))}
                    onExclude={(ex) => update((s) => setExcluded(s, g.id, ex))}
                    onMerge={(fromId, option) => update((s) => mergeGroups(s, g.id, fromId, option))}
                    onMergeMany={(selectedIds) =>
                      update((s) => {
                        const target = s.groups.find((x) => x.id === g.id);
                        if (!target) return s;
                        const wasMerged = target.merged.map((m) => m.id);
                        // Décochés : recréés comme produits ; nouveaux cochés : fusionnés ici.
                        let next = wasMerged.filter((id) => !selectedIds.includes(id)).reduce((acc, id) => unmergeGroup(acc, g.id, id), s);
                        next = selectedIds.filter((id) => !wasMerged.includes(id)).reduce((acc, id) => mergeGroups(acc, g.id, id), next);
                        return next;
                      })
                    }
                    onUnmerge={(mergedId) => update((s) => unmergeGroup(s, g.id, mergedId))}
                    onReviewed={() => update((s) => markReviewed(s, g.id))}
                    onResuggest={() => {
                      update((s) => ({ ...s, groups: s.groups.map((x) => (x.id === g.id ? { ...x, suggestion: "pending" as const } : x)) }));
                      void runSuggestions(g.id);
                    }}
                  />
                  {results[g.id] && !results[g.id].ok && (
                    <li className="-mt-2 flex items-center gap-1.5 px-2 text-xs text-destructive">
                      <XCircle className="h-3.5 w-3.5" />
                      {(results[g.id] as { error: string }).error}
                    </li>
                  )}
                </React.Fragment>
              ))}
          </ul>

          <div className="mt-6 text-center">
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => void finish(summary.created === 0)}>
              {summary.created === 0 ? t("bulk.cancelImport") : t("bulk.finishNow")}
            </button>
          </div>

          {/* Barre de résumé */}
          <div className="sticky bottom-20 z-10 mt-6 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:bottom-4">
            <p className="mb-2 text-center text-xs text-muted-foreground">
              {t("bulk.summary")
                .replace("{files}", String(summary.files))
                .replace("{products}", String(summary.products))
                .replace("{review}", String(summary.toReview + summary.incomplete))
                .replace("{ready}", String(summary.ready))}
              {saveStatus === "saving" ? ` · ${t("bulk.saving")}` : saveStatus === "saved" ? ` · ${t("bulk.saved")}` : saveStatus === "error" ? ` · ${t("bulk.saveError")}` : ""}
            </p>
            {confirmPublish ? (
              <div className="flex flex-col gap-2">
                <p className="text-center text-sm">{t("bulk.publishConfirm").replace("{n}", String(toCreate))}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setConfirmPublish(false)}>
                    {t("bulk.cancel")}
                  </Button>
                  <Button type="button" variant="accent" className="flex-1" onClick={() => void createAll(true)}>
                    {t("bulk.publishYes")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="accent"
                  size="lg"
                  className="flex-1"
                  disabled={toCreate === 0 || phase === "creating" || suggesting.size > 0}
                  onClick={() => void createAll(false)}
                >
                  {phase === "creating" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {phase === "creating" ? t("bulk.creating") : t("bulk.createDrafts").replace("{n}", String(toCreate))}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={toCreate === 0 || phase === "creating" || suggesting.size > 0}
                  onClick={() => setConfirmPublish(true)}
                >
                  {t("bulk.createPublish")}
                </Button>
              </div>
            )}
            {summary.incomplete > 0 && phase === "review" && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {t("bulk.incompleteHint").replace("{n}", String(summary.incomplete))}
              </p>
            )}
          </div>
        </section>
      )}

      {/* 4. Rapport */}
      {phase === "done" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="text-lg font-semibold">{t("bulk.doneTitle").replace("{n}", String(finishInfo?.created ?? 0))}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("bulk.doneDesc")}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button variant="accent" asChild>
              <Link href="/dashboard/produits">{t("bulk.seeProducts")}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <a href="/dashboard/produits/import">{t("bulk.newLot")}</a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function rank(g: ImportState["groups"][number]): number {
  if (g.productId) return 4;
  if (g.excluded) return 5;
  if (g.reasons.length) return 0;
  if (!g.draft.name.trim()) return 1;
  return 2;
}
