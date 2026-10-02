"use client";

import { Package, Share2, Store } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

// Comment ça marche, en 3 étapes : Créer → Ajouter ses produits → Partager et vendre.
const STEPS = [
  { icon: Store, key: "step1" },
  { icon: Package, key: "step2" },
  { icon: Share2, key: "step3" },
];

export function HowItWorks() {
  const { t } = useLocale();
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-24">
      <div className="container">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("home.stepsTitle")}</h2>
          <p className="text-muted-foreground">{t("home.stepsDesc")}</p>
        </div>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.key} className="relative flex gap-4 rounded-2xl border border-border bg-card p-5 md:flex-col md:gap-3 md:p-6">
              <div className="flex shrink-0 items-center gap-3 self-start">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <s.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="hidden font-mono text-sm font-semibold text-primary md:inline">0{i + 1}</span>
              </div>
              <div>
                <h3 className="mb-1 text-[17px] font-semibold">
                  <span className="mr-1.5 font-mono text-sm text-primary md:hidden">0{i + 1}</span>
                  {t(`home.${s.key}`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(`home.${s.key}d`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-center text-sm font-semibold text-primary">{t("home.stepsThen")}</p>
      </div>
    </section>
  );
}
