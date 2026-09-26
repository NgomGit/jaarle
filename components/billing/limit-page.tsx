"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UpgradeCard, type LimitReason } from "@/components/billing/upgrade-card";
import { useLocale } from "@/lib/locale-context";

/** Page complète « limite atteinte » (avant même de remplir un formulaire). */
export function LimitPage({
  reason,
  limit,
  resetDate,
  backHref,
  backLabelKey,
}: {
  reason: LimitReason;
  limit?: number | null;
  resetDate?: string | null;
  backHref: string;
  backLabelKey: string;
}) {
  const { t } = useLocale();
  return (
    <div className="mx-auto w-full max-w-md pb-24 md:pb-6">
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t(backLabelKey)}
      </Link>
      <UpgradeCard reason={reason} limit={limit} resetDate={resetDate} />
    </div>
  );
}
