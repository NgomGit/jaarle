"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Download, Lock, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";
import type { Creation } from "@/lib/supabase/creations";

function formatHashtags(hashtags: string[]): string {
  return hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
}

export function CreationDetail({ creation, tierPrice }: { creation: Creation; tierPrice: number }) {
  const { t } = useLocale();
  const [unlocking, setUnlocking] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [copied, setCopied] = React.useState<"text" | "hashtags" | null>(null);
  const [canNativeShare, setCanNativeShare] = React.useState(false);

  const salesCopy = creation.generated_copy ?? "";
  const hashtagsLine = creation.generated_hashtags?.length ? formatHashtags(creation.generated_hashtags) : "";
  const fullCaption = [salesCopy, hashtagsLine].filter(Boolean).join("\n\n");

  React.useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  async function copy(value: string, which: "text" | "hashtags") {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // presse-papiers indisponible (permissions navigateur) — pas grave, l'utilisateur peut sélectionner le texte manuellement.
    }
  }

  async function unlock() {
    setUnlocking(true);
    try {
      const res = await fetch("/api/paytech/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creationId: creation.id }),
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) throw new Error(data.error);
      window.location.href = data.redirectUrl;
    } catch {
      setUnlocking(false);
    }
  }

  async function share() {
    if (!creation.photoUrl) return;
    setSharing(true);
    try {
      const res = await fetch(creation.photoUrl);
      const blob = await res.blob();
      const file = new File([blob], "affiche.jpg", { type: "image/jpeg" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: fullCaption, title: creation.product_name });
      } else {
        await navigator.share({ text: fullCaption, title: creation.product_name });
      }
    } catch {
      // annulé par l'utilisateur ou non supporté — silencieux.
    } finally {
      setSharing(false);
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(fullCaption)}`;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard/creations" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("creation.detailBack")}
      </Link>

      <div className="rounded-[20px] border border-border bg-card p-6">
        <div className={cn("mb-4 grid gap-3", creation.photoUrl2 ? "grid-cols-2" : "grid-cols-1")}>
          {[creation.photoUrl, creation.photoUrl2].filter(Boolean).map((url, i) => (
            <div key={url} className="relative overflow-hidden rounded-2xl border border-border">
              <img
                src={url!}
                alt={creation.product_name}
                className="max-h-[420px] w-full select-none object-contain bg-muted [-webkit-touch-callout:none]"
                draggable={creation.unlocked ? undefined : false}
                onContextMenu={creation.unlocked ? undefined : (e) => e.preventDefault()}
                onDragStart={creation.unlocked ? undefined : (e) => e.preventDefault()}
              />
              {creation.photoUrl2 && (
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {t("creation.variation").replace("{n}", String(i + 1))}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">{creation.product_name}</h1>
          <span className="font-mono text-sm font-bold text-primary">
            {creation.price != null ? `${creation.price.toLocaleString("fr-FR")} FCFA` : t("creation.priceOnRequestLabel")}
          </span>
        </div>

        {!creation.unlocked ? (
          <Button variant="accent" className="w-full gap-1.5" onClick={unlock} disabled={unlocking}>
            <Lock className="h-3.5 w-3.5" />
            {t("creation.unlockDownload").replace("{price}", String(tierPrice))}
          </Button>
        ) : (
          <>
            <div className="mb-3 rounded-xl border border-border bg-muted px-4 py-3.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t("preview.resultText")}</span>
                <button
                  onClick={() => copy(salesCopy, "text")}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary"
                >
                  {copied === "text" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied === "text" ? t("creation.copied") : t("creation.copyText")}
                </button>
              </div>
              <p className="text-[13px] leading-relaxed">{salesCopy}</p>
            </div>

            {hashtagsLine && (
              <div className="mb-4 rounded-xl border border-border bg-muted px-4 py-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{t("creation.hashtagsLabel")}</span>
                  <button
                    onClick={() => copy(hashtagsLine, "hashtags")}
                    className="flex items-center gap-1 text-[11px] font-semibold text-primary"
                  >
                    {copied === "hashtags" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === "hashtags" ? t("creation.copied") : t("creation.copyHashtags")}
                  </button>
                </div>
                <p className="text-[13px] text-primary">{hashtagsLine}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2.5">
              {canNativeShare && (
                <Button variant="accent" className="flex-1 gap-1.5" onClick={share} disabled={sharing}>
                  <Share2 className="h-3.5 w-3.5" />
                  {t("creation.share")}
                </Button>
              )}
              <Button variant="secondary" className="flex-1 gap-1.5" asChild>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  {t("creation.shareWhatsapp")}
                </a>
              </Button>
              <Button variant="secondary" className="gap-1.5" asChild>
                <a href={creation.photoUrl ?? "#"} download={creation.photoUrl2 ? "affiche-1.jpg" : "affiche.jpg"}>
                  <Download className="h-3.5 w-3.5" />
                  {creation.photoUrl2 ? t("creation.downloadVariation").replace("{n}", "1") : t("creation.download")}
                </a>
              </Button>
              {creation.photoUrl2 && (
                <Button variant="secondary" className="gap-1.5" asChild>
                  <a href={creation.photoUrl2} download="affiche-2.jpg">
                    <Download className="h-3.5 w-3.5" />
                    {t("creation.downloadVariation").replace("{n}", "2")}
                  </a>
                </Button>
              )}
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground">{t("creation.shareWhatsappHint")}</p>
          </>
        )}
      </div>
    </div>
  );
}
