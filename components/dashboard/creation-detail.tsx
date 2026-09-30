"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  Lock,
  Megaphone,
  RefreshCw,
  Share2,
  ShieldCheck,
  Wand2,
  Type,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/locale-context";
import type { Creation, CreationVersion } from "@/lib/supabase/creations";
import { getTierConfig } from "@/lib/pricing";
import { PosterCarousel } from "@/components/dashboard/poster-carousel";
import { CreationStudio } from "@/components/studio/creation-studio";
import type { MockShop } from "@/components/studio/mockups";
import type { MarketingPack } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

function formatHashtags(hashtags: string[]): string {
  return hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
}

type Item = { url: string; kind?: string; versionId: string | null };

/**
 * Page d'une affiche. Structure (mobile d'abord) :
 *  1. en-tête : nom, prix, statut ;
 *  2. l'affiche (carrousel des versions) — la version affichée est celle téléchargée ET publiée ;
 *  3. l'action principale : débloquer (avant paiement) ou télécharger / partager (après) ;
 *  4. sections repliables : retoucher l'affiche, texte de vente ;
 *  5. Studio « Publier sur mes réseaux » (réservé aux affiches débloquées).
 * Toute la logique existante (régénération, déclinaison Gold, déblocage, partage, réconciliation
 * avec le serveur) est conservée à l'identique.
 */
export function CreationDetail({
  creation,
  versions = [],
  tierPrice,
  studioPack = null,
  studioShop,
  unlockOptions,
}: {
  creation: Creation;
  versions?: CreationVersion[];
  tierPrice: number;
  studioPack?: MarketingPack | null;
  studioShop?: MockShop;
  /** Jaarle 2.0 : déblocage sans paiement à l'unité (quota de l'abonnement ou crédits). */
  unlockOptions?: { withPlan: boolean; withCredits: boolean; units: number; showProHint: boolean };
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [unlocking, setUnlocking] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [copied, setCopied] = React.useState<"text" | "hashtags" | null>(null);
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  // Historique des versions : si la migration a peuplé creation_versions, on part de là ;
  // sinon repli sur les anciens champs (poster_path / poster_path_2) pour les vieilles créations.
  const toItems = (vs: CreationVersion[]): Item[] => vs.map((v) => ({ url: v.url, kind: v.kind, versionId: v.id }));
  const initialItems: Item[] =
    versions.length > 0
      ? toItems(versions)
      : [
          ...(creation.photoUrl ? [{ url: creation.photoUrl, kind: "principale", versionId: null }] : []),
          ...(creation.photoUrl2 ? [{ url: creation.photoUrl2, kind: "declinaison", versionId: null }] : []),
        ];

  const [items, setItems] = React.useState<Item[]>(initialItems);
  // On ouvre sur la version déjà utilisée par le Studio, sinon sur la première.
  const initialIndex = Math.max(
    0,
    initialItems.findIndex((it) => it.versionId && it.versionId === studioPack?.creation_version_id)
  );
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const [focus, setFocus] = React.useState<number | undefined>(initialIndex > 0 ? initialIndex : undefined);
  const [regenerating, setRegenerating] = React.useState(false);
  const [regenInstructions, setRegenInstructions] = React.useState("");
  const [regenRemaining, setRegenRemaining] = React.useState(
    Math.max(0, getTierConfig(creation.tier).maxRegenerations - (creation.regenerations_used ?? 0))
  );

  const images = items.map((it) => it.url);
  const safeIndex = Math.min(currentIndex, Math.max(items.length - 1, 0));
  const currentUrl = images[safeIndex] ?? images[images.length - 1] ?? "";
  const currentVersionId = items[safeIndex]?.versionId ?? null;
  // Une seule action de retouche (« Nouvelle version ») : l'ancienne déclinaison séparée a été retirée.
  const canRetouch = regenRemaining > 0;
  const locked = !creation.unlocked;

  function appendVersion(url: string, kind: string) {
    setFocus(items.length); // index de la nouvelle version (items.length AVANT ajout)
    setItems((prev) => [...prev, { url, kind, versionId: null }]);
  }

  // Réconciliation avec le serveur : quand `versions` change (après router.refresh, ou parce que
  // la génération a abouti côté serveur même si la réponse client s'est perdue sur une connexion
  // lente), on resynchronise le carrousel sur la vérité serveur — plus besoin d'actualiser à la main.
  const prevVersionsLen = React.useRef(versions.length);
  React.useEffect(() => {
    if (versions.length > 0) {
      setItems(toItems(versions));
    }
    if (versions.length > prevVersionsLen.current) setFocus(versions.length - 1);
    prevVersionsLen.current = versions.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

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
      router.refresh(); // recharge la vérité serveur (versions) même si la réponse s'est perdue
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

  const [unlockingAlt, setUnlockingAlt] = React.useState(false);
  const [unlockError, setUnlockError] = React.useState<string | null>(null);
  async function unlockWithBalance() {
    setUnlockingAlt(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/billing/unlock-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creationId: creation.id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message || data.error || t("creation.errorGeneric"));
      router.refresh();
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : t("creation.errorGeneric"));
      setUnlockingAlt(false);
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
  const priceLabel = creation.price != null ? `${creation.price.toLocaleString("fr-FR")} FCFA` : t("creation.priceOnRequestLabel");
  const payLabel = t("creation.unlockDownload").replace("{price}", tierPrice.toLocaleString("fr-FR"));

  return (
    <div className="mx-auto w-full max-w-5xl pb-28 md:pb-8">
      <Link href="/dashboard/studio" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("creation.detailBack")}
      </Link>

      {/* 1. En-tête */}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{creation.product_name}</h1>
          <p className="mt-0.5 font-mono text-sm font-bold text-primary">{priceLabel}</p>
        </div>
        {locked ? (
          <Badge variant="warning" className="shrink-0">
            <Lock className="h-3 w-3" /> {t("creation.statusPreview")}
          </Badge>
        ) : (
          <Badge variant="success" className="shrink-0">
            <Check className="h-3 w-3" /> {t("creation.statusUnlocked")}
          </Badge>
        )}
      </header>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[minmax(0,460px)_1fr]">
        {/* 2. Affiche */}
        <div className="md:sticky md:top-6">
          <PosterCarousel
            images={images}
            alt={creation.product_name}
            locked={locked}
            focusIndex={focus}
            onIndexChange={setCurrentIndex}
            download={
              locked
                ? undefined
                : {
                    hrefFor: (i) => images[i] ?? "#",
                    fileNameFor: (i) => `affiche-${i + 1}.jpg`,
                    label: t("creation.download"),
                  }
            }
            labelFor={images.length > 1 ? (i) => t("creation.variation").replace("{n}", String(i + 1)) : undefined}
          />
          {images.length > 1 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t("creation.versionHint").replace("{n}", String(safeIndex + 1)).replace("{count}", String(images.length))}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* 3. Action principale */}
          {locked && unlockOptions ? (
            // Jaarle 2.0 (abonnement / crédits) : plus de prix à l'unité affiché. L'affiche est déjà
            // utilisable avec le logo Jaarle ; on explique comment le retirer.
            <div className="rounded-2xl border border-primary/25 bg-card p-5 shadow-sm">
              <p className="text-base font-bold">{t("billing.removeLogoTitle")}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("billing.removeLogoDesc")}</p>
              <ul className="my-4 flex flex-col gap-2 text-sm">
                {["removeLogoPerk1", "removeLogoPerk2", "removeLogoPerk3"].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                      <Check className="h-3 w-3" />
                    </span>
                    {t(`billing.${k}`)}
                  </li>
                ))}
              </ul>
              {unlockOptions.withPlan || unlockOptions.withCredits ? (
                <Button variant="accent" size="lg" className="w-full gap-1.5" onClick={unlockWithBalance} disabled={unlockingAlt}>
                  {unlockingAlt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {(unlockOptions.withPlan ? t("billing.unlockWithPlan") : t("billing.unlockWithCredits")).replace("{units}", String(unlockOptions.units))}
                </Button>
              ) : (
                <Button variant="accent" size="lg" className="w-full gap-1.5" asChild>
                  <Link href="/dashboard/abonnement">
                    <Lock className="h-4 w-4" />
                    {t("billing.goPro")}
                  </Link>
                </Button>
              )}
              {unlockError && <p className="mt-2 text-center text-xs text-destructive">{unlockError}</p>}
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                {unlockOptions.showProHint && (unlockOptions.withPlan || unlockOptions.withCredits) ? (
                  <Button variant="secondary" className="gap-1.5" asChild>
                    <Link href="/dashboard/abonnement">{t("billing.goPro")}</Link>
                  </Button>
                ) : (
                  <Button variant="secondary" className="gap-1.5" asChild>
                    <Link href="/dashboard/abonnement#credits">{t("billing.buyCredits")}</Link>
                  </Button>
                )}
                <Button variant="secondary" className="gap-1.5" asChild>
                  <a href="#reseaux">
                    <Megaphone className="h-3.5 w-3.5" />
                    {t("studio.publishShort")}
                  </a>
                </Button>
              </div>
              <p className="mt-2.5 text-center text-[11px] text-muted-foreground">{t("billing.removeLogoHint")}</p>
            </div>
          ) : locked ? (
            <div className="rounded-2xl border border-primary/25 bg-card p-5 shadow-sm">
              <p className="text-base font-bold">{t("creation.unlockTitle")}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("creation.unlockDesc")}</p>
              <ul className="my-4 flex flex-col gap-2 text-sm">
                {["unlockPerk1", "unlockPerk2", "unlockPerk3"].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                      <Check className="h-3 w-3" />
                    </span>
                    {t(`creation.${k}`)}
                  </li>
                ))}
              </ul>
              <Button variant="accent" size="lg" className="w-full gap-1.5" onClick={unlock} disabled={unlocking}>
                {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {payLabel}
              </Button>
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> {t("creation.unlockSecure")}
              </p>
              {unlockOptions && (unlockOptions.withPlan || unlockOptions.withCredits) && (
                <>
                  <p className="my-2 text-center text-xs text-muted-foreground">{t("billing.unlockOr")}</p>
                  <Button variant="secondary" size="lg" className="w-full gap-1.5" onClick={unlockWithBalance} disabled={unlockingAlt}>
                    {unlockingAlt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {(unlockOptions.withPlan ? t("billing.unlockWithPlan") : t("billing.unlockWithCredits")).replace(
                      "{units}",
                      String(unlockOptions.units)
                    )}
                  </Button>
                  {unlockError && <p className="mt-2 text-center text-xs text-destructive">{unlockError}</p>}
                </>
              )}
              {unlockOptions?.showProHint && (
                <p className="mt-3 border-t border-border pt-3 text-center text-xs text-muted-foreground">
                  {t("billing.unlockProHint")}{" "}
                  <Link href="/dashboard/abonnement" className="font-semibold text-primary">
                    {t("billing.seePlans")}
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-base font-bold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {t("creation.readyTitle")}
              </p>
              <Button variant="accent" size="lg" className="w-full gap-1.5" asChild>
                <a href={currentUrl || "#"} download={`affiche-${safeIndex + 1}.jpg`}>
                  <Download className="h-4 w-4" />
                  {images.length > 1
                    ? t("creation.downloadVariation").replace("{n}", String(safeIndex + 1))
                    : t("creation.download")}
                </a>
              </Button>
              <div className={cn("mt-2.5 grid gap-2.5", canNativeShare ? "grid-cols-2" : "grid-cols-1")}>
                {canNativeShare && (
                  <Button variant="secondary" className="gap-1.5" onClick={share} disabled={sharing}>
                    <Share2 className="h-3.5 w-3.5" />
                    {t("creation.share")}
                  </Button>
                )}
                <Button variant="secondary" className="gap-1.5" asChild>
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    {t("creation.shareWhatsapp")}
                  </a>
                </Button>
              </div>
              <p className="mt-2.5 text-[11px] text-muted-foreground">{t("creation.shareWhatsappHint")}</p>
              <Button variant="secondary" className="mt-3 w-full gap-1.5 border-primary/30 text-primary" asChild>
                <a href="#reseaux">
                  <Megaphone className="h-4 w-4" />
                  {t("studio.publishOnNetworks")}
                </a>
              </Button>
            </div>
          )}

          {/* 4a. Retoucher l'affiche : une seule action, « Nouvelle version » */}
          {canRetouch && (
            <Collapsible icon={Wand2} title={t("creation.retouchTitle")} subtitle={t("creation.retouchSubtitle").replace("{count}", String(regenRemaining))}>
              {regenRemaining > 0 && (
                <div className="flex flex-col gap-2">
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
                  <span className="-mt-1 text-[11px] text-muted-foreground">{t("creation.newVersionHint")}</span>
                  <Button variant="secondary" className="gap-1.5 sm:self-start" onClick={regenerate} disabled={regenerating}>
                    <RefreshCw className={regenerating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                    {regenerating
                      ? t("creation.declinationGenerating")
                      : t("creation.regenerate").replace("{count}", String(regenRemaining))}
                  </Button>
                </div>
              )}

            </Collapsible>
          )}

          {/* 4b. Texte de vente (après paiement, comme avant) */}
          {!locked && (salesCopy || hashtagsLine) && (
            <Collapsible icon={Type} title={t("preview.resultText")} subtitle={t("creation.salesCopySubtitle")}>
              {salesCopy && (
                <div className="rounded-xl bg-muted px-4 py-3.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{t("preview.resultText")}</span>
                    <CopyButton copied={copied === "text"} onClick={() => copy(salesCopy, "text")} label={t("creation.copyText")} doneLabel={t("creation.copied")} />
                  </div>
                  <p className="whitespace-pre-line text-[13px] leading-relaxed">{salesCopy}</p>
                </div>
              )}
              {hashtagsLine && (
                <div className="mt-2.5 rounded-xl bg-muted px-4 py-3.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{t("creation.hashtagsLabel")}</span>
                    <CopyButton copied={copied === "hashtags"} onClick={() => copy(hashtagsLine, "hashtags")} label={t("creation.copyHashtags")} doneLabel={t("creation.copied")} />
                  </div>
                  <p className="text-[13px] text-primary">{hashtagsLine}</p>
                </div>
              )}
            </Collapsible>
          )}
        </div>
      </div>

      {/* 5. Studio : publier sur mes réseaux */}
      {studioShop && (
        <div className="mt-10 border-t border-border pt-8">
          <CreationStudio
            creationId={creation.id}
            versionId={currentVersionId}
            initialPack={studioPack}
            locked={locked}
            shop={studioShop}
          />
        </div>
      )}
    </div>
  );
}

function Collapsible({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function CopyButton({ copied, onClick, label, doneLabel }: { copied: boolean; onClick: () => void; label: string; doneLabel: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[11px] font-semibold text-primary">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? doneLabel : label}
    </button>
  );
}
