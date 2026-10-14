"use client";

import Link from "next/link";
import { ArrowRight, Images, Lock, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

/**
 * Import de plusieurs produits en une fois (Bulk Upload).
 * - Formule qui l'inclut + écran ouvert (phase pilote : testeurs seulement) : bouton « Commencer »
 *   et, s'il y a un lot en cours, « Reprendre ».
 * - Formule qui l'inclut, écran pas encore ouvert : « Bientôt ».
 * - Gratuit : cadenas + lien vers l'abonnement (comme la vidéo et la promo).
 */
export function BulkUploadTeaser({ included, open = false, resumeId = null }: { included: boolean; open?: boolean; resumeId?: string | null }) {
  const { t } = useLocale();
  const live = included && open;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Images className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {t("products.bulkTitle")}
          {live ? (
            <Badge variant="accent">{t("products.bulkPilot")}</Badge>
          ) : included ? (
            <Badge variant="accent">{t("products.bulkSoon")}</Badge>
          ) : (
            <Badge variant="neutral">{t("products.bulkPlans")}</Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {live ? t("products.bulkDescLive") : included ? t("products.bulkDescIncluded") : t("products.bulkDescLocked")}
        </p>
      </div>
      {live && (
        <div className="flex shrink-0 gap-2">
          {resumeId && (
            <Button variant="secondary" size="sm" className="gap-1.5" asChild>
              <Link href={`/dashboard/produits/import?id=${resumeId}`}>
                <RotateCcw className="h-3.5 w-3.5" />
                {t("products.bulkResume")}
              </Link>
            </Button>
          )}
          <Button variant="accent" size="sm" className="gap-1.5" asChild>
            <Link href="/dashboard/produits/import">
              {t("products.bulkStart")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}
      {!included && (
        <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" asChild>
          <Link href="/dashboard/abonnement">
            <Lock className="h-3.5 w-3.5" />
            {t("products.bulkUpgrade")}
          </Link>
        </Button>
      )}
    </div>
  );
}
