"use client";

import Link from "next/link";
import { ArrowRight, Check, Eye, Image as ImageIcon, Megaphone, MessageCircle, Package, Phone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";
import type { Creation } from "@/lib/supabase/creations";
import { ShopBanner, type ShopBannerInfo } from "@/components/dashboard/shop-banner";

export interface HomeValue {
  visitors7d: number;
  whatsapp7d: number;
  calls7d: number;
  products: number;
  posters: number;
  contents: number;
  remaining: number | null;
  monthly: number | null;
  credits: number;
}

export interface HomeJourney {
  shop: boolean;
  products: boolean;
  poster: boolean;
  content: boolean;
  shared: boolean;
  contact: boolean;
}

const JOURNEY: { key: keyof HomeJourney; href: string }[] = [
  { key: "shop", href: "/dashboard/boutique" },
  { key: "products", href: "/dashboard/produits/nouveau" },
  { key: "poster", href: "/dashboard/new" },
  { key: "content", href: "/dashboard/studio" },
  { key: "shared", href: "/dashboard/boutique" },
  { key: "contact", href: "/dashboard/statistiques" },
];

export function DashboardHome({
  displayName,
  recentCreations,
  shop,
  value,
  journey,
  plan,
}: {
  displayName: string;
  recentCreations: Creation[];
  shop?: ShopBannerInfo | null;
  value: HomeValue;
  journey: HomeJourney;
  plan: { isFree: boolean; name: string } | null;
}) {
  const { t } = useLocale();
  const doneCount = JOURNEY.filter((s) => journey[s.key]).length;
  const nextStep = JOURNEY.find((s) => !journey[s.key]);

  return (
    <div className="mx-auto w-full max-w-4xl pb-24 md:pb-6">
      <h1 className="mb-5 text-lg font-bold">
        {t("dashboard.welcomeBack")}, {displayName}
      </h1>

      {shop !== undefined && <ShopBanner shop={shop} />}

      {/* Le parcours du commerçant : de la boutique gratuite aux premiers clients WhatsApp. */}
      {doneCount < JOURNEY.length && (
        <section className="mb-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t("journey.title")}</h2>
            <span className="text-xs font-medium text-muted-foreground">
              {doneCount} / {JOURNEY.length}
            </span>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2">
            {JOURNEY.map((s, i) => {
              const done = journey[s.key];
              const isNext = nextStep?.key === s.key;
              return (
                <li key={s.key}>
                  <Link
                    href={s.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                      isNext ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
                      done && "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        done ? "bg-success/15 text-success" : isNext ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={cn("flex-1", done && "line-through decoration-muted-foreground/40")}>{t(`journey.step_${s.key}`)}</span>
                    {isNext && <ArrowRight className="h-4 w-4 text-primary" />}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Valeur : ce que la boutique rapporte, ce que Jaarle a produit. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("billing.valueShop")}</h2>
            {shop && (
              <Link href="/dashboard/statistiques" className="text-xs font-semibold text-primary">
                {t("dashboard.nav_stats")} →
              </Link>
            )}
          </div>
          {shop ? (
            <div className="grid grid-cols-3 gap-2">
              <Metric icon={Eye} value={value.visitors7d} label={t("billing.valueVisitors")} />
              <Metric icon={Package} value={value.products} label={t("billing.valueProducts")} />
              <Metric
                icon={MessageCircle}
                value={value.whatsapp7d}
                label={t("billing.valueWhatsapp")}
                hint={value.calls7d > 0 ? `+ ${value.calls7d} ${t("journey.calls")}` : undefined}
                highlight
              />
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">{t("billing.noShopYet")}</p>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/dashboard/boutique">{t("billing.createShop")}</Link>
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("billing.valueMarketing")}</h2>
            <Link href="/dashboard/studio" className="text-xs font-semibold text-primary">
              {t("studio.title")} →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric icon={ImageIcon} value={value.posters} label={t("billing.valuePosters")} />
            <Metric icon={Megaphone} value={value.contents} label={t("billing.valueContents")} />
            <Metric
              icon={Sparkles}
              value={value.monthly == null ? "∞" : `${value.remaining ?? 0}/${value.monthly}`}
              label={t("billing.valueRemaining")}
              hint={value.credits > 0 ? t("billing.sidebarCredits").replace("{count}", String(value.credits)) : undefined}
            />
          </div>
        </section>
      </div>

      {plan?.isFree && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-muted/60 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-semibold">{t("billing.freeBannerTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("billing.freeBannerDesc")}</p>
          </div>
          <Button variant="secondary" className="shrink-0 border-primary/30 text-primary" asChild>
            <Link href="/dashboard/abonnement">{t("billing.freeBannerCta")}</Link>
          </Button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold text-muted-foreground">{t("dashboard.recent")}</h2>
        {recentCreations.length > 0 && (
          <Link href="/dashboard/studio" className="text-[12.5px] font-semibold text-primary hover:underline">
            {t("dashboard.seeStudio")}
          </Link>
        )}
      </div>

      {recentCreations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="mb-1 text-sm font-semibold">{t("dashboard.emptyTitle")}</p>
          <p className="mb-4 max-w-xs text-sm text-muted-foreground">{t("dashboard.emptyDesc")}</p>
          <Button variant="accent" asChild>
            <Link href="/dashboard/new">{t("dashboard.emptyCta")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {recentCreations.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/creations/${c.id}`}
              className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted"
            >
              {c.photoUrl && <img src={c.photoUrl} alt={c.product_name} className="h-full w-full object-cover" />}
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2">
                <span className="text-[10px] font-semibold text-white">{c.product_name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
  hint,
  highlight,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-xl p-2.5", highlight ? "bg-success/10" : "bg-muted/60")}>
      <Icon className={cn("mb-1.5 h-3.5 w-3.5", highlight ? "text-success" : "text-muted-foreground")} strokeWidth={1.75} />
      <p className="text-lg font-bold tabular-nums leading-tight">{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">{hint}</p>}
    </div>
  );
}
