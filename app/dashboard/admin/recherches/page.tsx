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
type ClickRow = { q_norm: string; clicks: number; opens: number; contacts: number; products: number };
type TopProduct = {
  product_id: string;
  product_name: string;
  product_slug: string;
  shop_name: string;
  shop_slug: string;
  clicks: number;
  contacts: number;
  top_query: string | null;
  avg_position: number | null;
  last_at: string;
};

export default async function AdminSearchesPage({ searchParams }: { searchParams: { jours?: string; vue?: string } }) {
  await requireAdmin();
  const days = PERIODS.includes(Number(searchParams.jours)) ? Number(searchParams.jours) : 30;
  const onlyZero = searchParams.vue !== "toutes";
  const admin = createAdminClient();
  const [{ data, error }, clickRes, topRes] = await Promise.all([
    admin.rpc("admin_market_search_stats", { p_days: days, p_limit: 300 }),
    // Clics sur les résultats (migration 0043) : facultatifs, la page marche sans.
    admin.rpc("admin_market_search_click_stats", { p_days: days }),
    admin.rpc("admin_market_search_top_products", { p_days: days, p_limit: 30 }),
  ]);
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
  const clicksReady = !clickRes.error && !topRes.error;
  const clicksByQ = new Map(((clickRes.data ?? []) as ClickRow[]).map((c) => [c.q_norm, c]));
  const topProducts = (topRes.data ?? []) as TopProduct[];
  const totalClicks = [...clicksByQ.values()].reduce((s, c) => s + Number(c.clicks), 0);
  const totalContacts = [...clicksByQ.values()].reduce((s, c) => s + Number(c.contacts), 0);
  const searchesWithResults = rows.filter((r) => Number(r.last_results) > 0).length;
  const searchesClicked = rows.filter((r) => clicksByQ.has(r.q_norm)).length;
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Recherches" value={total} />
        <Tile label="Sans résultat" value={zeroSearches} sub={total ? `${Math.round((zeroSearches / total) * 100)} % des recherches` : undefined} warn={zeroSearches > 0} />
        <Tile label="Termes différents" value={rows.length} />
        {clicksReady && (
          <>
            <Tile
              label="Clics sur les résultats"
              value={totalClicks}
              sub={searchesWithResults ? `${Math.round((searchesClicked / searchesWithResults) * 100)} % des termes avec résultats cliqués` : undefined}
            />
            <Tile label="Contacts vendeurs" value={totalContacts} sub="WhatsApp ou appel depuis la recherche" />
          </>
        )}
      </div>
      {!clicksReady && (
        <p className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Les clics sur les résultats s&apos;affichent dès que la migration <code className="font-mono">0043_market_search_clicks.sql</code> est exécutée dans Supabase.
        </p>
      )}

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
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Recherche</th>
              <th className="px-3 py-2.5 text-right font-medium">Fois</th>
              <th className="px-3 py-2.5 text-right font-medium">Sans résultat</th>
              <th className="px-3 py-2.5 text-right font-medium">Résultats (dernière)</th>
              {clicksReady && <th className="px-3 py-2.5 text-right font-medium">Clics</th>}
              {clicksReady && <th className="px-3 py-2.5 text-right font-medium">Contacts</th>}
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
                {clicksReady && <td className="px-3 py-2.5 text-right tabular-nums">{Number(clicksByQ.get(r.q_norm)?.clicks) || "—"}</td>}
                {clicksReady && (
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {Number(clicksByQ.get(r.q_norm)?.contacts) ? <Badge variant="success">{clicksByQ.get(r.q_norm)?.contacts}</Badge> : "—"}
                  </td>
                )}
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{frDateTime(r.last_at)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={clicksReady ? 7 : 5} className="px-4 py-6 text-center text-sm text-muted-foreground">
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

      {clicksReady && (
        <section className="mt-8">
          <h2 className="mb-1 font-semibold">Produits les plus cliqués depuis la recherche ({topProducts.length})</h2>
          <p className="mb-3 text-sm text-muted-foreground">Ce qui intéresse vraiment les acheteurs : clic sur la fiche, WhatsApp, appel ou boutique, après une recherche.</p>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-3 py-2.5 font-medium">Boutique</th>
                  <th className="px-3 py-2.5 font-medium">Recherche principale</th>
                  <th className="px-3 py-2.5 text-right font-medium">Clics</th>
                  <th className="px-3 py-2.5 text-right font-medium">Contacts</th>
                  <th className="px-3 py-2.5 text-right font-medium">Position moy.</th>
                  <th className="px-3 py-2.5 font-medium">Dernier clic</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.product_id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="max-w-[220px] px-4 py-2.5">
                      <Link href={`/boutique/${p.shop_slug}/p/${p.product_slug}`} target="_blank" className="line-clamp-2 font-medium hover:text-primary hover:underline">
                        {p.product_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/boutique/${p.shop_slug}`} target="_blank" className="text-muted-foreground hover:text-primary hover:underline">
                        {p.shop_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {p.top_query ? (
                        <Link href={`/market/recherche?q=${encodeURIComponent(p.top_query)}`} target="_blank" className="hover:text-primary hover:underline">
                          {p.top_query}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.clicks}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Number(p.contacts) ? <Badge variant="success">{p.contacts}</Badge> : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.avg_position ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{frDateTime(p.last_at)}</td>
                  </tr>
                ))}
                {topProducts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Aucun clic après une recherche sur la période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Position moy. = rang moyen du produit dans les résultats au moment du clic (1 = premier). Un produit souvent cliqué loin dans la liste mérite peut-être d&apos;être mieux classé.
          </p>
        </section>
      )}
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
