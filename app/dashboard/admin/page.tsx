import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus, ShoppingBag, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { formatFcfa } from "@/lib/billing/format";
import { BarList, Funnel, Sparkline, TrendChart } from "@/components/admin/charts";
import { deltaPct, formatValue, SOURCE_LABELS, sumOf, type AdminDashboard, type DayPoint } from "@/lib/admin/dashboard";
import { cn } from "@/lib/utils";

// Tableau de bord ADMIN (réservé aux comptes account_profiles.is_admin = true).
// Pour s'ajouter : dans le SQL Editor Supabase →
//   update public.account_profiles set is_admin = true
//   where user_id = (select id from auth.users where phone = '221XXXXXXXXX');
// Données : admin_metrics (0019) + admin_dashboard (0025 : courbes, entonnoir, sources, top boutiques…).

export const dynamic = "force-dynamic";

type Metrics = {
  days: number;
  acquisition: Record<string, number>;
  activation: Record<string, number>;
  engagement: Record<string, number>;
  monetization: Record<string, number> & { revenue_by_kind: Record<string, number> };
  referral: Record<string, number> & { top_referrers: { code: string; signups: number }[] };
  ai: { cost_usd: number; calls: number; users_with_usage: number; generations: number; by_feature: Record<string, { calls: number; cost_usd: number }> };
};

const PERIODS = [7, 30, 90];

export default async function AdminPage({ searchParams }: { searchParams: { jours?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ent = await getEntitlements();
  if (!ent.isAdmin) notFound();

  const days = PERIODS.includes(Number(searchParams.jours)) ? Number(searchParams.jours) : 30;
  const admin = createAdminClient();
  const [metricsRes, dashRes] = await Promise.all([
    admin.rpc("admin_metrics", { p_days: days }),
    admin.rpc("admin_dashboard", { p_days: days }),
  ]);
  if (metricsRes.error || !metricsRes.data) {
    return <p className="text-sm text-destructive">Métriques indisponibles : {metricsRes.error?.message}</p>;
  }
  const m = metricsRes.data as Metrics;
  const d = (dashRes.data as AdminDashboard | null) ?? null;

  const kpi = m.engagement.active_shops_7d;
  const kpiPrev = m.engagement.active_shops_prev_7d;
  const usd = (n: number) => `${Number(n).toFixed(2)} $`;
  const perGen = m.ai.generations > 0 ? m.ai.cost_usd / m.ai.generations : 0;
  const series: DayPoint[] = d?.series ?? [];
  const col = (k: keyof Omit<DayPoint, "date">) => series.map((p) => Number(p[k]) || 0);

  return (
    <div className="mx-auto w-full max-w-6xl pb-24 md:pb-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Super admin</p>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord Jaarle</h1>
          <p className="text-sm text-muted-foreground">
            {days} derniers jours, comparés aux {days} jours d&apos;avant.
          </p>
        </div>
        <nav className="inline-flex rounded-xl border border-border bg-muted p-1" aria-label="Période">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/dashboard/admin?jours=${p}`}
              aria-current={p === days ? "page" : undefined}
              className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", p === days ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {p} jours
            </Link>
          ))}
        </nav>
      </div>

      {!d && (
        <p className="mb-5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Les graphiques arrivent dès que la migration <code className="font-mono">0025_admin_dashboard.sql</code> est exécutée dans Supabase.
          {dashRes.error?.message ? <span className="text-muted-foreground"> ({dashRes.error.message})</span> : null}
        </p>
      )}

      {/* KPI principal + 4 chiffres clés */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="flex flex-col justify-between rounded-2xl bg-primary p-6 text-primary-foreground shadow-glow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">KPI principal · 7 jours</p>
            <p className="mt-3 text-6xl font-bold tabular-nums leading-none">{formatValue(kpi)}</p>
            <p className="mt-3 text-sm leading-relaxed opacity-90">boutiques ont reçu au moins un contact client (WhatsApp, appel, commande).</p>
          </div>
          <div className="mt-5">
            <Delta current={kpi} previous={kpiPrev} onAccent />
            <span className="ml-2 text-xs opacity-80">vs 7 jours précédents ({formatValue(kpiPrev)})</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Inscriptions" value={d ? sumOf(series, "signups") : m.acquisition.new_accounts} previous={d?.previous.signups} trend={col("signups")} sub={`${formatValue(m.acquisition.total_accounts)} comptes au total`} />
          <StatTile label="Affiches créées" value={d ? sumOf(series, "posters") : m.engagement.posters_generated} previous={d?.previous.posters} trend={col("posters")} />
          <StatTile label="Contacts clients" value={d ? sumOf(series, "contacts") : m.engagement.whatsapp_clicks + m.engagement.call_clicks} previous={d?.previous.contacts} trend={col("contacts")} sub="WhatsApp, appels, commandes" />
          <StatTile label="Revenus" value={d ? sumOf(series, "revenue") : m.monetization.revenue_total} format="fcfa" previous={d?.previous.revenue} trend={col("revenue")} sub={`${formatValue(m.monetization.pro_users + m.monetization.business_users)} abonnés payants`} />
        </div>
      </div>

      {d && (
        <>
          {/* Évolution */}
          <Panel title="Évolution jour par jour" subtitle="Choisis un indicateur ; survole la courbe pour le détail d'un jour." className="mt-4">
            <TrendChart
              series={series}
              metrics={[
                { key: "contacts", label: "Contacts clients" },
                { key: "visits", label: "Visites des boutiques" },
                { key: "signups", label: "Inscriptions" },
                { key: "shops_published", label: "Boutiques publiées" },
                { key: "posters", label: "Affiches créées" },
                { key: "orders", label: "Commandes panier" },
                { key: "revenue", label: "Revenus", format: "fcfa" },
              ]}
            />
          </Panel>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Parcours des vendeurs" subtitle="Tous les comptes depuis le lancement : où ils s'arrêtent.">
              <Funnel
                steps={[
                  { label: "Compte créé", value: d.funnel.accounts },
                  { label: "Boutique créée", value: d.funnel.shop },
                  { label: "Boutique publiée", value: d.funnel.published },
                  { label: "3 produits ou plus", value: d.funnel.stocked },
                  { label: "Premier contact client", value: d.funnel.contacted },
                  { label: "Abonnement payant actif", value: d.funnel.paid },
                ]}
              />
            </Panel>
            <Panel title="D'où viennent les contacts" subtitle="Clics WhatsApp, appels et commandes, selon la provenance du visiteur.">
              <BarList rows={d.sources.map((s) => ({ label: SOURCE_LABELS[s.source] ?? s.source, value: s.count }))} />
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Boutiques les plus actives" subtitle="Classées par contacts reçus sur la période.">
              {d.top_shops.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Aucune activité sur la période.</p>
              ) : (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[440px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="px-1 pb-2 font-medium">Boutique</th>
                        <th className="px-1 pb-2 text-right font-medium">Contacts</th>
                        <th className="px-1 pb-2 text-right font-medium">Visites</th>
                        <th className="px-1 pb-2 text-right font-medium">Commandes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {d.top_shops.map((s, i) => {
                        const max = Math.max(d.top_shops[0].contacts, 1);
                        return (
                          <tr key={s.id}>
                            <td className="px-1 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <span className="w-4 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                                <div className="min-w-0">
                                  <Link href={`/boutique/${s.slug}`} target="_blank" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                                    <span className="truncate">{s.name}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                  </Link>
                                  <div className="mt-1 h-1.5 w-28 rounded-full bg-muted">
                                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max((s.contacts / max) * 100, s.contacts ? 4 : 0)}%` }} />
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-1 py-2.5 text-right font-bold tabular-nums">{formatValue(s.contacts)}</td>
                            <td className="px-1 py-2.5 text-right tabular-nums text-muted-foreground">{formatValue(s.visits)}</td>
                            <td className="px-1 py-2.5 text-right tabular-nums text-muted-foreground">{formatValue(s.orders)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="Boutiques en ligne par ville" subtitle={`${formatValue(m.acquisition.total_published_shops)} boutiques publiées.`}>
              <BarList rows={d.cities.map((c) => ({ label: c.city, value: c.count }))} empty="Aucune boutique publiée." />
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Panel title="Jaarle Market" icon={<Store className="h-4 w-4" />}>
              <MiniGrid
                items={[
                  { label: "Boutiques listées", value: formatValue(d.market.listed_shops) },
                  { label: "Annonces visibles", value: formatValue(d.market.visible_items) },
                  { label: "Visites venues du Market", value: formatValue(d.market.visits) },
                  { label: "Contacts venus du Market", value: formatValue(d.market.contacts) },
                ]}
              />
            </Panel>
            <Panel title="Commandes panier" icon={<ShoppingBag className="h-4 w-4" />}>
              <MiniGrid
                items={[
                  { label: "Commandes envoyées", value: formatValue(d.orders.count), delta: <Delta current={d.orders.count} previous={d.previous.orders} /> },
                  { label: "Valeur totale", value: formatValue(d.orders.value, "fcfa", true) },
                  { label: "Panier moyen", value: formatValue(d.orders.avg_value, "fcfa", true), sub: `${String(d.orders.avg_items).replace(".", ",")} articles en moyenne` },
                  { label: "Boutiques concernées", value: formatValue(d.orders.shops) },
                ]}
              />
            </Panel>
          </div>
        </>
      )}

      {/* Détails (métriques existantes) */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Détails de la période</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Block title="Acquisition">
          <Row label="Nouveaux comptes" value={m.acquisition.new_accounts} sub={`${formatValue(m.acquisition.total_accounts)} au total`} />
          <Row label="Nouvelles boutiques" value={m.acquisition.new_shops} />
          <Row label="Boutiques publiées" value={m.acquisition.shops_published} sub={`${formatValue(m.acquisition.total_published_shops)} en ligne au total`} />
        </Block>
        <Block title="Activation (premières fois)">
          <Row label="Premier produit" value={m.activation.first_product} />
          <Row label="Première affiche" value={m.activation.first_poster} />
          <Row label="Premier contenu marketing" value={m.activation.first_content} />
          <Row label="Premier partage de boutique" value={m.activation.first_share} />
        </Block>
        <Block title="Engagement">
          <Row label="Boutiques avec un contact client" value={m.engagement.active_shops_period} />
          <Row label="Visites (boutiques + produits)" value={m.engagement.visits} />
          <Row label="Clics WhatsApp" value={m.engagement.whatsapp_clicks} />
          <Row label="Appels" value={m.engagement.call_clicks} />
          <Row label="Packs de contenus générés" value={m.engagement.contents_generated} />
        </Block>
        <Block title="Monétisation">
          <Row label="Utilisateurs Gratuit" value={m.monetization.free_users} />
          <Row label="Utilisateurs Pro" value={m.monetization.pro_users} />
          <Row label="Utilisateurs Business" value={m.monetization.business_users} />
          <Row label="Commerçants fondateurs" value={m.monetization.founding_users} />
          <Row label="Revenus" value={formatFcfa(m.monetization.revenue_total)} sub={Object.entries(m.monetization.revenue_by_kind ?? {}).map(([k, v]) => `${k} : ${formatFcfa(v)}`).join(" · ")} />
          <Row label="Passages à une offre payante" value={m.monetization.conversions_to_paid} />
        </Block>
        <Block title="Parrainage">
          <Row label="Inscriptions via un lien" value={m.referral.signups} />
          <Row label="Boutiques créées (parrainés)" value={m.referral.shops_created} />
          <Row label="Boutiques publiées (parrainés)" value={m.referral.shops_published} />
          <Row label="Passés à une offre payante" value={m.referral.converted_to_paid} />
          {m.referral.top_referrers.length > 0 && (
            <p className="pt-2 text-xs text-muted-foreground">
              Meilleurs parrains : {m.referral.top_referrers.map((r) => `${r.code} (${r.signups})`).join(", ")}
            </p>
          )}
        </Block>
        <Block title="Coûts IA">
          <Row label="Coût total estimé" value={usd(m.ai.cost_usd)} sub={`${m.ai.calls} appels`} />
          <Row label="Par génération décomptée" value={usd(perGen)} sub={`${m.ai.generations} générations`} />
          <Row label="Par utilisateur actif IA" value={usd(m.ai.users_with_usage ? m.ai.cost_usd / m.ai.users_with_usage : 0)} sub={`${m.ai.users_with_usage} utilisateurs`} />
          {Object.entries(m.ai.by_feature ?? {}).map(([k, v]) => (
            <Row key={k} label={`· ${k}`} value={usd(v.cost_usd)} sub={`${v.calls} appels`} />
          ))}
        </Block>
      </div>
    </div>
  );
}

/* ── Éléments de mise en page ─────────────────────────────────────────────── */

function Delta({ current, previous, onAccent = false }: { current: number; previous: number | undefined; onAccent?: boolean }) {
  const pct = previous == null ? null : deltaPct(current, previous);
  if (pct == null) {
    if (!previous && current > 0 && previous != null) {
      return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", onAccent ? "bg-white/20" : "bg-muted")}>Nouveau</span>;
    }
    return null;
  }
  const up = pct > 0, flat = pct === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        onAccent ? "bg-white/20 text-white" : flat ? "bg-muted text-muted-foreground" : up ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? "+" : ""}
      {pct} %
    </span>
  );
}

function StatTile({ label, value, previous, trend, sub, format = "int" }: {
  label: string;
  value: number;
  previous?: number;
  trend: number[];
  sub?: string;
  format?: "int" | "fcfa";
}) {
  return (
    <section className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-1.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Delta current={value} previous={previous} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums sm:text-3xl">
            {formatValue(value, format, true).replace(/ FCFA$/, "")}
            {format === "fcfa" && <span className="ml-1 text-sm font-semibold text-muted-foreground">FCFA</span>}
          </p>
          {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        <Sparkline values={trend} className="hidden shrink-0 sm:block" />
      </div>
    </section>
  );
}

function Panel({ title, subtitle, icon, className, children }: { title: string; subtitle?: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">{icon}</span>}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MiniGrid({ items }: { items: { label: string; value: string; sub?: string; delta?: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl bg-muted/60 p-3">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold tabular-nums">{it.value}</span>
            {it.delta}
          </dd>
          {it.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{it.sub}</p>}
        </div>
      ))}
    </dl>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <p className="shrink-0 text-base font-semibold tabular-nums">{typeof value === "number" ? formatValue(value) : value}</p>
    </div>
  );
}
