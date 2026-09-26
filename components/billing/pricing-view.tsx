"use client";

import Link from "next/link";
import { Check, Gift, MessageCircle } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { formatDateFr, formatFcfa } from "@/lib/billing/format";
import type { CreditPackRow, PlanRow, PublicPromotion } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

const JAARLE_WHATSAPP = "221771350203";
const STEPS = ["step1", "step2", "step3", "step4", "step5", "step6"] as const;
const FAQ = [1, 2, 3, 4] as const;

export function PricingView({
  plans,
  packs,
  promos,
  loggedIn,
}: {
  plans: PlanRow[];
  packs: CreditPackRow[];
  promos: PublicPromotion[];
  loggedIn: boolean;
}) {
  const { t } = useLocale();
  const planName = (key: string) => plans.find((p) => p.key === key)?.name ?? key;
  const ctaHref = (key: string) => (loggedIn ? (key === "free" ? "/dashboard" : "/dashboard/abonnement") : `/register${key === "free" ? "" : `?plan=${key}`}`);

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" aria-label="Jaarle">
          <Logo variant="image" />
        </Link>
        <Button variant="secondary" size="sm" asChild>
          <Link href={loggedIn ? "/dashboard" : "/login"}>{loggedIn ? t("tarifs.ctaDashboard") : t("tarifs.login")}</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-6 text-center sm:pt-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("tarifs.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">{t("tarifs.subtitle")}</p>
      </section>

      {/* Offre de lancement */}
      {promos.map((p) => (
        <section key={p.name} className="mx-auto mt-6 max-w-5xl px-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-accent p-4 text-accent-foreground sm:flex-row sm:items-center sm:p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-card text-primary">
              <Gift className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-wide">{t("tarifs.launchBadge")}</p>
              <p className="text-base font-bold">
                {t("tarifs.launchLine")
                  .replace("{plan}", planName(p.plan_key))
                  .replace("{price}", formatFcfa(p.promo_price_fcfa))
                  .replace("{months}", String(p.duration_periods))}
              </p>
              <p className="text-sm opacity-90">
                {[
                  p.code ? t("tarifs.launchCode").replace("{code}", p.code) : null,
                  p.spots_left != null ? t("tarifs.launchSpots").replace("{n}", String(p.spots_left)) : null,
                  p.ends_at ? t("tarifs.launchEnds").replace("{date}", formatDateFr(p.ends_at)) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button variant="accent" asChild>
              <Link href={loggedIn ? `/dashboard/abonnement${p.code ? `?code=${p.code}` : ""}` : `/register?plan=${p.plan_key}${p.code ? `&code=${p.code}` : ""}`}>
                {t("tarifs.ctaPro")}
              </Link>
            </Button>
          </div>
        </section>
      ))}

      {/* Offres */}
      <section className="mx-auto mt-6 grid max-w-5xl gap-4 px-4 md:grid-cols-3">
        {plans.length === 0 && <p className="text-center text-sm text-muted-foreground md:col-span-3">{t("tarifs.unavailable")}</p>}
        {plans.map((plan) => {
          const featured = plan.key === "pro";
          const soon = !plan.is_purchasable;
          return (
            <div
              key={plan.key}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-5 sm:p-6",
                featured ? "border-primary shadow-[0_20px_50px_-18px_hsl(var(--primary)/0.35)]" : "border-border"
              )}
            >
              {(featured || soon) && (
                <span
                  className={cn(
                    "absolute -top-3 left-5 rounded-full px-3 py-1 text-[11px] font-bold",
                    featured ? "bg-gradient-to-br from-primary to-secondary text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {featured ? t("tarifs.recommended") : t("tarifs.soon")}
                </span>
              )}
              <h2 className="text-lg font-bold">{plan.name}</h2>
              {plan.tagline && <p className="text-sm text-muted-foreground">{plan.tagline}</p>}
              <p className="mt-4 font-mono text-3xl font-bold">
                {formatFcfa(plan.price_fcfa)}
                {plan.price_fcfa > 0 && <span className="ml-1 font-sans text-sm font-medium text-muted-foreground">{t("tarifs.perMonth")}</span>}
              </p>
              <ul className="my-5 flex flex-1 flex-col gap-2.5">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {h}
                  </li>
                ))}
              </ul>
              {soon ? (
                <Button variant="secondary" className="w-full" asChild>
                  <a href={`https://wa.me/${JAARLE_WHATSAPP}?text=${encodeURIComponent(`Bonjour, Jaarle ${plan.name} m'intéresse.`)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    {t("tarifs.ctaSoon")}
                  </a>
                </Button>
              ) : (
                <Button variant={featured ? "accent" : "secondary"} className="w-full" asChild>
                  <Link href={ctaHref(plan.key)}>{plan.price_fcfa === 0 ? t("tarifs.ctaFree") : t("tarifs.ctaPro")}</Link>
                </Button>
              )}
            </div>
          );
        })}
      </section>

      {/* L'histoire en 6 étapes */}
      <section className="mx-auto mt-12 max-w-5xl px-4">
        <h2 className="mb-4 text-center text-xl font-bold">{t("tarifs.howTitle")}</h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-sm font-medium">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{i + 1}</span>
              {t(`tarifs.${s}`)}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-center text-sm font-semibold text-primary">{t("tarifs.stepThen")}</p>
      </section>

      {/* Crédits */}
      {packs.length > 0 && (
        <section className="mx-auto mt-12 max-w-5xl px-4">
          <h2 className="text-center text-xl font-bold">{t("tarifs.creditsTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted-foreground">{t("tarifs.creditsDesc")}</p>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {packs.map((p) => (
              <div key={p.key} className="rounded-2xl border border-border bg-card p-3 text-center sm:p-4">
                <p className="text-sm font-bold">{t("tarifs.creditsUnit").replace("{n}", String(p.credits))}</p>
                <p className="mt-1 font-mono text-sm text-muted-foreground">{formatFcfa(p.price_fcfa)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="mx-auto mt-12 max-w-2xl px-4">
        <h2 className="mb-4 text-center text-xl font-bold">{t("tarifs.faqTitle")}</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((n) => (
            <details key={n} className="group rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">{t(`tarifs.faq${n}q`)}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{t(`tarifs.faq${n}a`)}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
