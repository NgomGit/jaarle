"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  chooseProductPoster,
  listProductPosters,
  removeProductPoster,
  type PosterChoices,
  type PosterOption,
} from "@/app/dashboard/produits/poster-actions";
import { cn } from "@/lib/utils";

// Affiche de ce produit, affichée dans la boutique et sur Jaarle Market (option « L'affiche »).
// • les affiches de CE produit et leurs versions ; un clic choisit, « Retirer » remet la photo ;
// • une affiche non débloquée (offre gratuite) s'affiche signée du logo Jaarle ; « Retirer la
//   signature » la débloque ici (quota Pro ou crédits) ;
// • aucune affiche : bouton pour en créer une depuis ce produit.
// Enregistré tout de suite (pas besoin du bouton Enregistrer du formulaire).

export function PosterChooser({ productId }: { productId: string }) {
  const router = useRouter();
  const [data, setData] = React.useState<PosterChoices | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => setData(await listProductPosters(productId)), [productId]);

  React.useEffect(() => {
    reload().catch(() => setData({ options: [], currentKey: null, chosenKey: null }));
  }, [reload]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action impossible.");
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function unlock(o: PosterOption) {
    await run(`unlock-${o.creationId}`, async () => {
      const res = await fetch("/api/billing/unlock-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creationId: o.creationId }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !body.ok) {
        return { ok: false, error: body.message || body.error || "Déblocage impossible : il te faut des crédits ou l'offre Pro." };
      }
      const chosen = await chooseProductPoster(productId, o.key);
      router.refresh();
      return chosen;
    });
  }

  const createHref = `/dashboard/new?productId=${productId}`;

  if (!data) {
    return (
      <div className="mt-3 flex gap-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 w-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (data.options.length === 0) {
    return (
      <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Ce service n&apos;a pas encore d&apos;affiche : sa photo s&apos;affiche en attendant.</p>
        <Button variant="accent" size="sm" asChild>
          <Link href={createHref}>
            <Sparkles className="h-3.5 w-3.5" /> Créer l&apos;affiche
          </Link>
        </Button>
      </div>
    );
  }

  const removed = data.chosenKey === "00000000-0000-0000-0000-000000000000";
  // Sélection montrée : le choix du vendeur, sinon ce qui s'affiche aujourd'hui.
  const chosen = data.options.find((o) => o.key === data.chosenKey) ?? null;
  const activeKey = removed ? null : chosen?.key ?? data.currentKey;
  const active = data.options.find((o) => o.key === activeKey) ?? null;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Affiche affichée</p>
        {active && (
          <button
            type="button"
            onClick={() => run("remove", () => removeProductPoster(productId))}
            disabled={!!busy}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {busy === "remove" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Retirer
          </button>
        )}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {data.options.map((o) => {
          const isActive = o.key === activeKey;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => (isActive ? run("remove", () => removeProductPoster(productId)) : run(o.key, () => chooseProductPoster(productId, o.key)))}
              disabled={!!busy}
              aria-pressed={isActive}
              title={isActive ? "Retirer cette affiche" : "Afficher cette affiche"}
              className={cn(
                "relative w-28 shrink-0 overflow-hidden rounded-xl border-2 text-left transition-colors",
                isActive ? "border-primary" : "border-transparent hover:border-border"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.thumbUrl} alt={o.label} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
              <span className="block truncate px-1.5 py-1 text-[11px] font-medium">{o.label}</span>
              {isActive && (
                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
              {!o.unlocked && (
                <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white" title="Signée Jaarle (offre gratuite)">
                  <Lock className="h-3 w-3" />
                </span>
              )}
              {busy === o.key && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </span>
              )}
            </button>
          );
        })}
        <Link
          href={createHref}
          className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="h-5 w-5" />
          Nouvelle affiche
        </Link>
      </div>

      {/* État et action utiles */}
      {removed || !active ? (
        <p className="mt-2 text-xs text-muted-foreground">Aucune affiche sélectionnée : la photo du service s&apos;affiche. Touche une affiche pour l&apos;afficher.</p>
      ) : !active.unlocked ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Affichée dans ta boutique et sur Jaarle Market, avec la signature Jaarle (affiche de l&apos;offre gratuite). Débloque-la pour l&apos;afficher sans signature.
          </span>
          <Button size="sm" variant="secondary" onClick={() => unlock(active)} disabled={!!busy} className="shrink-0">
            {busy === `unlock-${active.creationId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            Retirer la signature
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Enregistrée : cette affiche s&apos;affiche dans ta boutique et sur Jaarle Market.</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive">
          {error}{" "}
          <Link href="/dashboard/abonnement" className="font-semibold underline">
            Voir les offres
          </Link>
        </p>
      )}
    </div>
  );
}
