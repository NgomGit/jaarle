"use client";

import Link from "next/link";
import { Check, Circle, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

export interface MarketStatus {
  published: boolean;
  eligible_industry: boolean;
  pro: boolean;
  whatsapp_verified?: boolean;
  products_with_photo: number;
  uncategorized: number;
  services_without_poster?: number;
  listed: boolean;
}

/** Carte « Jaarle Market » de Ma boutique : ce qui manque pour y apparaître, point par point. */
export function MarketStatusCard({ status }: { status: MarketStatus }) {
  const { t } = useLocale();
  const checks = [
    { done: status.pro, label: t("shop.mk_pro"), href: status.pro ? null : "/dashboard/abonnement" },
    { done: status.published, label: t("shop.mk_published"), href: null },
    { done: status.eligible_industry, label: t("shop.mk_industry"), href: status.eligible_industry ? null : "/dashboard/boutique/modifier" },
    {
      done: status.products_with_photo >= 3,
      label: t("shop.mk_products").replace("{n}", String(Math.min(status.products_with_photo, 3))),
      href: status.products_with_photo >= 3 ? null : "/dashboard/produits/nouveau",
    },
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Store className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Jaarle Market</p>
            <p className="text-xs text-muted-foreground">{t("shop.mk_subtitle")}</p>
          </div>
        </div>
        {status.listed ? <Badge variant="success">{t("shop.mk_listed")}</Badge> : <Badge variant="warning">{t("shop.mk_notListed")}</Badge>}
      </div>

      {!status.listed && (
        <ul className="mt-4 flex flex-col gap-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-sm">
              {c.done ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-3 w-3" />
                </span>
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              )}
              <span className={cn(c.done && "text-muted-foreground")}>{c.label}</span>
              {!c.done && c.href && (
                <Link href={c.href} className="ml-auto shrink-0 text-xs font-semibold text-primary">
                  {t("shop.mk_fix")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {(status.services_without_poster ?? 0) > 0 && (
        <p className="mt-3 rounded-xl bg-accent px-3 py-2.5 text-xs text-accent-foreground">
          {t("shop.mk_noPoster").replace("{n}", String(status.services_without_poster))}{" "}
          <Link href="/dashboard/produits" className="font-semibold underline">
            {t("shop.mk_noPosterCta")}
          </Link>
        </p>
      )}
      {status.uncategorized > 0 && (
        <p className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          {t("shop.mk_uncategorized").replace("{n}", String(status.uncategorized))}{" "}
          <Link href="/dashboard/produits" className="font-semibold text-primary">
            {t("shop.mk_uncategorizedCta")}
          </Link>
        </p>
      )}
      {status.listed && (
        <Link href="/market" className="mt-3 inline-block text-sm font-semibold text-primary">
          {t("shop.mk_see")}
        </Link>
      )}
    </section>
  );
}
