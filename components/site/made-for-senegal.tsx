"use client";

import { Languages, Smartphone, Wallet } from "lucide-react";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { useLocale } from "@/lib/locale-context";

export function MadeForSenegal() {
  const { t } = useLocale();
  const items = [
    { icon: null, k: "sn1" },
    { icon: Wallet, k: "sn2" },
    { icon: Smartphone, k: "sn3" },
    { icon: Languages, k: "sn4" },
  ];
  return (
    <section className="pb-20 sm:pb-24">
      <div className="container">
        <h2 className="mx-auto mb-10 max-w-xl text-center text-3xl font-bold tracking-tight sm:text-4xl">{t("home.senegalTitle")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.k} className="rounded-2xl border border-border bg-card p-5">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                {it.icon ? <it.icon className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <WhatsAppIcon className="h-[18px] w-[18px]" />}
              </span>
              <h3 className="mb-1 font-semibold">{t(`home.${it.k}t`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(`home.${it.k}d`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
