import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDateTime } from "@/lib/admin/market";
import { formatFcfa } from "@/lib/billing/format";
import {
  FEATURE_LABELS,
  aggregateAiCosts,
  fcfaPerUsd,
  per30Days,
  shareLevel,
  shareOfPrice,
  type AiCallRow,
  type PlanRow,
  type SubRow,
} from "@/lib/admin/ai-costs";
import { cn } from "@/lib/utils";

// Coûts IA : ce que chaque vendeur coûte réellement (table ai_calls), par formule, comparé au prix
// de sa formule. Lecture seule, sans migration. Les montants sont les coûts ESTIMÉS enregistrés
// à chaque appel (au token près pour Claude, forfait pour l'image des affiches).

export const dynamic = "force-dynamic";

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
];
const PAGE = 1000; // PostgREST renvoie au plus 1 000 lignes par requête
const MAX_CALLS = 100_000;
const TOP_USERS = 50;

export default async function AdminAiCostsPage({ searchParams }: { searchParams: { jours?: string } }) {
  await requireAdmin();
  const admin = createAdminClient();
  const days = PERIODS.some((p) => p.days === Number(searchParams.jours)) ? Number(searchParams.jours) : 30;
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const nowIso = new Date().toISOString();
  const rate = fcfaPerUsd();

  // 1. Appels IA de la période (par pages de 1 000).
  const calls: AiCallRow[] = [];
  let truncated = false;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("ai_calls")
      .select("user_id, feature, model, est_cost_usd, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return <p className="text-sm text-destructive">Coûts IA indisponibles : {error.message}</p>;
    calls.push(...((data ?? []) as AiCallRow[]));
    if (!data || data.length < PAGE) break;
    if (calls.length >= MAX_CALLS) {
      truncated = true;
      break;
    }
  }

  // Comptes admin (tests de l'équipe) exclus des chiffres : ils fausseraient les moyennes.
  const { data: adminRows } = await admin.from("account_profiles").select("user_id").eq("is_admin", true);
  const adminIds = new Set(((adminRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const excludedCalls = calls.filter((c) => c.user_id && adminIds.has(c.user_id)).length;
  if (excludedCalls) {
    const kept = calls.filter((c) => !(c.user_id && adminIds.has(c.user_id)));
    calls.length = 0;
    calls.push(...kept);
  }

  // 2. Formules et abonnements des vendeurs concernés + abonnés actuels.
  const [plansRes, currentRes, paidRes] = await Promise.all([
    admin.from("plans").select("key, name, price_fcfa, sort"),
    admin.from("subscriptions").select("user_id, plan_key").eq("status", "active").lte("starts_at", nowIso).gt("ends_at", nowIso),
    admin.from("subscriptions").select("price_paid, source").eq("status", "active").gte("created_at", sinceIso).in("source", ["payment", "promotion"]),
  ]);
  const plans = new Map(((plansRes.data ?? []) as PlanRow[]).map((p) => [p.key, p]));
  const userIds = Array.from(new Set(calls.map((c) => c.user_id).filter((x): x is string => !!x)));
  const subsByUser = new Map<string, SubRow[]>();
  for (let i = 0; i < userIds.length; i += 300) {
    const { data } = await admin
      .from("subscriptions")
      .select("user_id, plan_key, status, starts_at, ends_at")
      .in("user_id", userIds.slice(i, i + 300))
      .lt("starts_at", nowIso)
      .gt("ends_at", sinceIso);
    for (const s of (data ?? []) as SubRow[]) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
  }
  // Abonnés actuels par formule (formule la plus haute si plusieurs abonnements actifs).
  const currentByUser = new Map<string, string>();
  for (const s of (currentRes.data ?? []) as { user_id: string; plan_key: string }[]) {
    const prev = currentByUser.get(s.user_id);
    if (!prev || (plans.get(s.plan_key)?.sort ?? 0) > (plans.get(prev)?.sort ?? 0)) currentByUser.set(s.user_id, s.plan_key);
  }
  const subscribers = new Map<string, number>();
  for (const plan of currentByUser.values()) subscribers.set(plan, (subscribers.get(plan) ?? 0) + 1);
  const revenueFcfa = ((paidRes.data ?? []) as { price_paid: number }[]).reduce((s, r) => s + (r.price_paid || 0), 0);

  const summary = aggregateAiCosts(calls, subsByUser, plans);
  const totalFcfa = Math.round(summary.totalUsd * rate);

  // 3. Noms des vendeurs les plus coûteux.
  const topUsers = summary.byUser.slice(0, TOP_USERS);
  const [userResults, shopsRes] = await Promise.all([
    Promise.all(topUsers.map((u) => admin.auth.admin.getUserById(u.userId))),
    topUsers.length ? admin.from("shops").select("owner_id, name").in("owner_id", topUsers.map((u) => u.userId)) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>();
  userResults.forEach((r, i) => {
    const u = r.data?.user;
    const full = typeof u?.user_metadata?.full_name === "string" ? u.user_metadata.full_name : null;
    names.set(topUsers[i].userId, full || formatPhone(u?.phone) || "Sans nom");
  });
  const shops = new Map(((shopsRes.data ?? []) as { owner_id: string; name: string }[]).map((s) => [s.owner_id, s.name]));

  const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
  const fcfa = (v: number) => formatFcfa(Math.round(v * rate));
  const planName = (key: string) => plans.get(key)?.name ?? key;
  const losses = summary.byUser.filter((u) => shareLevel(shareOfPrice(per30Days(u.costUsd, days), plans.get(u.plan)?.price_fcfa ?? 0, rate)) === "loss");

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Coûts IA</h1>
          <p className="text-sm text-muted-foreground">
            Ce que coûte chaque vendeur en IA (Claude, image des affiches), comparé au prix de sa formule. Conversion : 1 $ = {rate} F.
            {excludedCalls > 0 && ` Comptes admin exclus (${excludedCalls.toLocaleString("fr-FR")} appels de test).`}
          </p>
        </div>
        <nav className="inline-flex rounded-xl border border-border bg-muted p-1" aria-label="Période">
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={`/dashboard/admin/couts-ia?jours=${p.days}`}
              aria-current={p.days === days ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", p.days === days ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {truncated && (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          Plus de {MAX_CALLS.toLocaleString("fr-FR")} appels sur la période : seuls les premiers sont comptés. Choisis une période plus courte.
        </p>
      )}

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Coût IA total" value={formatFcfa(totalFcfa)} sub={`${usd(summary.totalUsd)} · ${summary.calls.toLocaleString("fr-FR")} appels`} />
        <Tile label="Vendeurs ayant utilisé l'IA" value={summary.usersWithCalls.toLocaleString("fr-FR")} sub={summary.usersWithCalls ? `${fcfa(summary.totalUsd / summary.usersWithCalls)} en moyenne` : "—"} />
        <Tile label="Abonnements encaissés" value={formatFcfa(revenueFcfa)} sub="payés ou promo, créés sur la période" />
        <Tile
          label="Vendeurs à perte"
          value={losses.length.toLocaleString("fr-FR")}
          sub="coût IA ramené à 30 j ≥ prix de la formule"
          warn={losses.length > 0}
        />
      </div>

      {/* Par formule */}
      <section className="mt-6">
        <h2 className="mb-1 font-semibold">Par formule</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Coût par vendeur <strong className="text-foreground">ramené à 30 jours</strong> (sur {days} jours), comparé au prix mensuel de la formule. Chaque appel est compté dans la formule active au moment de l&apos;appel.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Formule</th>
                <th className="px-3 py-2.5 text-right font-medium">Abonnés actuels</th>
                <th className="px-3 py-2.5 text-right font-medium">Vendeurs actifs IA</th>
                <th className="px-3 py-2.5 text-right font-medium">Moyenne / 30 j</th>
                <th className="px-3 py-2.5 text-right font-medium">Médiane / 30 j</th>
                <th className="px-3 py-2.5 text-right font-medium">90 % sous / 30 j</th>
                <th className="px-3 py-2.5 text-right font-medium">Maximum / 30 j</th>
                <th className="px-3 py-2.5 text-right font-medium">Total période</th>
              </tr>
            </thead>
            <tbody>
              {summary.byPlan.map((p) => {
                const price = plans.get(p.plan)?.price_fcfa ?? 0;
                return (
                  <tr key={p.plan} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{planName(p.plan)}</p>
                      <p className="text-xs text-muted-foreground">{price ? `${formatFcfa(price)} / mois` : "gratuit"}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.plan === "free" ? "—" : (subscribers.get(p.plan) ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.activeUsers}</td>
                    <ShareCell usd={per30Days(p.avgUsd, days)} price={price} rate={rate} />
                    <ShareCell usd={per30Days(p.medianUsd, days)} price={price} rate={rate} />
                    <ShareCell usd={per30Days(p.p90Usd, days)} price={price} rate={rate} />
                    <ShareCell usd={per30Days(p.maxUsd, days)} price={price} rate={rate} />
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fcfa(p.totalUsd)}
                      <p className="text-xs text-muted-foreground">{p.calls.toLocaleString("fr-FR")} appels</p>
                    </td>
                  </tr>
                );
              })}
              {summary.byPlan.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucun appel IA sur la période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pourcentage = part du prix de la formule. <span className="text-warning">Orange</span> : 50 % ou plus. <span className="text-destructive">Rouge</span> : le vendeur coûte plus qu&apos;il ne paie. « Vendeurs actifs IA » ne compte que ceux qui ont fait au moins un appel ; les abonnés sans appel ne coûtent rien.
        </p>
      </section>

      {/* Par fonction */}
      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Par fonction</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Fonction</th>
                <th className="px-3 py-2.5 text-right font-medium">Appels</th>
                <th className="px-3 py-2.5 text-right font-medium">Coût moyen / appel</th>
                <th className="px-3 py-2.5 text-right font-medium">Coût total</th>
                <th className="px-3 py-2.5 text-right font-medium">Part</th>
              </tr>
            </thead>
            <tbody>
              {summary.byFeature.map((f) => (
                <tr key={f.feature} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    {FEATURE_LABELS[f.feature] ?? f.feature}
                    {FEATURE_LABELS[f.feature] && <span className="ml-2 text-xs text-muted-foreground">{f.feature}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{f.calls.toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fcfa(f.avgPerCallUsd)} <span className="text-xs text-muted-foreground">({usd(f.avgPerCallUsd)})</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fcfa(f.totalUsd)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{summary.totalUsd ? `${Math.round((100 * f.totalUsd) / summary.totalUsd)} %` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary.anonymousUsd > 0 && <p className="mt-2 text-xs text-muted-foreground">Dont {fcfa(summary.anonymousUsd)} sans vendeur rattaché (tâches système, comptes supprimés).</p>}
      </section>

      {/* Vendeurs les plus coûteux */}
      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Vendeurs les plus coûteux ({Math.min(TOP_USERS, summary.byUser.length)})</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Vendeur</th>
                <th className="px-3 py-2.5 font-medium">Formule</th>
                <th className="px-3 py-2.5 text-right font-medium">Appels</th>
                <th className="px-3 py-2.5 text-right font-medium">Coût période</th>
                <th className="px-3 py-2.5 text-right font-medium">Ramené à 30 j</th>
                <th className="px-3 py-2.5 font-medium">Surtout</th>
                <th className="px-3 py-2.5 font-medium">Dernier appel</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((u) => {
                const price = plans.get(u.plan)?.price_fcfa ?? 0;
                return (
                  <tr key={u.userId} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/admin/comptes/${u.userId}`} className="font-medium hover:text-primary hover:underline">
                        {names.get(u.userId) ?? "…"}
                      </Link>
                      {shops.get(u.userId) && <p className="text-xs text-muted-foreground">{shops.get(u.userId)}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={u.plan === "free" ? "neutral" : "accent"}>{planName(u.plan)}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{u.calls}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fcfa(u.costUsd)}</td>
                    <ShareCell usd={per30Days(u.costUsd, days)} price={price} rate={rate} />
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{FEATURE_LABELS[u.topFeature] ?? u.topFeature}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{frDateTime(u.lastAt)}</td>
                  </tr>
                );
              })}
              {topUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucun vendeur sur la période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {losses.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              {losses.length} vendeur{losses.length > 1 ? "s coûtent" : " coûte"} plus en IA que le prix de {losses.length > 1 ? "leur" : "sa"} formule (ramené à 30 jours).
            </span>
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Coûts estimés au moment de l&apos;appel : au token près pour Claude (tarifs de lib/billing/usage.ts), forfait par affiche pour l&apos;image. À recouper avec les factures Anthropic et OpenRouter.
        </p>
      </section>
    </div>
  );
}

function ShareCell({ usd, price, rate }: { usd: number; price: number; rate: number }) {
  const share = shareOfPrice(usd, price, rate);
  const level = shareLevel(share);
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      {formatFcfa(Math.round(usd * rate))}
      {share != null && (
        <p className={cn("text-xs", level === "loss" ? "font-semibold text-destructive" : level === "warn" ? "text-warning" : "text-muted-foreground")}>
          {Math.round(share * 100)} % du prix
        </p>
      )}
    </td>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", warn ? "border-destructive/40" : "border-border")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", warn && "text-destructive")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function formatPhone(phone: string | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("221")) return `+221 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return d ? `+${d}` : "";
}
