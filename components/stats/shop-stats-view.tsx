"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Eye, Lock, MessageCircle, PlayCircle, QrCode, Users } from "lucide-react";
import type { ShopStats, StatsTotals } from "@/lib/shops/stats";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const SOURCE_KEYS: Record<string, string> = {
  direct: "stats.src_direct",
  wa: "stats.src_wa",
  qr: "stats.src_qr",
  share: "stats.src_share",
  ig: "stats.src_ig",
  fb: "stats.src_fb",
  tt: "stats.src_tt",
  card: "stats.src_card",
  poster: "stats.src_poster",
};

export function ShopStatsView({
  stats,
  productInfo,
  published,
  shopSlug,
  advanced = true,
}: {
  stats: ShopStats;
  productInfo: Record<string, { name: string; thumbUrl: string | null }>;
  published: boolean;
  shopSlug: string;
  advanced?: boolean; // statistiques détaillées (30 jours, sources) : selon l'offre
}) {
  const { t } = useLocale();
  const tiles: { key: keyof StatsTotals; label: string; Icon: typeof Users }[] = [
    { key: "visitors", label: t("stats.visitors"), Icon: Users },
    { key: "productViews", label: t("stats.productViews"), Icon: Eye },
    { key: "whatsappClicks", label: t("stats.whatsappClicks"), Icon: MessageCircle },
    { key: "qrScans", label: t("stats.qrScans"), Icon: QrCode },
  ];
  const { current } = stats;
  const conversion = current.visitors > 0 ? Math.round((current.whatsappClicks / current.visitors) * 100) : null;
  const totalSources = stats.sources.reduce((s, x) => s + x.visits, 0);

  return (
    <div className="mx-auto w-full max-w-3xl pb-24 sm:pb-6">
      <Link href="/dashboard/boutique" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t("dashboard.nav_shop")}
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("stats.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("stats.desc")}</p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-muted p-1">
          {[7, 30].map((d) => {
            const locked = !advanced && d !== 7;
            return (
              <Link
                key={d}
                href={locked ? "/dashboard/abonnement" : `/dashboard/statistiques?jours=${d}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium",
                  stats.days === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {locked && <Lock className="h-3 w-3" />}
                {t("stats.days").replace("{n}", String(d))}
              </Link>
            );
          })}
        </div>
      </div>

      {!published && (
        <p className="mb-4 rounded-xl border border-border bg-muted px-3.5 py-3 text-sm text-muted-foreground">
          {t("stats.notPublished")}{" "}
          <Link href="/dashboard/boutique" className="font-medium text-primary">
            {t("stats.goPublish")}
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ key, label, Icon }) => {
          const value = current[key];
          const prev = stats.previous[key];
          const delta = prev > 0 ? Math.round(((value - prev) / prev) * 100) : null;
          return (
            <div key={key} className="rounded-2xl border border-border bg-card p-4">
              <Icon className="mb-3 h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-2xl font-bold tabular-nums">{value.toLocaleString("fr-FR")}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
              {delta !== null && delta !== 0 && (
                <p className={cn("mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium", delta > 0 ? "text-success" : "text-destructive")}>
                  {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(delta)} % {t("stats.vsPrevious")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* La réponse à « ma boutique m'apporte-t-elle des clients ? » */}
      <div className="mt-4 rounded-2xl border border-primary/30 bg-accent p-4 text-accent-foreground">
        <p className="text-sm font-semibold">
          {current.whatsappClicks > 0
            ? t("stats.headlineClicks").replace("{n}", String(current.whatsappClicks)).replace("{d}", String(stats.days))
            : t("stats.headlineNone").replace("{d}", String(stats.days))}
        </p>
        <p className="mt-0.5 text-sm opacity-90">
          {conversion !== null
            ? t("stats.conversion").replace("{p}", String(conversion))
            : t("stats.tipShare")}
        </p>
      </div>

      {/* Vidéos produit : affiché seulement quand il y a eu des lectures. */}
      {current.videoPlays > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm">
          <PlayCircle className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          {t("stats.videoPlays").replace("{n}", current.videoPlays.toLocaleString("fr-FR"))}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("stats.topProducts")}</h2>
          {stats.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("stats.empty")}</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {stats.topProducts.map((p, i) => {
                const info = productInfo[p.productId];
                return (
                  <li key={p.productId} className="flex items-center gap-3">
                    <span className="w-4 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {info?.thumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={info.thumbUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{info?.name ?? t("stats.deletedProduct")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("stats.productLine").replace("{v}", String(p.views)).replace("{c}", String(p.whatsappClicks))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("stats.sources")}</h2>
          {!advanced ? (
            <div className="flex flex-col items-start gap-2 rounded-xl bg-muted p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Lock className="h-3.5 w-3.5" />
                {t("billing.statsLockedTitle")}
              </p>
              <p className="text-xs text-muted-foreground">{t("billing.statsLockedDesc")}</p>
              <Link href="/dashboard/abonnement" className="text-xs font-semibold text-primary">
                {t("billing.upgradeCta")} →
              </Link>
            </div>
          ) : stats.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("stats.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stats.sources.map((s) => {
                const pct = totalSources ? Math.round((s.visits / totalSources) * 100) : 0;
                return (
                  <li key={s.source}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{SOURCE_KEYS[s.source] ? t(SOURCE_KEYS[s.source]) : s.source}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.visits} · {pct} %
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {published && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("stats.footnote")}{" "}
          <a href={`/boutique/${shopSlug}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary">
            {t("shop.ov_view")}
          </a>
        </p>
      )}
    </div>
  );
}
