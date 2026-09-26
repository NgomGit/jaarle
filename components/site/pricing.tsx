"use client";

import Link from "next/link";
import { Check, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { formatFcfa } from "@/lib/billing/format";
import type { PlanRow, PublicPromotion } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

// Résumé des offres sur la page d'accueil. Les prix, arguments et offres viennent de la base
// (tables plans / promotions) : rien n'est codé en dur. Le détail complet est sur /tarifs.
export function Pricing({ plans, promos }: { plans: PlanRow[]; promos: PublicPromotion[] }) {
  const { t } = useLocale();
  const promo = promos[0] ?? null;
  const promoPlan = promo ? plans.find((p) => p.key === promo.plan_key) : null;

  return (
    <section id="pricing" className="scroll-mt-20 pb-20 sm:pb-24">
      <div className="container">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("home.pricingTitle")}</h2>
          <p className="text-muted-foreground">{t("home.pricingDesc")}</p>
        </div>

        {promo && (
          <Link
            href="/tarifs"
            className="mx-auto mb-6 flex max-w-2xl items-center gap-3 rounded-2xl border border-primary/30 bg-accent/60 px-4 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent"
          >
            <Gift className="h-5 w-5 shrink-0" />
            {t("home.launch")
              .replace("{plan}", promoPlan?.name ?? "Pro")
              .replace("{price}", formatFcfa(promo.promo_price_fcfa))
              .replace("{months}", String(promo.duration_periods))}
          </Link>
        )}

        {plans.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const featured = plan.key === "pro";
              return (
                <div
                  key={plan.key}
                  className={cn(
                    "relative flex flex-col rounded-[22px] border bg-card p-6",
                    featured ? "border-primary shadow-[0_20px_50px_-18px_hsl(var(--primary)/0.35)]" : "border-border"
                  )}
                >
                  {featured && (
                    <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-br from-primary to-secondary px-3 py-1 text-[11px] font-bold text-white">
                      {t("tarifs.recommended")}
                    </span>
                  )}
                  {!plan.is_purchasable && (
                    <span className="absolute -top-3 left-6 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
                      {t("tarifs.soon")}
                    </span>
                  )}
                  <h3 className="text-base font-bold">{plan.name}</h3>
                  {plan.tagline && <p className="text-sm text-muted-foreground">{plan.tagline}</p>}
                  <p className="my-4 font-mono text-3xl font-bold">
                    {formatFcfa(plan.price_fcfa)}
                    {plan.price_fcfa > 0 && <span className="ml-1 font-sans text-sm font-medium text-muted-foreground">{t("tarifs.perMonth")}</span>}
                  </p>
                  <ul className="mb-6 flex flex-col gap-2 text-sm">
                    {plan.highlights.slice(0, 4).map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Button variant={featured ? "accent" : "secondary"} className="mt-auto w-full" asChild>
                    <Link href={plan.price_fcfa === 0 ? "/register" : "/tarifs"}>
                      {plan.price_fcfa === 0 ? t("tarifs.ctaFree") : plan.is_purchasable ? t("tarifs.ctaPro") : t("home.pricingMore")}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center">
          <Link href="/tarifs" className="text-sm font-semibold text-primary hover:underline">
            {t("home.pricingMore")} →
          </Link>
        </p>
      </div>
    </section>
  );
}
