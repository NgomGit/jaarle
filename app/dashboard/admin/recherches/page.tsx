import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDateTime } from "@/lib/admin/market";
import { cn } from "@/lib/utils";

// Recherches du Market (migration 0042) : ce que cherchent les acheteurs, et surtout ce qu'ils
// ne trouvent pas — pour savoir quels vendeurs / produits recruter et quels synonymes ajouter
// (lib/market/search.ts → SYNONYMS).

export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90];
type Row = { q_norm: string; example: string; searches: number; zero_results: number; last_results: number; last_at: string };

export default async function AdminSearchesPage({ searchParams }: { searchParams: { jours?: string; vue?: string } }) {
  await requireAdmin();
  const days = PERIODS.includes(Number(searchParams.jours)) ? Number(searchParams.jours) : 30;
  const onlyZero = searchParams.vue !== "toutes";
  const { data, error } = await createAdminClient().rpc("admin_market_search_stats", { p_days: days, p_limit: 300 });
  if (error) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        Le journal des recherches arrive dès que la migration <code className="font-mono">0042_market_search_v2.sql</code> est exécutée dans Supabase.
        <span className="text-muted-foreground"> ({error.message})</span>
      </p>
    );
  }
  const rows = (data ?? []) as Row[];
  const total = rows.reduce((s, r) => s + Number(r.searches), 0);
  const zeroRows = rows.filter((r) => Number(r.last_results) === 0);
  const zeroSearches = rows.reduce((s, r) => s + Number(r.zero_results), 0);
  const shown = onlyZero ? zeroRows : rows;
  const href = (p: { jours?: number; vue?: string }) =>
    `/dashboard/admin/recherches?jours=${p.jours ?? days}&vue=${p.vue ?? (onlyZero ? "sans-resultat" : "toutes")}`;

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Recherches du Market</h1>
          <p className="text-sm text-muted-foreground">Ce que les acheteurs cherchent, et ce qu&apos;ils ne trouvent pas. Les recherches identiques (accents, majuscules, pluriels) sont regroupées.</p>
        </div>
        <nav className="inline-flex rounded-xl border border-border bg-muted p-1" aria-label="Période">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={href({ jours: p })}
              aria-current={p === days ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", p === days ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {p} jours
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Recherches" value={total} />
        <Tile label="Sans résultat" value={zeroSearches} sub={total ? `${Math.round((zeroSearches / total) * 100)} % des recherches` : undefined} warn={zeroSearches > 0} />
        <Tile label="Termes différents" value={rows.length} />
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{onlyZero ? `Sans résultat aujourd'hui (${zeroRows.length})` : `Toutes les recherches (${rows.length})`}</h2>
        <nav className="flex gap-1" aria-label="Vue">
          {[
            { key: "sans-resultat", label: "Sans résultat" },
            { key: "toutes", label: "Toutes" },
          ].map((v) => {
            const active = (v.key === "toutes") !== onlyZero;
            return (
              <Link
                key={v.key}
                href={href({ vue: v.key })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {v.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Recherche</th>
              <th className="px-3 py-2.5 text-right font-medium">Fois</th>
              <th className="px-3 py-2.5 text-right font-medium">Sans résultat</th>
              <th className="px-3 py-2.5 text-right font-medium">Résultats (dernière)</th>
              <th className="px-3 py-2.5 font-medium">Dernière fois</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.q_norm} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link href={`/market/recherche?q=${encodeURIComponent(r.example)}`} target="_blank" className="font-medium hover:text-primary hover:underline">
                    {r.example}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.searches}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{Number(r.zero_results) || "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  {Number(r.last_results) === 0 ? <Badge variant="warning">0</Badge> : <span className="tabular-nums">{r.last_results}</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{frDateTime(r.last_at)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {onlyZero ? "Aucune recherche sans résultat sur la période." : "Aucune recherche sur la période."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Une recherche est comptée quand le visiteur s&apos;arrête de taper (pas à chaque lettre). « Sans résultat aujourd&apos;hui » = la dernière recherche de ce terme n&apos;a rien donné. Pour un synonyme manquant (ex. « tiouraye » ↔ « thiouraye »), ajoute-le dans <code className="font-mono">lib/market/search.ts</code>.
      </p>
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
