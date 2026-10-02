"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  PartyPopper,
  Pencil,
  Plus,
  BarChart3,
  Rocket,
  Sparkles,
} from "lucide-react";
import { setShopPublished } from "@/app/dashboard/boutique/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote, ShopMonogram } from "@/components/shop/shop-fields";
import { ShopQrKit } from "@/components/shop/shop-qr-kit";
import { formatSenegalPhone, shopDisplayUrl, shopPublicUrl } from "@/lib/shops/format";
import type { Shop } from "@/lib/shops/types";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = { draft: "neutral", published: "success", suspended: "destructive" } as const;

export function ShopOverview({
  shop,
  logoUrl,
  justCreated,
  justPublished = false,
  productCounts = { total: 0, visible: 0 },
  qrSvg = null,
  marketSlot,
}: {
  shop: Shop;
  logoUrl: string | null;
  justCreated: boolean;
  justPublished?: boolean;
  productCounts?: { total: number; visible: number };
  qrSvg?: string | null;
  /** Carte Jaarle Market (rendue par la page). */
  marketSlot?: React.ReactNode;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const location = [shop.district, shop.city].filter(Boolean).join(", ");
  const isPublished = shop.status === "published";
  const publicUrl = shopPublicUrl(shop.slug);
  const shareText = t("shop.ov_shareMessage").replace("{name}", shop.name).replace("{url}", `${publicUrl}?src=wa`);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible : le lien reste sélectionnable à la main
    }
  }

  async function togglePublished(next: boolean) {
    setPublishing(true);
    setError(null);
    const res = await setShopPublished(next);
    setPublishing(false);
    if (!res.ok) return setError(res.error);
    router.replace(next ? "/dashboard/boutique?published=1" : "/dashboard/boutique");
    router.refresh();
  }

  const tasks = [
    { label: t("shop.ov_task_created"), done: true, href: null as string | null },
    { label: t("shop.ov_task_products"), done: productCounts.visible > 0, href: "/dashboard/produits/nouveau" },
    { label: t("shop.ov_task_publish"), done: isPublished, href: null },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-20 sm:pb-0">
      {justPublished && isPublished ? (
        <Banner icon={Rocket} title={t("shop.ov_publishedTitle")} desc={t("shop.ov_publishedDesc")} />
      ) : (
        justCreated && <Banner icon={PartyPopper} title={t("shop.ov_createdTitle")} desc={t("shop.ov_createdDesc")} />
      )}

      {shop.status === "suspended" && <ErrorNote message={t("shop.ov_suspended")} />}

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

      {/* Lien + publication */}
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

        {isPublished ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white sm:flex-1"
            >
              <MessageCircle className="h-4 w-4" />
              {t("shop.ov_share")}
            </a>
            <Button variant="secondary" size="lg" className="h-11" asChild>
              <a href={`/boutique/${shop.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t("shop.ov_view")}
              </a>
            </Button>
          </div>
        ) : (
          shop.status === "draft" && (
            <div className="mt-3">
              {productCounts.visible === 0 ? (
                // Pas encore publiable : on mène directement à l'étape qui manque (jamais un bouton grisé sans issue).
                <>
                  <Button variant="accent" size="lg" className="w-full" asChild>
                    <Link href={productCounts.total === 0 ? "/dashboard/produits/nouveau" : "/dashboard/produits"}>
                      {productCounts.total === 0 ? <Plus className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                      {t(productCounts.total === 0 ? "shop.ov_addFirstProduct" : "shop.ov_makeProductAvailable")}
                    </Link>
                  </Button>
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Rocket className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t(productCounts.total === 0 ? "shop.ov_publishAfterProduct" : "shop.ov_publishAfterAvailable")}
                  </p>
                </>
              ) : (
                <Button variant="accent" size="lg" className="w-full" disabled={publishing} onClick={() => togglePublished(true)}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {publishing ? t("shop.ov_publishing") : t("shop.ov_publish")}
                </Button>
              )}
            </div>
          )
        )}
        <ErrorNote message={error} className="mt-3" />
      </section>

      {/* QR code : visuel pour le statut WhatsApp, carte à imprimer, QR seul */}
      {qrSvg && shop.status !== "suspended" && <ShopQrKit slug={shop.slug} isPublished={isPublished} />}

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
              {task.href && !task.done ? (
                <Link href={task.href} className="flex-1 font-medium text-primary">
                  {task.label}
                </Link>
              ) : (
                <span className={cn("flex-1", task.done && "text-muted-foreground line-through")}>{task.label}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" asChild>
            <Link href="/dashboard/produits">
              <Package className="h-4 w-4" />
              {t("shop.ov_manageProducts")} ({productCounts.total})
            </Link>
          </Button>
          {isPublished && (
            <Button variant="secondary" asChild>
              <Link href="/dashboard/statistiques">
                <BarChart3 className="h-4 w-4" />
                {t("shop.ov_stats")}
              </Link>
            </Button>
          )}
        </div>
      </section>

      {/* Le générateur existant reste accessible tel quel */}
      {marketSlot}

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

      {isPublished && (
        <button
          type="button"
          disabled={publishing}
          onClick={() => togglePublished(false)}
          className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("shop.ov_unpublish")}
        </button>
      )}
    </div>
  );
}

function Banner({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-accent p-4 text-accent-foreground">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm opacity-90">{desc}</p>
      </div>
    </div>
  );
}
