"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CheckCircle2, Copy, MapPin, MessageCircle, Pencil, PartyPopper, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShopMonogram } from "@/components/shop/shop-fields";
import { formatSenegalPhone, shopDisplayUrl, shopPublicUrl } from "@/lib/shops/format";
import type { Shop } from "@/lib/shops/types";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = { draft: "neutral", published: "success", suspended: "destructive" } as const;

export function ShopOverview({ shop, logoUrl, justCreated }: { shop: Shop; logoUrl: string | null; justCreated: boolean }) {
  const { t } = useLocale();
  const [copied, setCopied] = React.useState(false);
  const location = [shop.district, shop.city].filter(Boolean).join(", ");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shopPublicUrl(shop.slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible (navigateur ancien) : le lien reste sélectionnable à la main
    }
  }

  const tasks = [
    { label: t("shop.ov_task_created"), done: true, soon: false },
    { label: t("shop.ov_task_products"), done: false, soon: true },
    { label: t("shop.ov_task_publish"), done: shop.status === "published", soon: shop.status !== "published" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-20 sm:pb-0">
      {justCreated && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-accent p-4 text-accent-foreground">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="font-semibold">{t("shop.ov_createdTitle")}</p>
            <p className="text-sm opacity-90">{t("shop.ov_createdDesc")}</p>
          </div>
        </div>
      )}

      {shop.status === "suspended" && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {t("shop.ov_suspended")}
        </p>
      )}

      {/* Identité */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <ShopMonogram name={shop.name} logoUrl={logoUrl} size={64} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold">{shop.name}</h1>
              <Badge variant={STATUS_VARIANT[shop.status]}>{t(`shop.ov_status_${shop.status}`)}</Badge>
            </div>
            {shop.category_label && <p className="text-sm text-muted-foreground">{shop.category_label}</p>}
          </div>
          {shop.status !== "suspended" && (
            <Button variant="secondary" size="sm" asChild>
              <Link href="/dashboard/boutique/modifier">
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("shop.ov_edit")}</span>
              </Link>
            </Button>
          )}
        </div>

        {shop.description && <p className="mt-3 text-sm text-foreground/90">{shop.description}</p>}

        <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="text-foreground">{formatSenegalPhone(shop.whatsapp)}</span>
          </div>
          {location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="text-foreground">{location}</span>
            </div>
          )}
        </div>
      </section>

      {/* Lien */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("shop.ov_linkLabel")}</p>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 select-all break-all rounded-lg bg-muted px-3 py-2 text-sm font-medium">
            {shopDisplayUrl(shop.slug)}
          </p>
          <Button variant="secondary" size="md" onClick={copyLink} aria-live="polite">
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? t("shop.copied") : t("shop.copy")}</span>
          </Button>
        </div>
        {shop.status === "draft" && <p className="mt-2 text-xs text-muted-foreground">{t("shop.ov_linkSoon")}</p>}
      </section>

      {/* Prochaines étapes */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">{t("shop.ov_nextTitle")}</h2>
        <ul className="flex flex-col gap-2.5">
          {tasks.map((task) => (
            <li key={task.label} className="flex items-center gap-2.5 text-sm">
              <CheckCircle2
                className={cn("h-5 w-5 shrink-0", task.done ? "text-success" : "text-muted-foreground/40")}
                strokeWidth={1.75}
              />
              <span className={cn("flex-1", task.done && "text-muted-foreground line-through")}>{task.label}</span>
              {task.soon && <Badge variant="neutral">{t("shop.soon")}</Badge>}
            </li>
          ))}
        </ul>
      </section>

      {/* Le générateur existant reste accessible tel quel */}
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex-1">
          <p className="text-sm font-semibold">{t("shop.ov_posterTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("shop.ov_posterDesc")}</p>
        </div>
        <Button variant="accent" asChild>
          <Link href="/dashboard/new">
            <Sparkles className="h-4 w-4" />
            {t("shop.ov_posterCta")}
          </Link>
        </Button>
      </section>
    </div>
  );
}
