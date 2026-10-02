"use client";

import Link from "next/link";
import { ArrowRight, Check, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

// Section « Jaarle Market » de l'accueil : la visibilité que le commerçant gagne en créant sa
// boutique. Les produits affichés sont de VRAIS produits du Market (jamais inventés) ; sans assez
// de produits, on montre des affiches d'exemple Jaarle.

export interface ShowcaseItem {
  id: string;
  name: string;
  priceLabel: string;
  shopName: string;
  imageUrl: string | null;
  href: string;
}

export interface LaunchOffer {
  active: boolean;
  /** Dernier jour d'ouverture (inclus), AAAA-MM-JJ. */
  lastDay: string | null;
  minItems: number;
  proMinItems: number;
}

export function launchDate(lastDay: string | null, locale: string): string {
  if (!lastDay) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${lastDay}T00:00:00Z`)
  );
}

const EXAMPLES = [1, 2, 3, 4].map((n) => ({
  id: `ex-${n}`,
  name: "",
  priceLabel: "",
  shopName: "",
  imageUrl: `/images/premium-examples/example-${((n - 1) % 3) + 1}-600.webp`,
  href: "/market",
}));

export function MarketShowcase({ items, offer }: { items: ShowcaseItem[]; offer: LaunchOffer }) {
  const { t, locale } = useLocale();
  const real = items.length >= 4;
  const grid = real ? items.slice(0, 4) : EXAMPLES;
  const offerLine = offer.active
    ? t("home.marketOffer").replace("{date}", launchDate(offer.lastDay, locale)).replace("{n}", String(offer.minItems))
    : t("home.marketOfferPro").replace("{n}", String(offer.proMinItems));

  return (
    <section id="market" className="scroll-mt-20 pb-20 sm:pb-24">
      <div className="container">
        <div className="grid grid-cols-1 items-center gap-10 rounded-[28px] border border-border bg-card p-6 sm:p-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              <Store className="h-3.5 w-3.5" /> Jaarle Market
            </div>
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("home.marketTitle")}</h2>
            <p className="mb-6 leading-relaxed text-muted-foreground">{t("home.marketDesc")}</p>
            <ul className="mb-6 grid gap-2.5 text-[15px]">
              {["home.market1", "home.market2", "home.market3"].map((k) => (
                <li key={k} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
            <p className="mb-6 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground">{offerLine}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button variant="accent" size="lg" asChild>
                <Link href="/register">{t("home.ctaPrimary")}</Link>
              </Button>
              <Link href="/market" className="inline-flex h-12 items-center justify-center gap-1.5 text-sm font-semibold text-primary">
                {t("home.marketSee")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {grid.map((p) => (
              <Link key={p.id} href={p.href} className="group overflow-hidden rounded-2xl border border-border bg-background">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    width={300}
                    height={300}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="block aspect-square w-full bg-muted" />
                )}
                {real && (
                  <span className="block p-3">
                    <span className="block truncate text-[13px] font-medium">{p.name}</span>
                    <span className="mt-0.5 block text-sm font-bold">{p.priceLabel}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{p.shopName}</span>
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
