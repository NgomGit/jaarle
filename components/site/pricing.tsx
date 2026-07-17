"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

export function Pricing() {
  const { t } = useLocale();

  return (
    <section id="pricing" className="py-24">
      <div className="container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("pricing.title")}</h2>
          <p className="text-muted-foreground">{t("pricing.desc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PlanCard title={t("pricing.freeTitle")} amount="0" unit={t("pricing.freeUnit")}
            items={["3 créations / mois", "Filigrane Jaarle", "Format Facebook uniquement"]}
            ctaLabel={t("pricing.start")} variant="secondary" />

          <PlanCard title={t("pricing.simpleTitle")} amount="200" unit={t("pricing.simpleUnit")}
            items={["1 visuel, 1 format", "Sans filigrane", "Téléchargement HD"]}
            ctaLabel={t("pricing.choose")} variant="secondary" mono />

          <PlanCard title={t("pricing.campaignTitle")} amount="500" unit={t("pricing.campaignUnit")}
            items={["Image + texte Facebook, TikTok, Instagram, WhatsApp", "Hashtags inclus", "Version promo et version luxe"]}
            ctaLabel={t("pricing.choose")} variant="accent" mono featured tag={t("pricing.campaignTag")} />

          <PlanCard title={t("pricing.packTitle")} amount="1300" unit={t("pricing.packUnit")}
            items={["3 campagnes complètes", "Idéal pour un rythme hebdomadaire", "Valables 60 jours"]}
            ctaLabel={t("pricing.choose")} variant="secondary" mono />
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  title, amount, unit, items, ctaLabel, variant, mono, featured, tag,
}: {
  title: string; amount: string; unit: string; items: string[];
  ctaLabel: string; variant: "accent" | "secondary"; mono?: boolean; featured?: boolean; tag?: string;
}) {
  return (
    <Card className={cn("relative flex flex-col p-7", featured && "border-primary shadow-[0_20px_50px_-18px_hsl(var(--primary)/0.35)]")}>
      {tag && (
        <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-br from-primary to-secondary px-3 py-1 text-[11px] font-bold text-white">
          {tag}
        </span>
      )}
      <h4 className="mb-1.5 text-sm font-semibold text-muted-foreground">{title}</h4>
      <div className={cn("mb-1 text-3xl font-bold", mono && "font-mono")}>
        {amount}
        <sub className="ml-1 text-xs font-medium text-muted-foreground">FCFA</sub>
      </div>
      <div className="mb-5 text-xs text-muted-foreground">{unit}</div>
      <ul className="mb-6 flex-grow">
        {items.map((item, i) => (
          <li key={item} className={cn("flex gap-2.5 py-2 text-[13px] text-muted-foreground", i !== 0 && "border-t border-border")}>
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2} />
            {item}
          </li>
        ))}
      </ul>
      <Button variant={variant} className="w-full">{ctaLabel}</Button>
    </Card>
  );
}
