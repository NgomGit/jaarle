"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

// Exemples par défaut, tant que l'admin n'a choisi aucune affiche (Admin → Affiches, migration 0037).
const examples = [
  { src: "/images/premium-examples/example-1-600.webp", alt: "Affiche créée par Jaarle pour des chaussures en wax" },
  { src: "/images/premium-examples/example-2-600.webp", alt: "Affiche créée par Jaarle pour une tenue africaine à 25 000 FCFA" },
  { src: "/images/premium-examples/example-3-600.webp", alt: "Affiche créée par Jaarle pour des accessoires auto" },
];

export function PremiumShowcase({ items }: { items?: { src: string; alt: string }[] }) {
  const { t } = useLocale();
  const list = items && items.length > 0 ? items : examples;

  return (
    <section className="pb-20 sm:pb-24">
      <div className="container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <div className="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Sparkles className="h-3 w-3" /> IA
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("home.showcaseTitle")}</h2>
          <p className="text-muted-foreground">{t("home.showcaseDesc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {list.map(({ src, alt }) => (
            <div key={src} className="overflow-hidden rounded-2xl border border-border shadow-glow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt} width={600} height={600} loading="lazy" className="aspect-square w-full object-cover" />
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button variant="accent" size="lg" asChild>
            <Link href="/register">{t("home.ctaPrimary")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
