"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  Download,
  Hash,
  ImageOff,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Type,
} from "lucide-react";
import { selectVariant, trackCopy } from "@/app/dashboard/studio/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ErrorNote } from "@/components/shop/shop-fields";
import { PlatformMock, type MockShop } from "@/components/studio/mockups";
import { OBJECTIVES, type StudioObjective } from "@/lib/studio/objectives";
import { PLATFORM_BY_KEY, PLATFORMS, type StudioPlatform } from "@/lib/studio/platforms";
import type { MarketingPack, MarketingPost, PostVariant } from "@/lib/studio/types";
import { STUDIO_TEXTS_REQUIRE_UNLOCK } from "@/lib/studio/access";
import { LimitDialog, limitReasonFrom, type LimitReason } from "@/components/billing/upgrade-card";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

export interface StudioProduct {
  id: string;
  name: string;
  priceLabel: string;
  thumbUrl: string | null;
  hasPhoto: boolean;
}

const GEN_STEPS = ["studio.step_facts", "studio.step_instagram", "studio.step_facebook", "studio.step_tiktok", "studio.step_status"];

export function StudioWorkspace({
  product,
  shop,
  initialPack,
}: {
  product: StudioProduct;
  shop: MockShop;
  initialPack: MarketingPack | null;
}) {
  const { t } = useLocale();
  const [formOpen, setFormOpen] = React.useState(!initialPack);
  const [hasPack, setHasPack] = React.useState(!!initialPack);

  return (
    <div className="mx-auto w-full max-w-5xl pb-24 sm:pb-6">
      <Link href="/dashboard/produits" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t("dashboard.nav_products")}
      </Link>

      {/* Produit source */}
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
          {product.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff className="h-5 w-5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{t("studio.sourceProduct")}</p>
          <p className="truncate font-semibold">{product.name}</p>
          <p className="text-sm text-muted-foreground">{product.priceLabel}</p>
        </div>
        {hasPack && !formOpen && (
          <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("studio.newContent")}</span>
          </Button>
        )}
      </div>

      {!product.hasPhoto && <ErrorNote message={t("studio.noPhoto")} className="mb-4" />}

      <StudioEditor
        source={{ productId: product.id }}
        shop={shop}
        initialPack={initialPack}
        formOpen={formOpen}
        onFormOpenChange={setFormOpen}
        onPackChange={(p) => setHasPack(!!p)}
      />
    </div>
  );
}

export type StudioSourceRef = { productId: string } | { creationId: string; versionId: string | null };

/**
 * Cœur du Studio (partagé) : formulaire objectif → génération → onglets plateformes + aperçus.
 * Source = une affiche (Studio principal) ou un produit (repli).
 */
export function StudioEditor({
  source,
  shop,
  initialPack,
  formOpen,
  onFormOpenChange,
  onPackChange,
  locked = false,
  signed = false,
  onUnlock,
  unlocking = false,
  unlockLabel,
  previewStamp = "",
  formTitle,
}: {
  source: StudioSourceRef;
  shop: MockShop;
  initialPack: MarketingPack | null;
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  onPackChange?: (pack: MarketingPack | null) => void;
  locked?: boolean; // affiche non débloquée : aperçus filigranés
  signed?: boolean; // visuels téléchargés signés « Créé avec Jaarle » (Gratuit ou affiche non débloquée)
  onUnlock?: () => void;
  unlocking?: boolean;
  unlockLabel?: string;
  previewStamp?: string; // change quand la version d'affiche change → recharge les aperçus
  formTitle?: string;
}) {
  const { t } = useLocale();
  const [pack, setPackState] = React.useState<MarketingPack | null>(initialPack);
  const [objective, setObjective] = React.useState<StudioObjective>(initialPack?.objective ?? "sell");
  const [promoDetail, setPromoDetail] = React.useState(initialPack?.promo_detail ?? "");
  const [extraFacts, setExtraFacts] = React.useState(initialPack?.extra_facts ?? "");
  const [generating, setGenerating] = React.useState(false);
  const [genStep, setGenStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<StudioPlatform>("instagram_feed");
  const [limitReason, setLimitReason] = React.useState<LimitReason | null>(null);
  const showForm = formOpen || !pack;

  function setPack(next: MarketingPack | null) {
    setPackState(next);
    onPackChange?.(next);
  }

  const canGenerate = !generating && (objective !== "promo" || promoDetail.trim().length > 0);

  async function generate() {
    setGenerating(true);
    setError(null);
    setGenStep(0);
    const timer = setInterval(() => setGenStep((s) => Math.min(s + 1, GEN_STEPS.length - 1)), 3500);
    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...source,
          objective,
          promoDetail: objective === "promo" ? promoDetail : null,
          extraFacts: extraFacts || null,
        }),
      });
      const data = (await res.json()) as { pack?: MarketingPack; error?: string; message?: string };
      const reason = limitReasonFrom(data);
      if (reason) {
        setLimitReason(reason);
        throw new Error(data.message || t("studio.errorGeneric"));
      }
      if (!res.ok || !data.pack) throw new Error(data.error || t("studio.errorGeneric"));
      setPack(data.pack);
      onFormOpenChange(false);
      setActive("instagram_feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("studio.errorGeneric"));
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  function updatePost(next: MarketingPost) {
    setPackState((p) => (p ? { ...p, marketing_posts: p.marketing_posts.map((x) => (x.id === next.id ? next : x)) } : p));
  }

  const activePost = pack?.marketing_posts.find((p) => p.platform === active) ?? null;

  return (
    <>
      {/* Objectif + génération */}
      {showForm && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-lg font-bold tracking-tight">{formTitle ?? t("studio.formTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("studio.formDesc")}</p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OBJECTIVES.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setObjective(o.key)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  objective === o.key ? "border-primary bg-accent" : "border-border hover:bg-muted"
                )}
              >
                <p className={cn("text-sm font-semibold", objective === o.key && "text-accent-foreground")}>{t(`studio.obj_${o.key}`)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(`studio.obj_${o.key}_hint`)}</p>
              </button>
            ))}
          </div>

          {objective === "promo" && (
            <div className="mt-4 flex flex-col gap-1.5">
              <label htmlFor="promo" className="text-sm font-medium">
                {t("studio.promoLabel")}
              </label>
              <Input
                id="promo"
                value={promoDetail}
                maxLength={160}
                onChange={(e) => setPromoDetail(e.target.value)}
                placeholder={t("studio.promoPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("studio.promoHint")}</p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="facts" className="text-sm font-medium">
              {t("studio.factsLabel")} <span className="font-normal text-muted-foreground">({t("shop.optional")})</span>
            </label>
            <Textarea
              id="facts"
              rows={2}
              maxLength={300}
              value={extraFacts}
              onChange={(e) => setExtraFacts(e.target.value)}
              placeholder={t("studio.factsPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("studio.factsHint")}</p>
          </div>

          <ErrorNote message={error} className="mt-4" />
          <LimitDialog reason={limitReason} onClose={() => setLimitReason(null)} />

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {pack && (
              <Button variant="secondary" size="lg" disabled={generating} onClick={() => onFormOpenChange(false)}>
                {t("studio.cancel")}
              </Button>
            )}
            <Button variant="accent" size="lg" disabled={!canGenerate} onClick={generate}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? t(GEN_STEPS[genStep]) : t("studio.generate")}
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground sm:text-right">{t("studio.aiNotice")}</p>
        </section>
      )}

      {/* Résultats */}
      {pack && !showForm && (
        <>
          <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActive(p.key)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  active === p.key ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
                )}
              >
                {p.shortLabel}
                <span className="ml-1.5 text-xs opacity-60">{p.format === "square" ? "1:1" : "9:16"}</span>
              </button>
            ))}
          </div>

          {activePost && (
            <PostPanel
              key={activePost.id}
              post={activePost}
              shop={shop}
              onUpdate={updatePost}
              locked={locked}
              signed={signed}
              onUnlock={onUnlock}
              unlocking={unlocking}
              unlockLabel={unlockLabel}
              previewStamp={previewStamp}
            />
          )}
        </>
      )}
    </>
  );
}

function variantText(v: PostVariant, mode: "caption" | "hashtags" | "all"): string {
  if (mode === "caption") return v.caption;
  if (mode === "hashtags") return v.hashtags.join(" ");
  const withCta = v.cta && !v.caption.toLowerCase().includes(v.cta.toLowerCase()) ? `${v.caption}\n\n${v.cta}` : v.caption;
  return [withCta, v.hashtags.join(" ")].filter(Boolean).join("\n\n");
}

function PostPanel({
  post,
  shop,
  onUpdate,
  locked,
  signed,
  onUnlock,
  unlocking,
  unlockLabel,
  previewStamp,
}: {
  post: MarketingPost;
  shop: MockShop;
  onUpdate: (p: MarketingPost) => void;
  locked: boolean;
  signed?: boolean;
  onUnlock?: () => void;
  unlocking: boolean;
  unlockLabel?: string;
  previewStamp: string;
}) {
  const { t } = useLocale();
  const spec = PLATFORM_BY_KEY[post.platform];
  const [index, setIndex] = React.useState(Math.min(post.selected_variant, Math.max(post.variants.length - 1, 0)));
  const [copied, setCopied] = React.useState<null | "caption" | "hashtags" | "all">(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const variant = post.variants[index] ?? post.variants[0];
  const stamp = encodeURIComponent(`${post.updated_at}${previewStamp}`);
  const textsLocked = locked && STUDIO_TEXTS_REQUIRE_UNLOCK;
  const previewUrl = `/api/studio/visual/${post.id}?v=${index}&t=${stamp}`;
  const downloadUrl = `/api/studio/visual/${post.id}?v=${index}&dl=1`;

  function choose(i: number) {
    setIndex(i);
    void selectVariant(post.id, i);
  }

  async function copy(mode: "caption" | "hashtags" | "all") {
    try {
      await navigator.clipboard.writeText(variantText(variant, mode));
      setCopied(mode);
      setTimeout(() => setCopied(null), 1800);
      void trackCopy(post.id);
    } catch {
      setError(t("studio.copyError"));
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/posts/${post.id}/regenerate`, { method: "POST" });
      const data = (await res.json()) as { post?: MarketingPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || t("studio.errorGeneric"));
      setIndex(0);
      onUpdate(data.post);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("studio.errorGeneric"));
    } finally {
      setRegenerating(false);
    }
  }

  if (!variant) return null;

  const CopyIcon = ({ mode }: { mode: "caption" | "hashtags" | "all" }) =>
    copied === mode ? <Check className="h-4 w-4 text-success" /> : mode === "hashtags" ? <Hash className="h-4 w-4" /> : mode === "caption" ? <Type className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-10">
      {/* Aperçu */}
      <div className="flex flex-col items-center">
        <div className={cn("relative w-full", regenerating && "pointer-events-none opacity-50")}>
          <div className="flex justify-center">
            <PlatformMock platform={post.platform} shop={shop} imageUrl={previewUrl} variant={variant} />
          </div>
          {regenerating && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </span>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">{t(locked ? "studio.previewNoticeLocked" : "studio.previewNotice")}</p>
      </div>

      {/* Détails + actions */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{spec.label}</h2>
            <p className="text-xs text-muted-foreground">
              {spec.format === "square" ? "1080 × 1080 px (1:1)" : "1080 × 1920 px (9:16)"}
            </p>
          </div>
          {post.variants.length > 1 && (
            <div className="inline-flex rounded-xl border border-border bg-muted p-1" role="group" aria-label={t("studio.variant")}>
              {post.variants.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => choose(i)}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", i === index ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                >
                  {t("studio.variant")} {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={cn("rounded-2xl border border-border bg-card p-4", textsLocked && "pointer-events-none select-none blur-[3px]")} aria-hidden={textsLocked || undefined}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {post.platform === "instagram_story" ? t("studio.overlayText") : t("studio.caption")}
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed">{variant.caption}</p>

          {variant.cta && (
            <>
              <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("studio.cta")}</p>
              <p className="text-sm font-medium">{variant.cta}</p>
            </>
          )}

          <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("studio.hashtags")}</p>
          {variant.hashtags.length > 0 ? (
            <p className="text-sm text-primary">{variant.hashtags.join(" ")}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("studio.noHashtags")}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button variant="accent" size="lg" className="col-span-2 sm:col-span-3" asChild>
            <a href={downloadUrl} download>
              <Download className="h-4 w-4" />
              {t("studio.download")}
            </a>
          </Button>
          {signed && (
            <div className="col-span-2 -mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground sm:col-span-3">
              <span>{t("studio.signedNotice")}</span>
              {onUnlock ? (
                <button type="button" onClick={onUnlock} disabled={unlocking} className="inline-flex items-center gap-1 font-semibold text-primary disabled:opacity-60">
                  {unlocking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                  {unlockLabel ?? t("studio.removeSignature")}
                </button>
              ) : (
                <Link href="/dashboard/abonnement" className="font-semibold text-primary">
                  {t("studio.removeSignature")}
                </Link>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={() => copy("all")} disabled={textsLocked}>
            <CopyIcon mode="all" />
            {t("studio.copyAll")}
          </Button>
          <Button variant="secondary" onClick={() => copy("caption")} disabled={textsLocked}>
            <CopyIcon mode="caption" />
            {t("studio.copyCaption")}
          </Button>
          <Button variant="secondary" onClick={() => copy("hashtags")} disabled={textsLocked || variant.hashtags.length === 0}>
            <CopyIcon mode="hashtags" />
            {t("studio.copyHashtags")}
          </Button>
          <Button variant="secondary" onClick={regenerate} disabled={regenerating}>
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("studio.regenerate")}
          </Button>
          {post.variants.length > 1 && (
            <Button variant="secondary" onClick={() => choose((index + 1) % post.variants.length)}>
              <Sparkles className="h-4 w-4" />
              {t("studio.nextVariant")}
            </Button>
          )}
        </div>
        <ErrorNote message={error} />

        <div className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">{t("studio.howToTitle")}</p>
          <p>{t(`studio.howTo_${post.platform}`)}</p>
        </div>
      </div>
    </div>
  );
}
