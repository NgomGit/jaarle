"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/locale-context";
import { PosterCarousel } from "@/components/dashboard/poster-carousel";

export function CreationResult({
  imageUrl,
  imageUrl2,
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
  unlockLabel,
  regenerationsRemaining = 0,
  regenerating = false,
  onRegenerate,
  moreImages,
}: {
  imageUrl: string;
  imageUrl2?: string | null;
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
  unlockLabel?: string; // Jaarle 2.0 : libellé sans prix à l'unité
  regenerationsRemaining?: number;
  regenerating?: boolean;
  onRegenerate?: (instructions: string) => void;
  /** Nouvelles versions générées depuis cet écran (ajoutées au carrousel, la plus récente en focus). */
  moreImages?: string[];
}) {
  const { t } = useLocale();
  const [instructions, setInstructions] = React.useState("");
  const images = [imageUrl, imageUrl2, ...(moreImages ?? [])].filter((u): u is string => !!u);

  return (
    <div className="flex flex-col gap-4">
      <PosterCarousel
        images={images}
        alt={productName}
        locked={locked}
        focusIndex={images.length > 1 ? images.length - 1 : undefined}
        labelFor={(i) =>
          images.length > 1
            ? t("creation.variation").replace("{n}", String(i + 1))
            : imageFallback
              ? t("creation.imageFallbackLabel")
              : t("creation.aiLabel")
        }
        firstSlideOverlay={
          !posterReady ? (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <div className="flex items-end justify-between">
                <span className="text-sm font-bold text-white">{productName}</span>
                <span className="font-mono text-sm font-bold text-white">
                  {formattedPrice ? `${formattedPrice} FCFA` : t("creation.priceOnRequestLabel")}
                </span>
              </div>
            </div>
          ) : undefined
        }
      />

      {imageFallback && <p className="text-xs text-muted-foreground">{t("creation.imageFallbackNote")}</p>}

      {locked && onRegenerate && (
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
              <span className="text-[11px] text-muted-foreground">{t("creation.newVersionHint")}</span>
            </div>
          )}
          <Button
            variant="secondary"
            className="gap-1.5 self-start"
            onClick={() => {
              onRegenerate(instructions.trim());
              setInstructions("");
            }}
            disabled={regenerating || regenerationsRemaining <= 0}
          >
            <RefreshCw className={regenerating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {regenerating
              ? t("creation.declinationGenerating")
              : regenerationsRemaining > 0
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
            {unlockLabel ?? t("creation.unlockDownload").replace("{price}", String(tierPrice))}
          </Button>
        ) : (
          <>
            <Button variant="secondary" className="gap-1.5" asChild>
              <a href={imageUrl} download={images.length > 1 ? "affiche-1.jpg" : "affiche.jpg"}>
                <Download className="h-3.5 w-3.5" />
                {images.length > 1 ? t("creation.downloadVariation").replace("{n}", "1") : t("creation.download")}
              </a>
            </Button>
            {imageUrl2 && (
              <Button variant="secondary" className="gap-1.5" asChild>
                <a href={imageUrl2} download="affiche-2.jpg">
                  <Download className="h-3.5 w-3.5" />
                  {t("creation.downloadVariation").replace("{n}", "2")}
                </a>
              </Button>
            )}
          </>
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
