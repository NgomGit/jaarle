"use client";

import { Eye, Link2, MessageCircle, Phone, QrCode } from "lucide-react";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { useLocale } from "@/lib/locale-context";

const PLATFORMS = [
  { label: "Instagram", ratio: "1:1" },
  { label: "Facebook", ratio: "1:1" },
  { label: "TikTok", ratio: "9:16" },
  { label: "Story", ratio: "9:16" },
  { label: "Statut WhatsApp", ratio: "9:16" },
];

// Les 4 piliers de Jaarle 2.0 : boutique, affiches, Studio (réseaux), statistiques.
export function Features() {
  const { t } = useLocale();
  return (
    <section id="features" className="scroll-mt-20 pb-20 sm:pb-24">
      <div className="container">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("home.featuresTitle")}</h2>
          <p className="text-muted-foreground">{t("home.featuresDesc")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Boutique */}
          <article className="flex flex-col rounded-[22px] border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-bold">{t("home.f1t")}</h3>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t("home.f1d")}</p>
            <ul className="mt-auto grid gap-2 text-sm">
              {[
                { icon: Link2, k: "home.f1a" },
                { icon: QrCode, k: "home.f1b" },
                { icon: MessageCircle, k: "home.f1c" },
              ].map((x) => (
                <li key={x.k} className="flex items-center gap-2.5 rounded-xl bg-muted px-3 py-2.5 font-medium">
                  <x.icon className="h-4 w-4 text-primary" />
                  {t(x.k)}
                </li>
              ))}
            </ul>
          </article>

          {/* Affiches */}
          <article className="flex flex-col rounded-[22px] border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-bold">{t("home.f2t")}</h3>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t("home.f2d")}</p>
            <div className="mt-auto grid grid-cols-3 gap-2">
              {[1, 2, 3].map((n) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={n} src={`/images/premium-examples/example-${n}.jpg`} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
              ))}
            </div>
          </article>

          {/* Studio */}
          <article className="flex flex-col rounded-[22px] border border-primary/30 bg-accent/40 p-6">
            <h3 className="mb-2 text-lg font-bold">{t("home.f3t")}</h3>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t("home.f3d")}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <span key={p.label} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">
                  {p.label}
                  <span className="ml-1 font-normal text-muted-foreground">{p.ratio}</span>
                </span>
              ))}
            </div>
          </article>

          {/* Statistiques */}
          <article className="flex flex-col rounded-[22px] border border-border bg-card p-6">
            <h3 className="mb-2 text-lg font-bold">{t("home.f4t")}</h3>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t("home.f4d")}</p>
            <div className="mt-auto grid grid-cols-3 gap-2">
              {[
                { icon: Eye, v: "126", k: "home.f4v", tone: "bg-muted" },
                { icon: null, v: "14", k: "home.f4w", tone: "bg-[#25D366]/10" },
                { icon: Phone, v: "3", k: "home.f4c", tone: "bg-muted" },
              ].map((s) => (
                <div key={s.k} className={`rounded-xl p-3 ${s.tone}`}>
                  {s.icon ? <s.icon className="h-4 w-4 text-muted-foreground" /> : <WhatsAppIcon className="h-4 w-4 text-[#1da851]" />}
                  <p className="mt-1.5 text-xl font-bold">{s.v}</p>
                  <p className="text-[11px] leading-tight text-muted-foreground">{t(s.k)}</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
