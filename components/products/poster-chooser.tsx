"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import { chooseProductPoster, listProductPosters, type PosterChoices, type PosterOption } from "@/app/dashboard/produits/poster-actions";
import { cn } from "@/lib/utils";

// Choix de l'affiche affichée pour cette fiche (boutique + Jaarle Market), sous l'option « L'affiche ».
// Enregistré tout de suite (pas besoin du bouton Enregistrer du formulaire).

export function PosterChooser({ productId }: { productId: string }) {
  const [data, setData] = React.useState<PosterChoices | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    listProductPosters(productId).then((d) => alive && setData(d), () => alive && setData({ options: [], currentKey: null, chosenKey: null }));
    return () => {
      alive = false;
    };
  }, [productId]);

  async function choose(o: PosterOption) {
    setSaving(o.key);
    setError(null);
    const res = await chooseProductPoster(productId, o.creationId, o.versionId);
    if (!res.ok) {
      setError(res.error ?? "Enregistrement impossible.");
    } else {
      setData(await listProductPosters(productId));
    }
    setSaving(null);
  }

  const createHref = `/dashboard/new?productId=${productId}`;

  if (!data) {
    return (
      <div className="mt-3 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 w-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  const linked = data.options.filter((o) => o.linked);
  const others = data.options.filter((o) => !o.linked);
  const current = data.options.find((o) => o.key === data.currentKey) ?? null;

  if (data.options.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Aucune affiche pour ce service pour l&apos;instant : la photo s&apos;affiche en attendant.{" "}
        <Link href={createHref} className="inline-flex items-center gap-1 font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Créer une affiche
        </Link>
      </div>
    );
  }

  const tile = (o: PosterOption) => {
    const active = o.key === data.currentKey;
    return (
      <button
        key={o.key}
        type="button"
        onClick={() => choose(o)}
        disabled={!!saving}
        aria-pressed={active}
        className={cn(
          "group relative w-24 shrink-0 overflow-hidden rounded-xl border-2 text-left transition-colors sm:w-28",
          active ? "border-primary" : "border-transparent hover:border-border"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={o.thumbUrl} alt={o.label} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
        <span className="block truncate px-1.5 py-1 text-[11px] font-medium">{o.label}</span>
        {active && (
          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
        {!o.unlocked && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Lock className="h-2.5 w-2.5" /> À débloquer
          </span>
        )}
        {saving === o.key && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-3">
      <p className="mb-2 text-sm font-semibold">Affiche affichée</p>
      {linked.length > 0 && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{linked.map(tile)}</div>}
      {others.length > 0 && (
        <>
          <p className="mb-2 mt-3 text-xs font-medium text-muted-foreground">{linked.length > 0 ? "Tes autres affiches" : "Choisis une de tes affiches"}</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{others.map(tile)}</div>
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {current
          ? "Elle est enregistrée tout de suite et s'affiche dans ta boutique et sur Jaarle Market."
          : "Aucune affiche débloquée pour ce service : la photo s'affiche en attendant. Débloque une affiche pour qu'elle apparaisse."}{" "}
        <Link href={createHref} className="font-semibold text-primary">
          Nouvelle affiche
        </Link>
      </p>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
