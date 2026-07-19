"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/locale-context";
import { CreationStepIndicator } from "@/components/dashboard/creation-step-indicator";
import { CreationResult } from "@/components/dashboard/creation-result";
import { Button } from "@/components/ui/button";
import { getTierConfig } from "@/lib/pricing";

type Phase = "checking" | "ready" | "timeout" | "error";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20; // ~30s

export function UnlockConfirm({ refCommand }: { refCommand: string }) {
  const { t } = useLocale();
  const [phase, setPhase] = React.useState<Phase>("checking");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    imageUrl: string;
    productName: string;
    price: number;
    salesCopy: string | null;
    hashtags: string[];
    tierPrice: number;
  } | null>(null);

  const attemptsRef = React.useRef(0);
  const cancelledRef = React.useRef(false);

  const loadCreation = React.useCallback(
    async (creationId: string) => {
      const supabase = createClient();
      const { data: creation } = await supabase
        .from("creations")
        .select("*")
        .eq("id", creationId)
        .single();

      if (!creation) {
        setErrorMessage(t("creation.errorGeneric"));
        setPhase("error");
        return;
      }

      const displayPath = creation.poster_path || creation.photo_path;
      const { data: signed } = await supabase.storage.from("creations").createSignedUrl(displayPath, 3600);

      setResult({
        imageUrl: signed?.signedUrl ?? "",
        productName: creation.product_name,
        price: creation.price,
        salesCopy: creation.generated_copy,
        hashtags: creation.generated_hashtags ?? [],
        tierPrice: getTierConfig(creation.tier).price,
      });
      setPhase("ready");
    },
    [t]
  );

  const poll = React.useCallback(async () => {
    if (cancelledRef.current) return;
    const supabase = createClient();
    const { data: order } = await supabase
      .from("orders")
      .select("status, creation_id")
      .eq("ref_command", refCommand)
      .single();

    if (!order) {
      setErrorMessage(t("creation.errorGeneric"));
      setPhase("error");
      return;
    }

    if (order.status === "paid" && order.creation_id) {
      loadCreation(order.creation_id);
      return;
    }

    if (order.status === "canceled" || order.status === "failed") {
      setErrorMessage(t("creation.paymentCanceled"));
      setPhase("error");
      return;
    }

    attemptsRef.current += 1;
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      setPhase("timeout");
      return;
    }

    setTimeout(poll, POLL_INTERVAL_MS);
  }, [refCommand, loadCreation, t]);

  React.useEffect(() => {
    cancelledRef.current = false;
    poll();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    attemptsRef.current = 0;
    setPhase("checking");
    poll();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <CreationStepIndicator step={3} />

      <div className="rounded-[20px] border border-border bg-card p-6">
        {phase === "checking" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
              <span className="absolute inset-[-4px] animate-ping rounded-xl border border-primary/50" />
            </div>
            <p className="text-sm font-semibold">{t("creation.checkingPayment")}</p>
          </div>
        )}

        {phase === "timeout" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("creation.paymentTimeout")}</p>
            <Button variant="accent" onClick={retry}>
              {t("creation.retry")}
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-destructive">{errorMessage}</p>
            <Button variant="accent" asChild>
              <Link href="/dashboard/creations">{t("creation.viewCreations")}</Link>
            </Button>
          </div>
        )}

        {phase === "ready" && result && (
          <CreationResult
            imageUrl={result.imageUrl}
            imageFallback={false}
            productName={result.productName}
            formattedPrice={result.price.toLocaleString("fr-FR")}
            salesCopy={result.salesCopy}
            hashtags={result.hashtags}
            tierPrice={result.tierPrice}
            onNewCreation={() => {}}
          />
        )}
      </div>
    </div>
  );
}
