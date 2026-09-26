"use client";

import { Megaphone, MessageCircle, Package, Share2, Sparkles, Store } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

// Le parcours Jaarle 2.0 en 6 étapes (même histoire que l'accueil du tableau de bord et /tarifs).
const STEPS = [
  { icon: Store, key: "step1" },
  { icon: Package, key: "step2" },
  { icon: Sparkles, key: "step3" },
  { icon: Megaphone, key: "step4" },
  { icon: Share2, key: "step5" },
  { icon: MessageCircle, key: "step6" },
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
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-col items-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <s.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <span className="mt-2 font-mono text-xs font-semibold text-primary">0{i + 1}</span>
              </div>
              <div>
                <h3 className="mb-1 text-[16px] font-semibold">{t(`home.${s.key}`)}</h3>
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
