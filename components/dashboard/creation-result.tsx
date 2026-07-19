"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/locale-context";
import type { Tier } from "@/lib/pricing";

export function CreationResult({
  imageUrl,
  imageFallback,
  posterReady = true,
  productName,
  formattedPrice,
  salesCopy,
  hashtags,
  onNewCreation,
  locked = false,
  unlocking = false,
  onUnlock,
  tierPrice,
  tier,
  regenerationsRemaining = 0,
  regenerating = false,
  onRegenerate,
}: {
  imageUrl: string;
  imageFallback: boolean;
  posterReady?: boolean;
  productName: string;
  formattedPrice: string | null;
  salesCopy: string | null;
  hashtags: string[];
  onNewCreation: () => void;
  locked?: boolean;
  unlocking?: boolean;
  onUnlock?: () => void;
  tierPrice: number;
  tier?: Tier;
  regenerationsRemaining?: number;
  regenerating?: boolean;
  onRegenerate?: (instructions: string) => void;
}) {
  const { t } = useLocale();
  const [instructions, setInstructions] = React.useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <img
          src={imageUrl}
          alt={productName}
          className="max-h-[360px] w-full select-none object-contain bg-muted [-webkit-touch-callout:none]"
          draggable={locked ? false : undefined}
          onContextMenu={locked ? (e) => e.preventDefault() : undefined}
          onDragStart={locked ? (e) => e.preventDefault() : undefined}
        />
        <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-primary shadow-glow-sm">
          {imageFallback ? t("creation.imageFallbackLabel") : t("creation.aiLabel")}
        </span>
        {!posterReady && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <div className="flex items-end justify-between">
              <span className="text-sm font-bold text-white">{productName}</span>
              <span className="font-mono text-sm font-bold text-white">
                {formattedPrice ? `${formattedPrice} FCFA` : t("creation.priceOnRequestLabel")}
              </span>
            </div>
          </div>
        )}
      </div>

      {imageFallback && <p className="text-xs text-muted-foreground">{t("creation.imageFallbackNote")}</p>}

      {locked && tier === "premium" && onRegenerate && (
        <div className="flex flex-col gap-2">
          {regenerationsRemaining > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="regenerate-instructions" className="text-xs font-medium text-muted-foreground">
                {t("creation.regenerateInstructionsLabel")}
              </label>
              <Textarea
                id="regenerate-instructions"
                rows={2}
                maxLength={300}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t("creation.regenerateInstructionsPlaceholder")}
              />
            </div>
          )}
          <Button
            variant="secondary"
            className="gap-1.5 self-start"
            onClick={() => onRegenerate(instructions.trim())}
            disabled={regenerating || regenerationsRemaining <= 0}
          >
            <RefreshCw className={regenerating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {regenerationsRemaining > 0
              ? t("creation.regenerate").replace("{count}", String(regenerationsRemaining))
              : t("creation.regenerateExhausted")}
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card px-4 py-3.5">
        <div className="mb-0.5 text-[11px] text-muted-foreground">{t("preview.resultText")}</div>
        <p className="text-[12.5px] leading-relaxed">{salesCopy}</p>
        {hashtags.length > 0 && (
          <p className="mt-2 text-[12px] text-primary">{hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {locked ? (
          <Button variant="accent" className="flex-1 gap-1.5" onClick={onUnlock} disabled={unlocking}>
            <Lock className="h-3.5 w-3.5" />
            {t("creation.unlockDownload").replace("{price}", String(tierPrice))}
          </Button>
        ) : (
          <Button variant="secondary" className="gap-1.5" asChild>
            <a href={imageUrl} download="affiche.jpg">
              <Download className="h-3.5 w-3.5" />
              {t("creation.download")}
            </a>
          </Button>
        )}
        <Button variant="secondary" className="flex-1" asChild>
          <Link href="/dashboard/creations">{t("creation.viewCreations")}</Link>
        </Button>
        {!locked && (
          <Button variant="accent" className="flex-1" onClick={onNewCreation}>
            {t("creation.newOne")}
          </Button>
        )}
      </div>
    </div>
  );
}
