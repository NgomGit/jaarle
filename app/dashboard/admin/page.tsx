import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { formatFcfa } from "@/lib/billing/format";
import { cn } from "@/lib/utils";

// Tableau de bord ADMIN (réservé aux comptes account_profiles.is_admin = true).
// Pour s'ajouter : dans le SQL Editor Supabase →
//   update public.account_profiles set is_admin = true
//   where user_id = (select id from auth.users where phone = '221XXXXXXXXX');

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
  const { data, error } = await createAdminClient().rpc("admin_metrics", { p_days: days });
  if (error || !data) {
    return <p className="text-sm text-destructive">Métriques indisponibles : {error?.message}</p>;
  }
  const m = data as Metrics;
  const kpi = m.engagement.active_shops_7d;
  const kpiPrev = m.engagement.active_shops_prev_7d;
  const usd = (n: number) => `${Number(n).toFixed(2)} $`;
  const perGen = m.ai.generations > 0 ? m.ai.cost_usd / m.ai.generations : 0;

  return (
    <div className="mx-auto w-full max-w-5xl pb-24 md:pb-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Admin — lancement terrain</h1>
          <p className="text-sm text-muted-foreground">Sur les {days} derniers jours (sauf mention).</p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-muted p-1">
          {PERIODS.map((d) => (
            <Link
              key={d}
              href={`/dashboard/admin?jours=${d}`}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", d === days ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {d} j
            </Link>
          ))}
        </div>
      </div>

      {/* KPI principal */}
      <section className="mb-5 rounded-2xl border border-primary/30 bg-accent p-5 text-accent-foreground">
        <p className="text-xs font-bold uppercase tracking-wide">KPI principal</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{kpi}</p>
        <p className="text-sm">
          boutiques ayant reçu au moins un contact client (clic WhatsApp, appel) sur les 7 derniers jours
          <span className="opacity-80"> · 7 jours précédents : {kpiPrev}</span>
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Acquisition">
          <Row label="Nouveaux comptes" value={m.acquisition.new_accounts} sub={`${m.acquisition.total_accounts} au total`} />
          <Row label="Nouvelles boutiques" value={m.acquisition.new_shops} />
          <Row label="Boutiques publiées" value={m.acquisition.shops_published} sub={`${m.acquisition.total_published_shops} en ligne au total`} />
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
          <Row label="Affiches générées" value={m.engagement.posters_generated} />
          <Row label="Packs de contenus générés" value={m.engagement.contents_generated} />
        </Block>
        <Block title="Monétisation (aujourd'hui / période)">
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

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
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
      <p className="shrink-0 font-mono text-base font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</p>
    </div>
  );
}
