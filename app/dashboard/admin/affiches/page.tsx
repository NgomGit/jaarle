import Link from "next/link";
import { Images, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionFlash } from "@/components/admin/admin-nav";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { cn } from "@/lib/utils";
import { toggleShowcaseAction } from "../actions";

// Admin → Affiches : toutes les affiches créées sur Jaarle, et le choix de celles montrées sur le
// site public (vitrine : accueil + /affiche-publicitaire). Migration 0037.

export const dynamic = "force-dynamic";

const PAGE_SIZE = 48;
const PATH = "/dashboard/admin/affiches";

type Row = {
  id: string; user_id: string; product_name: string; price: number | null; tier: string; unlocked: boolean;
  poster_path_2: string | null; product_id: string | null; created_at: string; regenerations_used: number | null;
};

const FILTERS = [
  { key: "toutes", label: "Toutes" },
  { key: "vitrine", label: "Dans la vitrine" },
  { key: "debloquees", label: "Débloquées (nettes)" },
] as const;

function frDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" });
}

function href(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== 1 && v !== "toutes") q.set(k, String(v));
  const s = q.toString();
  return s ? `${PATH}?${s}` : PATH;
}

export default async function AdminAffichesPage({
  searchParams,
}: {
  searchParams: { filtre?: string; q?: string; page?: string; ok?: string; erreur?: string };
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const filtre = FILTERS.some((f) => f.key === searchParams.filtre) ? searchParams.filtre! : "toutes";
  const search = (searchParams.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const showcaseRes = await admin.from("showcase_creations").select("creation_id");
  const showcaseIds = new Set((showcaseRes.data ?? []).map((r) => r.creation_id as string));

  let query = admin
    .from("creations")
    .select("id, user_id, product_name, price, tier, unlocked, poster_path_2, product_id, created_at, regenerations_used", { count: "exact" })
    .not("poster_path", "is", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filtre === "vitrine") query = query.in("id", showcaseIds.size ? [...showcaseIds] : ["00000000-0000-0000-0000-000000000000"]);
  if (filtre === "debloquees") query = query.eq("unlocked", true);
  if (search) query = query.ilike("product_name", `%${search.replace(/[%_]/g, "")}%`);
  const { data, count, error } = await query;
  const rows = (data ?? []) as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Boutique de chaque créateur (une boutique par compte).
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: shops } = userIds.length
    ? await admin.from("shops").select("owner_id, name, slug, city").in("owner_id", userIds)
    : { data: [] as { owner_id: string; name: string; slug: string; city: string | null }[] };
  const shopByOwner = new Map((shops ?? []).map((s) => [s.owner_id as string, s]));

  const from = href({ filtre, q: search, page });

  return (
    <div>
      <ActionFlash ok={searchParams.ok} error={searchParams.erreur} />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Images className="h-5 w-5" /> Affiches créées sur Jaarle
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} affiche{total > 1 ? "s" : ""} · {showcaseIds.size} dans la vitrine. Les 6 premières de la vitrine
            apparaissent sur l&apos;accueil et sur la page « Affiche publicitaire ».
          </p>
        </div>
        <form action={PATH} className="flex gap-2">
          {filtre !== "toutes" && <input type="hidden" name="filtre" value={filtre} />}
          <input
            name="q"
            defaultValue={search}
            placeholder="Rechercher un produit…"
            className="h-9 w-52 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <Button size="sm" variant="secondary">Rechercher</Button>
        </form>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href({ filtre: f.key, q: search })}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium",
              filtre === f.key ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {showcaseRes.error && (
        <p className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Exécute la migration <code className="font-mono">0037_showcase_creations.sql</code> dans Supabase pour activer la vitrine.
          <span className="text-muted-foreground"> ({showcaseRes.error.message})</span>
        </p>
      )}
      {error && <p className="mb-5 text-sm text-destructive">{error.message}</p>}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Aucune affiche ici.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => {
            const shop = shopByOwner.get(r.user_id);
            const inShowcase = showcaseIds.has(r.id);
            return (
              <li key={r.id} className={cn("overflow-hidden rounded-2xl border bg-card", inShowcase ? "border-primary ring-1 ring-primary" : "border-border")}>
                <a href={`/api/admin/creations/${r.id}/thumb?v=${r.regenerations_used ?? 0}`} target="_blank" rel="noopener noreferrer" className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/creations/${r.id}/thumb?v=${r.regenerations_used ?? 0}`}
                    alt={r.product_name}
                    loading="lazy"
                    className="aspect-square w-full bg-muted object-cover"
                  />
                  {inShowcase && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      <Star className="h-3 w-3" /> Vitrine
                    </span>
                  )}
                </a>
                <div className="space-y-2 p-3">
                  <div>
                    <p className="truncate text-sm font-semibold" title={r.product_name}>{r.product_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {shop ? (
                        <Link href={`/boutique/${shop.slug}`} target="_blank" className="hover:underline">
                          {shop.name}{shop.city ? ` · ${shop.city}` : ""}
                        </Link>
                      ) : (
                        "Sans boutique"
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{frDateTime(r.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={r.unlocked ? "success" : "neutral"}>{r.unlocked ? "Débloquée" : "Aperçu signé"}</Badge>
                    <Badge>{r.tier}</Badge>
                    {r.poster_path_2 && <Badge>2 variantes</Badge>}
                  </div>
                  <form action={toggleShowcaseAction}>
                    <input type="hidden" name="creationId" value={r.id} />
                    <input type="hidden" name="show" value={inShowcase ? "false" : "true"} />
                    <input type="hidden" name="from" value={from} />
                    <Button size="sm" variant={inShowcase ? "ghost" : "secondary"} className="w-full">
                      {inShowcase ? "Retirer de la vitrine" : "Mettre en vitrine"}
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={href({ filtre, q: search, page: page - 1 })} className="rounded-lg border border-border px-3 py-1.5">← Précédent</Link>}
          <span className="text-muted-foreground">Page {page} / {pages}</span>
          {page < pages && <Link href={href({ filtre, q: search, page: page + 1 })} className="rounded-lg border border-border px-3 py-1.5">Suivant →</Link>}
        </nav>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Une affiche « Aperçu signé » (pas encore débloquée par le vendeur) apparaît dans la vitrine réduite et avec la signature
        Jaarle, jamais en version nette.
      </p>
    </div>
  );
}
