"use client";

import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shopDisplayUrl } from "@/lib/shops/format";
import type { ShopStatus } from "@/lib/shops/types";
import { useLocale } from "@/lib/locale-context";

export interface ShopBannerInfo {
  name: string;
  slug: string;
  status: ShopStatus;
}

/** Encart d'accueil : invite à créer sa boutique, ou y donne accès. */
export function ShopBanner({ shop }: { shop: ShopBannerInfo | null }) {
  const { t } = useLocale();

  if (!shop) {
    return (
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-accent p-4 text-accent-foreground sm:flex-row sm:items-center">
        <Store className="hidden h-6 w-6 shrink-0 sm:block" strokeWidth={1.75} />
        <div className="flex-1">
          <p className="font-semibold">{t("shop.bn_title")}</p>
          <p className="text-sm opacity-90">{t("shop.bn_desc")}</p>
        </div>
        <Button variant="accent" asChild>
          <Link href="/dashboard/boutique">{t("shop.bn_cta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <Link
      href="/dashboard/boutique"
      className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-muted"
    >
      <Store className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{shop.name}</p>
        <p className="truncate text-xs text-muted-foreground">{shopDisplayUrl(shop.slug)}</p>
      </div>
      <span className="hidden text-xs font-medium text-primary sm:inline">{t("shop.bn_view")}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
