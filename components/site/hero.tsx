"use client";

import Link from "next/link";
import { Sparkles, CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

export function Hero() {
  const { t } = useLocale();
  return (
    <section className="pb-10 pt-20">
      <div className="container grid grid-cols-1 items-center gap-14 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {t("hero.kicker")}
          </div>
          <h1 className="mb-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            {t("hero.titleA")}{" "}
            <span className="bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">
              {t("hero.titleAccent")}
            </span>
            {t("hero.titleB")}
          </h1>
          <p className="mb-8 max-w-md text-lg leading-relaxed text-muted-foreground">{t("hero.lead")}</p>
          <div className="mb-8 flex flex-wrap gap-3">
            <Button variant="accent" size="lg" asChild>
              <Link href="#preview">{t("hero.ctaPrimary")}</Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="#pricing">{t("hero.ctaSecondary")}</Link>
            </Button>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex">
              {["A", "M", "F", "K"].map((l, i) => (
                <span
                  key={l}
                  style={{ marginLeft: i === 0 ? 0 : -8 }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-primary to-secondary text-[10px] font-bold text-white"
                >
                  {l}
                </span>
              ))}
            </div>
            <span>{t("hero.proof")}</span>
          </div>
        </div>

        <div className="relative flex justify-center">
          <div className="absolute left-[-10px] top-10 hidden items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-glow-md sm:flex">
            <CheckCircle2 className="h-4 w-4 text-success" />
            {t("hero.badgeScore")}
          </div>
          <div className="absolute bottom-16 right-[-6px] hidden items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-glow-md sm:flex">
            <Wallet className="h-4 w-4 text-primary" />
            {t("hero.badgePrice")}
          </div>

          <div className="relative h-[500px] w-[260px] overflow-hidden rounded-[34px] border border-border bg-card shadow-glow-lg">
            <div className="absolute left-1/2 top-0 z-10 h-5 w-[96px] -translate-x-1/2 rounded-b-2xl bg-foreground" />
            <div className="p-4 pt-9">
              <div className="relative mb-3 h-[210px] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-secondary">
                <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[10px] font-bold text-primary">
                  <Sparkles className="h-3 w-3" /> PROMO
                </div>
                <div className="absolute left-1/2 top-[42%] h-[110px] w-[80px] -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/90 shadow-lg" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                  <span className="font-mono text-lg font-bold text-white">25 000F</span>
                  <span className="rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-primary">Commander</span>
                </div>
              </div>
              <div className="mb-3 flex gap-2">
                {["Facebook", "TikTok", "Insta"].map((f) => (
                  <div key={f} className="flex h-8 flex-1 items-center justify-center rounded-lg border border-border bg-muted text-[9.5px] font-semibold text-muted-foreground">
                    {f}
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-border bg-card p-3">
                {[t("preview.step1"), t("preview.step5"), t("preview.resultCount")].map((step) => (
                  <div key={step} className="flex items-center gap-2 py-1 text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
