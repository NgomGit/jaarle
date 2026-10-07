import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Coins, Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionFlash } from "@/components/admin/admin-nav";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDate, frDateTime } from "@/lib/admin/market";
import { getEntitlementsFor } from "@/lib/billing/entitlements";
import { formatFcfa } from "@/lib/billing/format";
import { cancelSubscriptionAction, grantCreditsAction, grantPlanAction } from "../actions";

// Fiche vendeur : formule en cours, abonnements (payés, promos, offerts), crédits, et actions
// admin — offrir une formule pour une durée, arrêter un abonnement, ajouter / retirer des crédits.

export const dynamic = "force-dynamic";

type Sub = {
  id: string;
  plan_key: string;
  status: string;
  starts_at: string;
  ends_at: string;
  source: string;
  price_paid: number;
  note: string | null;
  created_at: string;
};
type Ledger = { id: string; delta: number; kind: string; note: string | null; expires_at: string | null; created_at: string };
type Plan = { key: string; name: string; sort: number; price_fcfa: number };
type Log = { id: string; action: string; details: Record<string, unknown> | null; created_at: string };

const SOURCE_LABEL: Record<string, string> = { payment: "Payé", promotion: "Promo", admin: "Offert (admin)", bonus: "Bonus" };
const KIND_LABEL: Record<string, string> = {
  purchase: "Achat",
  generation: "Génération",
  bonus: "Bonus",
  refund: "Remboursement",
  promotion: "Promo",
  expiration: "Expiration",
  admin: "Admin",
};
const ACTION_LABEL: Record<string, string> = {
  "subscription.grant": "Formule offerte",
  "subscription.cancel": "Abonnement arrêté",
  "credits.grant": "Crédits ajoutés",
  "credits.remove": "Crédits retirés",
  password_reset: "Mot de passe réinitialisé",
};
const DURATIONS = [7, 14, 30, 60, 90, 180, 365];

const inputCls = "h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground";
const labelCls = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

function formatPhone(phone: string | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("221")) return `+221 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return d ? `+${d}` : "—";
}

function subState(s: Sub, now: number): { label: string; variant: "success" | "accent" | "neutral" | "destructive" } {
  if (s.status === "canceled") return { label: "Arrêté", variant: "destructive" };
  if (s.status === "refunded") return { label: "Remboursé", variant: "destructive" };
  if (new Date(s.ends_at).getTime() <= now) return { label: "Terminé", variant: "neutral" };
  if (new Date(s.starts_at).getTime() > now) return { label: "À venir", variant: "accent" };
  return { label: "En cours", variant: "success" };
}

export default async function AdminAccountPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; erreur?: string } }) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(params.id)) notFound();
  const admin = createAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(params.id);
  const user = userData?.user;
  if (!user) notFound();

  const [ent, plansRes, subsRes, ledgerRes, shopRes, logRes] = await Promise.all([
    getEntitlementsFor(user.id),
    admin.from("plans").select("key, name, sort, price_fcfa").order("sort"),
    admin
      .from("subscriptions")
      .select("id, plan_key, status, starts_at, ends_at, source, price_paid, note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("credit_ledger").select("id, delta, kind, note, expires_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    admin.from("shops").select("name, slug").eq("owner_id", user.id).maybeSingle(),
    admin
      .from("admin_actions")
      .select("id, action, details, created_at")
      .eq("target_type", "user")
      .eq("target_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const plans = (plansRes.data ?? []) as Plan[];
  const paidPlans = plans.filter((p) => p.key !== "free");
  const planName = new Map(plans.map((p) => [p.key, p.name]));
  const subs = (subsRes.data ?? []) as Sub[];
  const ledger = (ledgerRes.data ?? []) as Ledger[];
  const logs = (logRes.data ?? []) as Log[];
  const shop = shopRes.data as { name: string; slug: string } | null;
  const name = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  const now = Date.now();
  const billingReady = ent.billingEnabled && !plansRes.error;

  return (
    <div className="pb-24 md:pb-8">
      <Link href="/dashboard/admin/comptes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Comptes
      </Link>

      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">{name ?? "Sans nom"}</h1>
        <p className="text-sm tabular-nums text-muted-foreground">
          {formatPhone(user.phone)}
          {shop && (
            <>
              {" · "}
              <Link href={`/boutique/${shop.slug}`} target="_blank" className="font-medium text-primary hover:underline">
                {shop.name}
              </Link>
            </>
          )}
          {" · "}inscrit le {frDate(user.created_at)}
        </p>
      </div>

      <ActionFlash ok={searchParams.ok} error={searchParams.erreur} />

      {!billingReady && (
        <p className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          La facturation n&apos;est pas active (migration 0019 absente) : rien ne peut être modifié ici.
        </p>
      )}

      {/* Situation actuelle */}
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Formule appliquée</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold">
            {ent.planName}
            {ent.subscription && <Badge variant="neutral">{SOURCE_LABEL[ent.subscription.source] ?? ent.subscription.source}</Badge>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ent.subscription ? `jusqu'au ${frDate(ent.subscription.activeUntil)}` : "aucun abonnement en cours"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Générations ce mois</p>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {ent.usedGenerations} / {ent.monthlyGenerations ?? "∞"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">période jusqu&apos;au {frDate(ent.periodEnd)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Crédits</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{ent.credits}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ent.productsCount} produit{ent.productsCount > 1 ? "s" : ""}
            {ent.productsLimit != null ? ` / ${ent.productsLimit}` : ""}
          </p>
        </div>
      </section>

      {billingReady && (
        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          {/* Offrir une formule */}
          <form action={grantPlanAction} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Gift className="h-4 w-4 text-primary" /> Offrir une formule
            </h2>
            <input type="hidden" name="userId" value={user.id} />
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                Formule
                <select name="plan" defaultValue={paidPlans[0]?.key} className={inputCls}>
                  {paidPlans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({formatFcfa(p.price_fcfa)}/mois)
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                Durée
                <select name="days" defaultValue="30" className={inputCls}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} jours
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="flex flex-col gap-1.5 text-sm">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Début</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="start" value="now" defaultChecked /> Maintenant
                <span className="text-xs text-muted-foreground">(s&apos;applique tout de suite si c&apos;est la formule la plus haute)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="start" value="after" /> À la suite de la période en cours de cette formule
              </label>
            </fieldset>
            <label className={labelCls}>
              Raison (journal)
              <input name="note" required maxLength={300} placeholder="Ex. geste commercial, test, partenaire…" className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notify" defaultChecked /> Prévenir le vendeur (notification)
            </label>
            <Button type="submit" variant="accent" className="self-start">
              Offrir
            </Button>
          </form>

          {/* Crédits */}
          <form action={grantCreditsAction} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Coins className="h-4 w-4 text-primary" /> Crédits de génération
            </h2>
            <input type="hidden" name="userId" value={user.id} />
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                Nombre (négatif pour retirer)
                <input type="number" name="amount" required min={-500} max={500} step={1} defaultValue={5} className={inputCls} />
              </label>
              <label className={labelCls}>
                Expire après (jours, facultatif)
                <input type="number" name="expiresDays" min={1} max={366} step={1} placeholder="Jamais" className={inputCls} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">1 crédit = 1 génération, utilisée quand le quota du mois est épuisé.</p>
            <label className={labelCls}>
              Raison (journal)
              <input name="note" required maxLength={300} placeholder="Ex. affiche ratée, compensation…" className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notify" defaultChecked /> Prévenir le vendeur (si ajout)
            </label>
            <Button type="submit" variant="secondary" className="self-start">
              Valider
            </Button>
          </form>
        </section>
      )}

      {/* Abonnements */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <CalendarClock className="h-4 w-4 text-muted-foreground" /> Abonnements
        </h2>
        {subs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Aucun abonnement : formule Gratuite.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subs.map((s) => {
              const st = subState(s, now);
              const stoppable = s.status === "active" && new Date(s.ends_at).getTime() > now;
              return (
                <li key={s.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {planName.get(s.plan_key) ?? s.plan_key}
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <Badge variant="neutral">{SOURCE_LABEL[s.source] ?? s.source}</Badge>
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {frDate(s.starts_at)} → {frDate(s.ends_at)}
                      {s.price_paid > 0 && ` · ${formatFcfa(s.price_paid)}`}
                    </div>
                    {s.note && <div className="mt-0.5 text-xs text-muted-foreground">{s.note}</div>}
                  </div>
                  {stoppable && billingReady && (
                    <form action={cancelSubscriptionAction} className="flex shrink-0 items-center gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="subscriptionId" value={s.id} />
                      <input name="reason" required maxLength={300} placeholder="Raison de l'arrêt" className={`${inputCls} h-8 w-44 text-xs`} />
                      <Button type="submit" size="sm" variant="ghost">
                        Arrêter
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Crédits : historique */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Mouvements de crédits</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun mouvement.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {ledger.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{KIND_LABEL[l.kind] ?? l.kind}</span>
                  {l.note && <span className="text-muted-foreground"> · {l.note}</span>}
                  <div className="text-xs text-muted-foreground">
                    {frDateTime(l.created_at)}
                    {l.expires_at && ` · expire le ${frDate(l.expires_at)}`}
                  </div>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${l.delta > 0 ? "text-success" : "text-muted-foreground"}`}>
                  {l.delta > 0 ? `+${l.delta}` : l.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Journal admin */}
      {logs.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Journal admin</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="text-muted-foreground">
                <span className="tabular-nums">{frDateTime(l.created_at)}</span> · <span className="font-medium text-foreground">{ACTION_LABEL[l.action] ?? l.action}</span>
                {typeof l.details?.note === "string" && ` — ${l.details.note}`}
                {typeof l.details?.reason === "string" && ` — ${l.details.reason}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
