import Link from "next/link";
import { ExternalLink, Flag, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionFlash } from "@/components/admin/admin-nav";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDate, frDateTime, REPORT_STATUS_LABELS } from "@/lib/admin/market";
import { REPORT_REASONS } from "@/lib/shops/reports";
import { cn } from "@/lib/utils";
import { reactivateShopAction, suspendShopAction, updateReportAction } from "../actions";
import { ModerationNotice } from "../moderation/notice";

// Signalements des visiteurs (bouton « Signaler », migration 0020) regroupés par boutique,
// + suspension / réactivation des boutiques (migration 0026).

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "a-traiter", label: "À traiter", statuses: ["open", "reviewing"] },
  { key: "traites", label: "Traités", statuses: ["dismissed", "actioned"] },
  { key: "tous", label: "Tous", statuses: ["open", "reviewing", "dismissed", "actioned"] },
] as const;

const REASON_LABEL: Record<string, string> = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]));
const PATH = "/dashboard/admin/signalements";

type ShopRef = { id: string; name: string; slug: string; status: string; city: string | null; suspended_at: string | null; suspended_reason: string | null };
type ReportRow = {
  id: string; reason: string; details: string | null; reporter_contact: string | null; status: string; admin_note: string | null;
  created_at: string; handled_at: string | null; shop_id: string;
  shops: ShopRef | ShopRef[] | null;
  products: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function AdminReportsPage({ searchParams }: { searchParams: { filtre?: string; ok?: string; erreur?: string; prevenir?: string } }) {
  await requireAdmin();
  const filter = FILTERS.find((f) => f.key === searchParams.filtre) ?? FILTERS[0];
  const admin = createAdminClient();

  const [reportsRes, suspendedRes, totalsRes] = await Promise.all([
    admin
      .from("shop_reports")
      .select("id, reason, details, reporter_contact, status, admin_note, created_at, handled_at, shop_id, shops(id, name, slug, status, city, suspended_at, suspended_reason), products(name, slug)")
      .in("status", [...filter.statuses])
      .order("created_at", { ascending: false })
      .limit(300),
    admin.from("shops").select("id, name, slug, city, suspended_at, suspended_reason").eq("status", "suspended").order("suspended_at", { ascending: false }).limit(100),
    // Nombre total de signalements par boutique (tous statuts) : repère les récidives.
    admin.from("shop_reports").select("shop_id").limit(5000),
  ]);

  const reports = (reportsRes.data ?? []) as ReportRow[];
  const totals = new Map<string, number>();
  for (const r of (totalsRes.data ?? []) as { shop_id: string }[]) totals.set(r.shop_id, (totals.get(r.shop_id) ?? 0) + 1);

  // Regroupement par boutique, les plus signalées d'abord.
  const groups = new Map<string, { shop: ShopRef | null; shopId: string; items: ReportRow[] }>();
  for (const r of reports) {
    const g = groups.get(r.shop_id) ?? { shop: one(r.shops), shopId: r.shop_id, items: [] };
    g.items.push(r);
    groups.set(r.shop_id, g);
  }
  const ordered = [...groups.values()].sort((a, b) => b.items.length - a.items.length || b.items[0].created_at.localeCompare(a.items[0].created_at));
  const suspended = (suspendedRes.data ?? []) as Omit<ShopRef, "status">[];
  const from = `${PATH}?filtre=${filter.key}`;

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Signalements</h1>
        <p className="text-sm text-muted-foreground">Envoyés par les visiteurs depuis les boutiques et les fiches produit. Suspendre retire la boutique du web, du Market et de l&apos;annuaire.</p>
      </div>

      <ActionFlash ok={searchParams.ok} error={searchParams.erreur} />
      <ModerationNotice prevenir={searchParams.prevenir} />
      {reportsRes.error && <ActionFlash error={`Lecture impossible : ${reportsRes.error.message}`} />}

      <nav aria-label="Filtre" className="mb-5 inline-flex rounded-xl border border-border bg-muted p-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`${PATH}?filtre=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium", f.key === filter.key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <Flag className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-semibold">Aucun signalement {filter.key === "a-traiter" ? "à traiter" : "ici"}.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ordered.map(({ shop, shopId, items }) => (
            <section key={shopId} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold">{shop?.name ?? "Boutique supprimée"}</h2>
                    {shop?.status === "suspended" ? <Badge variant="destructive">Suspendue</Badge> : shop?.status === "published" ? <Badge variant="success">En ligne</Badge> : <Badge>Brouillon</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {items.length} signalement{items.length > 1 ? "s" : ""} ici · {totals.get(shopId) ?? items.length} au total
                    {shop?.city ? ` · ${shop.city}` : ""}
                  </p>
                </div>
                {shop && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/boutique/${shop.slug}`} target="_blank" className="inline-flex h-8 items-center gap-1 rounded-xl border border-input px-3 text-xs font-semibold hover:bg-muted">
                      Voir la boutique <ExternalLink className="h-3 w-3" />
                    </Link>
                    {shop.status === "suspended" ? (
                      <form action={reactivateShopAction}>
                        <input type="hidden" name="shopId" value={shop.id} />
                        <input type="hidden" name="from" value={from} />
                        <Button size="sm" variant="secondary">Réactiver</Button>
                      </form>
                    ) : null}
                  </div>
                )}
              </header>

              {shop && shop.status !== "suspended" && (
                <details className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-destructive">Suspendre cette boutique…</summary>
                  <form action={suspendShopAction} className="mt-3 flex flex-col gap-2 pb-1 sm:flex-row sm:items-end">
                    <input type="hidden" name="shopId" value={shop.id} />
                    <input type="hidden" name="from" value={from} />
                    <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Raison (gardée dans le journal, le vendeur voit seulement « suspendue »)
                      <input name="reason" required maxLength={500} placeholder="Ex. : 3 signalements d'arnaque, numéro injoignable" className="h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground" />
                    </label>
                    <Button size="md" variant="destructive" className="shrink-0">
                      <ShieldOff className="h-4 w-4" /> Suspendre
                    </Button>
                  </form>
                </details>
              )}
              {shop?.status === "suspended" && shop.suspended_reason && (
                <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Suspendue le {frDate(shop.suspended_at)} : {shop.suspended_reason}
                </p>
              )}

              <ul className="mt-4 divide-y divide-border">
                {items.map((r) => {
                  const product = one(r.products);
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{REASON_LABEL[r.reason] ?? r.reason}</span>
                        <Badge variant={r.status === "open" ? "warning" : r.status === "reviewing" ? "accent" : "neutral"}>{REPORT_STATUS_LABELS[r.status] ?? r.status}</Badge>
                        <span className="text-xs text-muted-foreground">{frDateTime(r.created_at)}</span>
                      </div>
                      {product && shop && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Produit :{" "}
                          <Link href={`/boutique/${shop.slug}/p/${product.slug}`} target="_blank" className="font-medium text-foreground hover:text-primary">
                            {product.name}
                          </Link>
                          {" · "}
                          <Link href={`/dashboard/admin/moderation?q=${encodeURIComponent(product.name)}`} className="font-medium text-destructive hover:underline">
                            Masquer ce produit
                          </Link>
                        </p>
                      )}
                      {r.details && <p className="mt-1.5 whitespace-pre-line text-sm">{r.details}</p>}
                      {r.reporter_contact && <p className="mt-1 text-xs text-muted-foreground">Contact du visiteur : {r.reporter_contact}</p>}
                      {r.admin_note && <p className="mt-1 text-xs text-muted-foreground">Note : {r.admin_note}</p>}
                      <form action={updateReportAction} className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="filtre" value={filter.key} />
                        <input name="note" defaultValue={r.admin_note ?? ""} maxLength={1000} placeholder="Note interne (facultatif)" className="h-8 min-w-[180px] flex-1 rounded-lg border border-input bg-card px-2.5 text-xs" />
                        {r.status === "open" && (
                          <Button size="sm" variant="secondary" name="status" value="reviewing">En cours</Button>
                        )}
                        {(r.status === "open" || r.status === "reviewing") ? (
                          <>
                            <Button size="sm" variant="secondary" name="status" value="dismissed">Sans suite</Button>
                            <Button size="sm" name="status" value="actioned">Traité</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" name="status" value="open">Rouvrir</Button>
                        )}
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Boutiques suspendues ({suspended.length})</h2>
      {suspended.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {suspended.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  Depuis le {frDate(s.suspended_at)}
                  {s.suspended_reason ? ` · ${s.suspended_reason}` : ""}
                </p>
              </div>
              <form action={reactivateShopAction}>
                <input type="hidden" name="shopId" value={s.id} />
                <input type="hidden" name="from" value={from} />
                <Button size="sm" variant="secondary">Réactiver</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
