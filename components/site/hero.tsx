"use client";

import Link from "next/link";
import { BadgeCheck, Gift, Share2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { useLocale } from "@/lib/locale-context";
import { launchDate, type LaunchOffer } from "@/components/site/market-showcase";

// Jaarle 2.0 : la promesse complète — boutique en ligne + affiches + publications réseaux,
// et des clients qui arrivent sur WhatsApp. La maquette montre une vraie vitrine Jaarle.

const PRODUCTS = [
  { img: "/images/premium-examples/example-1-600.webp", name: "home.mockP1", price: "home.mockPrice1" },
  { img: "/images/premium-examples/example-2-600.webp", name: "home.mockP2", price: "home.mockPrice2" },
  { img: "/images/premium-examples/example-3-600.webp", name: "home.mockP3", price: "home.mockPrice3" },
];

export function Hero({ offer }: { offer?: LaunchOffer | null }) {
  const { t, locale } = useLocale();
  return (
    <section className="overflow-hidden pb-12 pt-12 sm:pt-20">
      <div className="container grid grid-cols-1 items-center gap-12 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {t("home.kicker")}
          </div>
          <h1 className="mb-4 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-5xl">
            {t("home.titleA")}{" "}
            <span className="bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">{t("home.titleAccent")}</span>
          </h1>
          <p className="mb-7 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">{t("home.lead")}</p>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <Button variant="accent" size="lg" asChild>
              <Link href="/register">{t("home.ctaPrimary")}</Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="/market">{t("home.ctaSecondary")}</Link>
            </Button>
          </div>
          {/* Offre de lancement du Market : lue en base, disparaît d'elle-même à la date de fin. */}
          {offer?.active && (
            <p className="mb-4 flex max-w-lg items-start gap-2.5 rounded-2xl border border-primary/25 bg-accent/60 px-4 py-3 text-sm text-accent-foreground">
              <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{t("home.launchTitle").replace("{date}", launchDate(offer.lastDay, locale))}</span>{" "}
                {t("home.launchDesc").replace("{n}", String(offer.minItems))}
              </span>
            </p>
          )}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BadgeCheck className="h-4 w-4 shrink-0 text-success" />
            {t("home.reassure")}
          </p>
        </div>

        {/* Maquette : une vitrine Jaarle sur téléphone */}
        <div className="relative flex justify-center">
          <div className="relative">
              <div className="absolute right-[calc(100%-26px)] top-[42%] z-10 hidden items-center gap-2 whitespace-nowrap rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-glow-md lg:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25D366] text-white">
                <WhatsAppIcon className="h-4 w-4" />
              </span>
              {t("home.badgeOrder")}
            </div>
              <div className="absolute bottom-[120px] right-[calc(100%-40px)] z-10 hidden items-center gap-2 whitespace-nowrap rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-glow-md lg:flex">
              <Store className="h-4 w-4 text-primary" />
              {t("home.badgePosts")}
            </div>
          <div className="relative h-[540px] w-[280px] overflow-hidden rounded-[36px] border border-border bg-[#F6F6F8] shadow-glow-lg">
            <div className="absolute left-1/2 top-0 z-10 h-5 w-[96px] -translate-x-1/2 rounded-b-2xl bg-foreground" />
            {/* En-tête boutique */}
            <div className="bg-gradient-to-br from-primary to-secondary px-4 pb-5 pt-9 text-white">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-primary">AC</span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold">{t("home.mockShop")}</p>
                  <p className="truncate text-[11px] text-white/80">{t("home.mockCity")}</p>
                </div>
                <Share2 className="ml-auto h-4 w-4 text-white/90" />
              </div>
            </div>
            {/* Produits */}
            <div className="-mt-3 grid grid-cols-2 gap-2.5 px-3">
              {PRODUCTS.map((p) => (
                <div key={p.img} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.img} alt="" width={130} height={130} className="aspect-square w-full object-cover" />
                  <div className="p-2">
                    <p className="truncate text-[11px] font-semibold text-gray-900">{t(p.name)}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-primary">{t(p.price)}</span>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366] text-white">
                        <WhatsAppIcon className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex aspect-[1/1.25] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/60 text-[11px] font-semibold text-gray-500">
                {t("home.mockP4")}
              </div>
            </div>
            {/* Barre de commande */}
            <div className="absolute inset-x-3 bottom-4 flex items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 text-[13px] font-bold text-white shadow-lg">
              <WhatsAppIcon className="h-4 w-4" />
              {t("home.mockOrder")}
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
