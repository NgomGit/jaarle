"use client";

import { useLocale } from "@/lib/locale-context";
import { Card } from "@/components/ui/card";

const people = [
  { initial: "A", name: "Awa Diallo", role: "Vend des vêtements, Dakar", fr: "Avant je passais une heure à essayer de faire une affiche sur mon téléphone. Maintenant c'est fait en une minute, et ça a l'air pro.", en: "I used to spend an hour trying to make a poster on my phone. Now it's done in a minute, and it looks professional." },
  { initial: "M", name: "Moussa Fall", role: "Boutique de chaussures, Thiès", fr: "Je paie 500 FCFA seulement quand je publie, pas d'abonnement qui tourne dans le vide. Ça change tout pour mon budget.", en: "I only pay 500 FCFA when I publish, no subscription running in the background. It changes everything for my budget." },
  { initial: "F", name: "Fatou Sow", role: "Cosmétiques, Touba", fr: "J'envoie juste la photo et le prix par la voix, Jaarle fait le reste. Mes publications ont plus de réactions qu'avant.", en: "I just send the photo and price by voice, Jaarle does the rest. My posts get more reactions than before." },
];

export function Testimonials() {
  const { t, locale } = useLocale();
  return (
    <section className="pb-24">
      <div className="container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("voices.title")}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {people.map((p) => (
            <Card key={p.name} className="p-6">
              <p className="mb-4 text-[14px] leading-relaxed">&ldquo;{locale === "fr" ? p.fr : p.en}&rdquo;</p>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">
                  {p.initial}
                </div>
                <div>
                  <div className="text-[13px] font-semibold">{p.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{p.role}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
