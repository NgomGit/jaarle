"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/locale-context";
import { CreationStepIndicator } from "@/components/dashboard/creation-step-indicator";
import { CreationResult } from "@/components/dashboard/creation-result";
import { Button } from "@/components/ui/button";

type Phase = "checking" | "generating" | "done" | "timeout" | "error";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20; // ~30s

export function CreationConfirm({ refCommand }: { refCommand: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("checking");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    imageUrl: string;
    imageFallback: boolean;
    productName: string;
    price: number;
    salesCopy: string | null;
    hashtags: string[];
  } | null>(null);

  const attemptsRef = React.useRef(0);
  const cancelledRef = React.useRef(false);

  const runGeneration = React.useCallback(async () => {
    setPhase("generating");
    try {
      const res = await fetch("/api/generate-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refCommand }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "generation_failed");

      setResult({
        imageUrl: data.imageUrl,
        imageFallback: !!data.imageError,
        productName: data.productName,
        price: data.price,
        salesCopy: data.salesCopy,
        hashtags: data.hashtags ?? [],
      });
      setPhase("done");
    } catch {
      setErrorMessage(t("creation.errorGeneric"));
      setPhase("error");
    }
  }, [refCommand, t]);

  const poll = React.useCallback(async () => {
    if (cancelledRef.current) return;
    const supabase = createClient();
    const { data: order } = await supabase.from("orders").select("status").eq("ref_command", refCommand).single();

    if (!order) {
      setErrorMessage(t("creation.errorGeneric"));
      setPhase("error");
      return;
    }

    if (order.status === "paid") {
      runGeneration();
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
  }, [refCommand, runGeneration, t]);

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

  const stepIndex = phase === "done" ? 3 : 2;

  return (
    <div className="mx-auto max-w-3xl">
      <CreationStepIndicator step={stepIndex} />

      <div className="rounded-[20px] border border-border bg-card p-6">
        {(phase === "checking" || phase === "generating") && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
              <span className="absolute inset-[-4px] animate-ping rounded-xl border border-primary/50" />
            </div>
            <p className="text-sm font-semibold">
              {phase === "checking" ? t("creation.checkingPayment") : t("preview.aiTitle")}
            </p>
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
              <Link href="/dashboard/new">{t("creation.backToNew")}</Link>
            </Button>
          </div>
        )}

        {phase === "done" && result && (
          <CreationResult
            imageUrl={result.imageUrl}
            imageFallback={result.imageFallback}
            productName={result.productName}
            formattedPrice={result.price.toLocaleString("fr-FR")}
            salesCopy={result.salesCopy}
            hashtags={result.hashtags}
            onNewCreation={() => router.push("/dashboard/new")}
          />
        )}
      </div>
    </div>
  );
}
