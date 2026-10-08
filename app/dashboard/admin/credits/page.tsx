import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDateTime } from "@/lib/admin/market";
import { formatFcfa } from "@/lib/billing/format";
import { usageUnits } from "@/lib/billing/usage";
import { DEFAULT_TIER } from "@/lib/pricing";
import {
  ACTION_LABELS,
  KIND_LABELS,
  aggregateByUser,
  isStuckBalance,
  packYield,
  periodTotals,
  type CreditPack,
  type LedgerRow,
  type UsageRow,
} from "@/lib/admin/credits";
import { cn } from "@/lib/utils";

// Crédits : ce que les clients achètent, ce que chaque génération leur coûte, et les soldes
// « bloqués » (ex. pack de 5 crédits, affiche à 2 crédits → 2 affiches + 1 crédit inutilisable).
// Lecture seule ; pour ajouter / retirer des crédits, passer par la fiche du compte.

export const dynamic = "force-dynamic";

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 0, label: "Tout" },
];
const FILTERS = [
  { key: "tous", label: "Tous" },
  { key: "bloques", label: "Solde bloqué" },
  { key: "actifs", label: "Avec crédits" },
  { key: "vides", label: "Solde à 0" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const MAX_LEDGER = 20000;
const JOURNAL_SIZE = 60;

export default async function AdminCreditsPage({ searchParams }: { searchParams: { jours?: string; filtre?: string } }) {
  await requireAdmin();
  const admin = createAdminClient();

  const days = PERIODS.some((p) => p.days === Number(searchParams.jours)) ? Number(searchParams.jours) : 30;
  const filter: FilterKey = FILTERS.some((f) => f.key === searchParams.filtre) ? (searchParams.filtre as FilterKey) : "tous";
  const sinceIso = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const posterCost = usageUnits("poster_generate", DEFAULT_TIER);

  const [ledgerRes, packsRes] = await Promise.all([
    admin
      .from("credit_ledger")
      .select("id, user_id, delta, kind, usage_event_id, order_id, note, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_LEDGER),
    admin.from("credit_packs").select("key, name, credits, price_fcfa").eq("is_active", true).order("sort"),
  ]);
  if (ledgerRes.error) {
    return <p className="text-sm text-destructive">Crédits indisponibles : {ledgerRes.error.message}</p>;
  }
  const ledger = (ledgerRes.data ?? []) as LedgerRow[];
  const packs = (packsRes.data ?? []) as CreditPack[];

  // Événements de consommation liés (action, affiche) + leurs remboursements.
  const eventIds = Array.from(new Set(ledger.map((r) => r.usage_event_id).filter((x): x is string => !!x)));
  const events = new Map<string, UsageRow>();
  for (let i = 0; i < eventIds.length; i += 300) {
    const chunk = eventIds.slice(i, i + 300);
    const { data } = await admin.from("usage_events").select("id, action, units, creation_id, refund_of").in("id", chunk);
    for (const e of (data ?? []) as UsageRow[]) events.set(e.id, e);
  }
  const refundOf = Array.from(events.keys());
  for (let i = 0; i < refundOf.length; i += 300) {
    const { data } = await admin.from("usage_events").select("id, action, units, creation_id, refund_of").in("refund_of", refundOf.slice(i, i + 300));
    for (const e of (data ?? []) as UsageRow[]) events.set(e.id, e);
  }

  const users = aggregateByUser(ledger, events).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  const totals = periodTotals(ledger, sinceIso);
  const inCirculation = users.reduce((s, u) => s + Math.max(u.balance, 0), 0);
  const stuck = users.filter((u) => isStuckBalance(u.balance, posterCost));
  const stuckCredits = stuck.reduce((s, u) => s + u.balance, 0);

  const shown = users.filter((u) =>
    filter === "bloques" ? isStuckBalance(u.balance, posterCost) : filter === "actifs" ? u.balance >= posterCost : filter === "vides" ? u.balance <= 0 : true
  );
  const journal = ledger.filter((r) => !sinceIso || r.created_at >= sinceIso).slice(0, JOURNAL_SIZE);

  // Noms : comptes affichés + journal (plafonné), boutiques, titres d'affiches.
  const nameIds = Array.from(new Set([...shown.slice(0, 200).map((u) => u.userId), ...journal.map((r) => r.user_id)]));
  const creationIds = Array.from(
    new Set(journal.map((r) => (r.usage_event_id ? events.get(r.usage_event_id)?.creation_id : null)).filter((x): x is string => !!x))
  );
  const [userResults, shopsRes, creationsRes] = await Promise.all([
    Promise.all(nameIds.map((id) => admin.auth.admin.getUserById(id))),
    nameIds.length ? admin.from("shops").select("owner_id, name").in("owner_id", nameIds) : Promise.resolve({ data: [] }),
    creationIds.length ? admin.from("creations").select("id, product_name").in("id", creationIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>();
  userResults.forEach((r, i) => {
    const u = r.data?.user;
    const full = typeof u?.user_metadata?.full_name === "string" ? u.user_metadata.full_name : null;
    names.set(nameIds[i], full || formatPhone(u?.phone) || "Sans nom");
  });
  const shops = new Map(((shopsRes.data ?? []) as { owner_id: string; name: string }[]).map((s) => [s.owner_id, s.name]));
  const creations = new Map(((creationsRes.data ?? []) as { id: string; product_name: string }[]).map((c) => [c.id, c.product_name]));

  const qs = (p: { jours?: number; filtre?: string }) => {
    const sp = new URLSearchParams({ jours: String(p.jours ?? days), filtre: p.filtre ?? filter });
    return `/dashboard/admin/credits?${sp.toString()}`;
  };

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Crédits</h1>
          <p className="text-sm text-muted-foreground">
            Achats, consommation et soldes des clients. Une affiche coûte actuellement <strong className="text-foreground">{posterCost} crédits</strong> (nouvelle version incluse).
          </p>
        </div>
        <nav className="inline-flex rounded-xl border border-border bg-muted p-1" aria-label="Période">
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={qs({ jours: p.days })}
              aria-current={p.days === days ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", p.days === days ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Crédits achetés" value={totals.bought} sub={`${totals.buyers} acheteur${totals.buyers > 1 ? "s" : ""}`} />
        <Tile label="Crédits offerts" value={totals.offered} sub="admin, bonus, promo" />
        <Tile label="Crédits consommés" value={totals.used - totals.refunded} sub={totals.refunded ? `${totals.refunded} remboursés (échecs)` : "nets des remboursements"} />
        <Tile label="En circulation" value={inCirculation} sub="soldes actuels, tous clients" />
        <Tile
          label="Soldes bloqués"
          value={stuck.length}
          sub={`${stuckCredits} crédit${stuckCredits > 1 ? "s" : ""} < ${posterCost} (inutilisables)`}
          warn={stuck.length > 0}
        />
      </div>
      {days > 0 && <p className="mt-2 text-xs text-muted-foreground">Achetés, offerts et consommés : sur la période. En circulation et soldes bloqués : à l&apos;instant.</p>}

      {/* Ce que donne chaque pack */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Ce que donne chaque pack</h2>
        <p className="mb-4 text-sm text-muted-foreground">Nombre d&apos;affiches réellement possibles au coût actuel de {posterCost} crédits par affiche.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {packs.map((p) => {
            const y = packYield(p.credits, posterCost);
            return (
              <div key={p.key} className={cn("rounded-xl border p-4", y.leftover ? "border-warning/40 bg-warning/5" : "border-border")}>
                <p className="text-sm font-medium">
                  {p.name} · {formatFcfa(p.price_fcfa)}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {y.posters} affiche{y.posters > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {y.posters > 0 ? `${formatFcfa(Math.round(p.price_fcfa / y.posters))} l'affiche` : "—"}
                  {y.leftover > 0 && <span className="font-medium text-warning"> · {y.leftover} crédit{y.leftover > 1 ? "s" : ""} restant inutilisable</span>}
                </p>
              </div>
            );
          })}
          {packs.length === 0 && <p className="text-sm text-muted-foreground">Aucun pack actif.</p>}
        </div>
      </section>

      {/* Clients */}
      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Clients avec des crédits ({users.length})</h2>
          <nav className="flex flex-wrap gap-1" aria-label="Filtre">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={qs({ filtre: f.key })}
                aria-current={f.key === filter ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  f.key === filter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 text-right font-medium">Achetés</th>
                <th className="px-3 py-2.5 text-right font-medium">Offerts</th>
                <th className="px-3 py-2.5 text-right font-medium">Consommés</th>
                <th className="px-3 py-2.5 text-right font-medium">Affiches</th>
                <th className="px-3 py-2.5 text-right font-medium">Solde</th>
                <th className="px-3 py-2.5 font-medium">Dernier mouvement</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 200).map((u) => {
                const blocked = isStuckBalance(u.balance, posterCost);
                const other = u.refunded + u.expired + u.removed;
                return (
                  <tr key={u.userId} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/admin/comptes/${u.userId}`} className="font-medium hover:text-primary hover:underline">
                        {names.get(u.userId) ?? "…"}
                      </Link>
                      {shops.get(u.userId) && <p className="text-xs text-muted-foreground">{shops.get(u.userId)}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{u.bought || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{u.offered || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" title={other ? `remboursés ${u.refunded} · expirés ${u.expired} · retirés ${u.removed}` : undefined}>
                      {u.used - u.refunded || "—"}
                      {other > 0 && <span className="text-xs text-muted-foreground"> *</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{u.postersViaCredits || "—"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-semibold tabular-nums">{u.balance}</span>
                        {blocked && <Badge variant="warning">Bloqué</Badge>}
                        {!blocked && u.balance >= posterCost && (
                          <span className="text-xs text-muted-foreground">
                            = {Math.floor(u.balance / posterCost)} aff.
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{frDateTime(u.lastAt)}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucun client dans ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          « Affiches » = affiches payées en crédits (hors générations échouées). « Bloqué » = il reste des crédits, mais moins que le prix d&apos;une affiche. * survole pour le détail (remboursés, expirés, retirés).
        </p>
        {stuck.length > 0 && filter !== "bloques" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              {stuck.length} client{stuck.length > 1 ? "s ont" : " a"} un solde inutilisable.{" "}
              <Link href={qs({ filtre: "bloques" })} className="font-medium text-primary hover:underline">
                Voir la liste
              </Link>{" "}
              — tu peux compléter depuis la fiche du compte (« Crédits de génération »).
            </span>
          </p>
        )}
      </section>

      {/* Journal */}
      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Derniers mouvements</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Détail</th>
                <th className="px-3 py-2.5 text-right font-medium">Crédits</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((r) => {
                const ev = r.usage_event_id ? events.get(r.usage_event_id) : undefined;
                const title = ev?.creation_id ? creations.get(ev.creation_id) : undefined;
                const detail = ev ? [ACTION_LABELS[ev.action] ?? ev.action, title ? `« ${title} »` : null].filter(Boolean).join(" · ") : r.note;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{frDateTime(r.created_at)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/admin/comptes/${r.user_id}`} className="hover:text-primary hover:underline">
                        {names.get(r.user_id) ?? "…"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{KIND_LABELS[r.kind] ?? r.kind}</td>
                    <td className="px-3 py-2 text-muted-foreground">{detail || "—"}</td>
                    <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", r.delta > 0 ? "text-success" : "text-foreground")}>
                      {r.delta > 0 ? `+${r.delta}` : r.delta}
                    </td>
                  </tr>
                );
              })}
              {journal.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Aucun mouvement sur la période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: number; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", warn ? "border-warning/40" : "border-border")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", warn && "text-warning")}>{value.toLocaleString("fr-FR")}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function formatPhone(phone: string | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("221")) return `+221 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return d ? `+${d}` : "";
}
