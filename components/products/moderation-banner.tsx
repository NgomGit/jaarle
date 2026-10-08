"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2 } from "lucide-react";
import { requestProductReview } from "@/app/dashboard/produits/actions";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

/** Produit masqué par Jaarle (0044) : raison, puis « J'ai corrigé, demander une vérification ». */
export function ModerationBanner({ productId, reason, reviewRequestedAt }: { productId: string; reason: string | null; reviewRequestedAt: string | null }) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function request() {
    setBusy(true);
    setError(null);
    const res = await requestProductReview(productId);
    setBusy(false);
    if (!res.ok) setError(res.error ?? t("products.moderatedError"));
    router.refresh();
  }

  return (
    <div role="alert" className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <EyeOff className="h-4 w-4" />
        {t("products.moderatedTitle")}
      </p>
      {reason && (
        <p className="mt-1.5">
          <span className="text-muted-foreground">{t("products.moderatedReason")} </span>
          {reason}
        </p>
      )}
      <p className="mt-1.5 text-muted-foreground">{t("products.moderatedHelp")}</p>
      <div className="mt-3">
        {reviewRequestedAt ? (
          <p className="font-medium">{t("products.reviewRequested")}</p>
        ) : (
          <Button size="sm" variant="accent" disabled={busy} onClick={request}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("products.requestReview")}
          </Button>
        )}
        {error && <p className="mt-2 text-destructive">{error}</p>}
      </div>
    </div>
  );
}
