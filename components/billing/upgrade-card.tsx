"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Coins, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

export type LimitReason = "generations" | "products" | "analytics" | "feature";

const PERKS = ["perk_products", "perk_generations", "perk_watermark", "perk_stats"] as const;

/**
 * Message affiché quand une limite de l'offre gratuite est atteinte : explique, montre ce que Pro
 * apporte, propose de passer à Pro (ou d'acheter des crédits pour les générations). Jamais agressif.
 */
export function UpgradeCard({
  reason,
  limit,
  resetDate,
  onClose,
  className,
}: {
  reason: LimitReason;
  limit?: number | null;
  resetDate?: string | null; // date lisible (« 1 octobre 2026 »)
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <div className={cn("relative rounded-2xl border border-primary/25 bg-card p-5 shadow-sm sm:p-6", className)}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("billing.later")}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Sparkles className="h-5 w-5" />
      </span>
      <p className="text-base font-bold">{t("billing.limitTitle")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(`billing.limit_${reason}`).replace("{limit}", String(limit ?? ""))}
        {reason === "generations" && resetDate ? ` ${t("billing.resetOn").replace("{date}", resetDate)}` : ""}
      </p>
      <p className="mt-4 text-sm font-semibold">{t("billing.upgradeLead")}</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {PERKS.map((k) => (
          <li key={k} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-3 w-3" />
            </span>
            {t(`billing.${k}`)}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button variant="accent" size="lg" className="flex-1" asChild>
          <Link href="/dashboard/abonnement">{t("billing.upgradeCta")}</Link>
        </Button>
        {reason === "generations" && (
          <Button variant="secondary" size="lg" className="flex-1" asChild>
            <Link href="/dashboard/abonnement#credits">
              <Coins className="h-4 w-4" />
              {t("billing.buyCredits")}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Même contenu en fenêtre (feuille du bas sur mobile), pour les limites atteintes en cours d'action. */
export function LimitDialog({ reason, onClose, limit }: { reason: LimitReason | null; onClose: () => void; limit?: number | null }) {
  React.useEffect(() => {
    if (!reason) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reason, onClose]);
  if (!reason) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <UpgradeCard reason={reason} limit={limit} onClose={onClose} className="rounded-b-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-6" />
      </div>
    </div>
  );
}

/** Lit une réponse d'API : renvoie la raison si c'est une limite atteinte (403 limit_reached). */
export function limitReasonFrom(data: unknown): LimitReason | null {
  if (data && typeof data === "object" && (data as { error?: string }).error === "limit_reached") {
    const l = (data as { limit?: string }).limit;
    return l === "products" || l === "analytics" || l === "feature" ? l : "generations";
  }
  return null;
}
