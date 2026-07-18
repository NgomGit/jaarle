"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

export function CreationResult({
  imageUrl,
  imageFallback,
  productName,
  formattedPrice,
  salesCopy,
  hashtags,
  onNewCreation,
}: {
  imageUrl: string;
  imageFallback: boolean;
  productName: string;
  formattedPrice: string;
  salesCopy: string | null;
  hashtags: string[];
  onNewCreation: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <img src={imageUrl} alt={productName} className="max-h-[360px] w-full object-contain bg-muted" />
        <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-primary shadow-glow-sm">
          {imageFallback ? t("creation.imageFallbackLabel") : t("creation.aiLabel")}
        </span>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <div className="flex items-end justify-between">
            <span className="text-sm font-bold text-white">{productName}</span>
            <span className="font-mono text-sm font-bold text-white">{formattedPrice} FCFA</span>
          </div>
        </div>
      </div>

      {imageFallback && <p className="text-xs text-muted-foreground">{t("creation.imageFallbackNote")}</p>}

      <div className="rounded-xl border border-border bg-card px-4 py-3.5">
        <div className="mb-0.5 text-[11px] text-muted-foreground">{t("preview.resultText")}</div>
        <p className="text-[12.5px] leading-relaxed">{salesCopy}</p>
        {hashtags.length > 0 && (
          <p className="mt-2 text-[12px] text-primary">{hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" className="gap-1.5" asChild>
          <a href={imageUrl} download="affiche.png">
            <Download className="h-3.5 w-3.5" />
            {t("creation.download")}
          </a>
        </Button>
        <Button variant="secondary" className="flex-1" asChild>
          <Link href="/dashboard/creations">{t("creation.viewCreations")}</Link>
        </Button>
        <Button variant="accent" className="flex-1" onClick={onNewCreation}>
          {t("creation.newOne")}
        </Button>
      </div>
    </div>
  );
}
