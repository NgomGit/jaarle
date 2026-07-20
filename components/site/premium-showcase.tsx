"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

const examples = ["example-1.jpg", "example-2.jpg", "example-3.jpg"];

export function PremiumShowcase() {
  const { t } = useLocale();

  return (
    <section className="pb-24">
      <div className="container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <div className="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Sparkles className="h-3 w-3" /> Standard
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("showcase.title")}</h2>
          <p className="text-muted-foreground">{t("showcase.desc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {examples.map((file) => (
            <div key={file} className="overflow-hidden rounded-2xl border border-border shadow-glow-md">
              <img src={`/images/premium-examples/${file}`} alt={t("showcase.imageAlt")} className="aspect-square w-full object-cover" />
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button variant="accent" size="lg" asChild>
            <Link href="#pricing">{t("showcase.cta")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
