"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Download, Lock, Share2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/locale-context";
import type { Creation, CreationVersion } from "@/lib/supabase/creations";
import { getTierConfig } from "@/lib/pricing";
import { PosterCarousel } from "@/components/dashboard/poster-carousel";

function formatHashtags(hashtags: string[]): string {
  return hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
}

export function CreationDetail({
  creation,
  versions = [],
  tierPrice,
}: {
  creation: Creation;
  versions?: CreationVersion[];
  tierPrice: number;
}) {
  const { t } = useLocale();
  const [unlocking, setUnlocking] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [copied, setCopied] = React.useState<"text" | "hashtags" | null>(null);
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  // Historique des versions : si la migration a peuplé creation_versions, on part de là ;
  // sinon repli sur les anciens champs (poster_path / poster_path_2) pour les vieilles créations.
  const initialItems: { url: string; kind?: string }[] =
    versions.length > 0
      ? versions.map((v) => ({ url: v.url, kind: v.kind }))
      : [
          ...(creation.photoUrl ? [{ url: creation.photoUrl, kind: "principale" }] : []),
          ...(creation.photoUrl2 ? [{ url: creation.photoUrl2, kind: "declinaison" }] : []),
        ];

  const [items, setItems] = React.useState<{ url: string; kind?: string }[]>(initialItems);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [focus, setFocus] = React.useState<number | undefined>(undefined);
  const [hasDeclination, setHasDeclination] = React.useState(
    versions.some((v) => v.kind === "declinaison") || !!creation.photoUrl2
  );
  const [generatingVariant, setGeneratingVariant] = React.useState(false);
  const [declinationInstructions, setDeclinationInstructions] = React.useState("");
  const [regenerating, setRegenerating] = React.useState(false);
  const [regenInstructions, setRegenInstructions] = React.useState("");
  const [regenRemaining, setRegenRemaining] = React.useState(
    Math.max(0, getTierConfig(creation.tier).maxRegenerations - (creation.regenerations_used ?? 0))
  );

  const images = items.map((it) => it.url);
  const currentUrl = images[currentIndex] ?? images[images.length - 1] ?? "";
  const canGenerateSecond = creation.tier === "gold" && !hasDeclination;

  function appendVersion(url: string, kind: string) {
    setFocus(items.length); // index de la nouvelle version (items.length AVANT ajout)
    setItems((prev) => [...prev, { url, kind }]);
  }

  async function generateSecondVariant() {
    if (generatingVariant) return;
    setGeneratingVariant(true);
    try {
      const res = await fetch(`/api/creations/${creation.id}/declination`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customInstructions: declinationInstructions.trim() || null }),
      });
      const data = (await res.json()) as { imageUrl2?: string; error?: string };
      if (res.ok && data.imageUrl2) {
        appendVersion(data.imageUrl2, "declinaison");
        setHasDeclination(true);
        setDeclinationInstructions("");
      }
    } catch {
      // silencieux : l'utilisateur peut réessayer
    } finally {
      setGeneratingVariant(false);
    }
  }

  async function regenerate() {
    if (regenerating || regenRemaining <= 0) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/regenerate-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creationId: creation.id, customInstructions: regenInstructions.trim() || null }),
      });
      const data = (await res.json()) as { imageUrl?: string; regenerationsRemaining?: number; error?: string };
      if (res.ok && data.imageUrl) {
        appendVersion(data.imageUrl, "regeneration");
        setRegenInstructions("");
        if (typeof data.regenerationsRemaining === "number") setRegenRemaining(data.regenerationsRemaining);
      }
    } catch {
      // silencieux : l'utilisateur peut réessayer
    } finally {
      setRegenerating(false);
    }
  }

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
    if (!currentUrl) return;
    setSharing(true);
    try {
      const res = await fetch(currentUrl);
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
        <div className="mb-4">
          <PosterCarousel
            images={images}
            alt={creation.product_name}
            locked={!creation.unlocked}
            focusIndex={focus}
            onIndexChange={setCurrentIndex}
            labelFor={images.length > 1 ? (i) => t("creation.variation").replace("{n}", String(i + 1)) : undefined}
          />
        </div>

        {regenRemaining > 0 && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-dashed border-border p-3.5">
            <label htmlFor="detail-regenerate-instructions" className="text-sm font-medium">
              {t("creation.regenerateInstructionsLabel")}
            </label>
            <Textarea
              id="detail-regenerate-instructions"
              rows={2}
              maxLength={300}
              value={regenInstructions}
              onChange={(e) => setRegenInstructions(e.target.value)}
              placeholder={t("creation.regenerateInstructionsPlaceholder")}
            />
            <Button variant="secondary" className="gap-1.5 self-start" onClick={regenerate} disabled={regenerating}>
              <RefreshCw className={regenerating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              {regenerating
                ? t("creation.declinationGenerating")
                : t("creation.regenerate").replace("{count}", String(regenRemaining))}
            </Button>
          </div>
        )}

        {canGenerateSecond && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-dashed border-border p-3.5">
            <span className="text-sm font-medium">{t("creation.declinationTitle")}</span>
            <span className="-mt-1 text-[11px] text-muted-foreground">{t("creation.declinationHint")}</span>
            <Textarea
              rows={2}
              maxLength={300}
              value={declinationInstructions}
              onChange={(e) => setDeclinationInstructions(e.target.value)}
              placeholder={t("creation.declinationPlaceholder")}
            />
            <Button
              variant="secondary"
              className="gap-1.5 self-start"
              onClick={generateSecondVariant}
              disabled={generatingVariant}
            >
              <RefreshCw className={generatingVariant ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              {generatingVariant ? t("creation.declinationGenerating") : t("creation.declinationButton")}
            </Button>
          </div>
        )}

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
              <Button variant="secondary" className="flex-1 gap-1.5" asChild>
                <a href={currentUrl || "#"} download={`affiche-${currentIndex + 1}.jpg`}>
                  <Download className="h-3.5 w-3.5" />
                  {images.length > 1
                    ? t("creation.downloadVariation").replace("{n}", String(currentIndex + 1))
                    : t("creation.download")}
                </a>
              </Button>
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground">{t("creation.shareWhatsappHint")}</p>
          </>
        )}
      </div>
    </div>
  );
}
