import Link from "next/link";
import { ExternalLink, Megaphone, Settings2, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionFlash } from "@/components/admin/admin-nav";
import { BoostForm } from "@/components/admin/boost-form";
import { MarketCategoryPicker } from "@/components/market/market-category-picker";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { BOOST_PLACEMENTS, BOOST_STATE_LABELS, boostState, frDate, inclusiveDayFromExclusive, todayIso } from "@/lib/admin/market";
import { getMarketCategory } from "@/lib/market/categories";
import { getMarketCity, MARKET_CITIES } from "@/lib/market/cities";
import { shopMediaThumbUrl } from "@/lib/shops/media";
import { createBoostAction, saveMarketSettingsAction, setProductCategoryAction, toggleBoostAction } from "../actions";

// Admin du Market : règles d'entrée (période d'ouverture), mises en avant des boutiques Pro,
// annonces à classer. Migration 0026.

export const dynamic = "force-dynamic";

type Settings = { launch_until: string | null; launch_min_items: number; pro_min_items: number; updated_at: string };
type Boost = {
  id: string; shop_id: string; product_id: string | null; placement: string; title: string | null; subtitle: string | null;
  category_slug: string | null; city: string | null; starts_at: string; ends_at: string; priority: number; active: boolean;
  shops: { name: string; slug: string } | { name: string; slug: string }[] | null;
  products: { name: string; slug: string } | { name: string; slug: string }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function AdminMarketPage({ searchParams }: { searchParams: { ok?: string; erreur?: string } }) {
  await requireAdmin();
  const admin = createAdminClient();

  const [settingsRes, listedRes, boostsRes] = await Promise.all([
    admin.from("market_settings").select("launch_until, launch_min_items, pro_min_items, updated_at").maybeSingle(),
    admin.rpc("market_shop_ids"),
    admin
      .from("market_boosts")
      .select("id, shop_id, product_id, placement, title, subtitle, category_slug, city, starts_at, ends_at, priority, active, shops(name, slug), products(name, slug)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (settingsRes.error && !settingsRes.data) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        Exécute la migration <code className="font-mono">0026_market_launch_boost_admin.sql</code> dans Supabase pour activer cette page.
        <span className="text-muted-foreground"> ({settingsRes.error.message})</span>
      </p>
    );
  }

  const settings = (settingsRes.data ?? { launch_until: null, launch_min_items: 6, pro_min_items: 3, updated_at: "" }) as Settings;
  const listed = (listedRes.data ?? []) as { shop_id: string; is_pro: boolean }[];
  const listedIds = listed.map((l) => l.shop_id);
  const proIds = listed.filter((l) => l.is_pro).map((l) => l.shop_id);
  const proSet = new Set(proIds);
  const launchActive = !!settings.launch_until && new Date(settings.launch_until).getTime() > Date.now();

  const [shopsRes, proProductsRes, uncategorizedRes] = await Promise.all([
    listedIds.length ? admin.from("shops").select("id, name, slug, city").in("id", listedIds) : Promise.resolve({ data: [] }),
    proIds.length
      ? admin.from("products").select("id, name, shop_id").in("shop_id", proIds).in("status", ["active", "sold_out"]).order("name").limit(1000)
      : Promise.resolve({ data: [] }),
    listedIds.length
      ? admin
          .from("products")
          .select("id, name, slug, shop_id, category, product_images(path, position)")
          .in("shop_id", listedIds)
          .in("status", ["active", "sold_out"])
          .is("market_category", null)
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] }),
  ]);

  const shops = new Map(((shopsRes.data ?? []) as { id: string; name: string; slug: string; city: string | null }[]).map((s) => [s.id, s]));
  const proShopOptions = proIds
    .map((id) => shops.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((s) => ({ value: s.id, label: s.city ? `${s.name} · ${s.city}` : s.name }));
  const proProducts = ((proProductsRes.data ?? []) as { id: string; name: string; shop_id: string }[]).map((p) => ({ id: p.id, name: p.name, shopId: p.shop_id }));
  const uncategorized = (uncategorizedRes.data ?? []) as { id: string; name: string; slug: string; shop_id: string; category: string | null; product_images: { path: string; position: number }[] | null }[];
  const boosts = (boostsRes.data ?? []) as Boost[];
  const cityOptions = MARKET_CITIES.map((c) => ({ value: c.slug, label: c.name }));
  const inAWeek = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-5 pb-24 md:pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Market & mises en avant</h1>
        <p className="text-sm text-muted-foreground">Qui entre sur Jaarle Market, et comment les boutiques Pro y passent devant.</p>
      </div>
      <ActionFlash ok={searchParams.ok} error={searchParams.erreur} />

      {/* Règles d'entrée */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <SectionTitle icon={<Settings2 className="h-4 w-4" />} title="Règles d'entrée" />
        <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Boutiques sur le Market" value={listed.length} />
          <Stat label="dont Pro" value={proIds.length} />
          <Stat label="dont via l'ouverture" value={listed.length - proIds.length} />
          <Stat label="Ouverture" value={launchActive ? `jusqu'au ${frDate(inclusiveDayFromExclusive(settings.launch_until))}` : "terminée"} small />
        </dl>
        <p className="mb-4 text-sm text-muted-foreground">
          Une boutique publiée d&apos;un secteur ouvert entre sur le Market si elle est <strong className="text-foreground">Pro avec {settings.pro_min_items} annonces visibles</strong>
          {launchActive ? (
            <>
              {" "}ou, pendant l&apos;ouverture, si elle a <strong className="text-foreground">{settings.launch_min_items} annonces visibles</strong>, Pro ou non.
            </>
          ) : (
            "."
          )}{" "}
          Annonce visible = produit avec photo, ou service avec affiche ou photo.
        </p>
        <form action={saveMarketSettingsAction} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Ouverture à tous jusqu&apos;au (inclus)
            <input type="date" name="launchUntil" defaultValue={inclusiveDayFromExclusive(settings.launch_until)} className="h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Annonces minimum (ouverture)
            <input type="number" name="launchMin" min={1} max={100} defaultValue={settings.launch_min_items} className="h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Annonces minimum (Pro)
            <input type="number" name="proMin" min={1} max={100} defaultValue={settings.pro_min_items} className="h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground" />
          </label>
          <Button type="submit" variant="secondary">Enregistrer</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Vide la date pour fermer l&apos;ouverture : seules les boutiques Pro resteront.</p>
      </section>

      {/* Mises en avant */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <SectionTitle icon={<Megaphone className="h-4 w-4" />} title="Mises en avant des boutiques Pro" />
        <ul className="mb-5 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          <li className="rounded-xl bg-muted/60 p-3"><strong className="text-foreground">Automatique :</strong> dans les listes, les annonces Pro passent devant (3 places d&apos;avance par boutique) et portent le badge PRO.</li>
          <li className="rounded-xl bg-muted/60 p-3"><strong className="text-foreground">Sélection PRO :</strong> sans bannière programmée, l&apos;accueil du Market montre une annonce de chaque boutique Pro, renouvelée chaque jour.</li>
          <li className="rounded-xl bg-muted/60 p-3"><strong className="text-foreground">Manuel (ici) :</strong> bannières et « À la une ». Invisibles si la boutique perd le Pro ; coupées si elle est suspendue.</li>
        </ul>

        <BoostForm
          action={createBoostAction}
          shops={proShopOptions}
          products={proProducts}
          cities={cityOptions}
          today={todayIso()}
          inAWeek={inAWeek}
        />

        <h3 className="mb-2 mt-6 text-sm font-semibold">Programmées et passées</h3>
        {boosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune mise en avant pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {boosts.map((b) => {
              const shop = one(b.shops);
              const product = one(b.products);
              const state = boostState(b, proSet.has(b.shop_id));
              const st = BOOST_STATE_LABELS[state];
              const target = [b.category_slug ? getMarketCategory(b.category_slug)?.label ?? b.category_slug : null, b.city ? getMarketCity(b.city)?.name ?? b.city : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{b.title ?? product?.name ?? shop?.name ?? "—"}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {BOOST_PLACEMENTS.find((p) => p.key === b.placement)?.label ?? b.placement} · {shop?.name ?? "boutique supprimée"}
                      {product ? ` · ${product.name}` : " · toute la boutique"}
                      {target ? ` · ${target}` : " · partout"} · du {frDate(b.starts_at)} au {frDate(inclusiveDayFromExclusive(b.ends_at))}
                      {b.priority ? ` · priorité ${b.priority}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {shop && (
                      <Link href={`/boutique/${shop.slug}`} target="_blank" className="text-muted-foreground hover:text-foreground" aria-label={`Ouvrir ${shop.name}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                    {state !== "expired" && (
                      <form action={toggleBoostAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="active" value={b.active ? "false" : "true"} />
                        <Button size="sm" variant={b.active ? "ghost" : "secondary"}>{b.active ? "Désactiver" : "Réactiver"}</Button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Annonces à classer */}
      <section id="a-classer" className="rounded-2xl border border-border bg-card p-5">
        <SectionTitle icon={<Tags className="h-4 w-4" />} title={`Annonces sans catégorie Market (${uncategorized.length}${uncategorized.length === 40 ? "+" : ""})`} />
        <p className="mb-4 text-sm text-muted-foreground">
          Elles sont sur le Market mais n&apos;apparaissent ni dans les pages catégorie, ni dans leurs compteurs. Classe-les ici en attendant que les vendeurs le fassent.
        </p>
        {uncategorized.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tout est classé.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {uncategorized.map((p) => {
              const shop = shops.get(p.shop_id);
              const img = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0];
              const thumb = shopMediaThumbUrl(img?.path);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg bg-muted object-cover" />
                  ) : (
                    <span className="h-11 w-11 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {shop?.name}
                      {p.category ? ` · « ${p.category} »` : ""}
                    </p>
                  </div>
                  <form action={setProductCategoryAction} className="flex w-full items-center gap-2 sm:w-auto">
                    <input type="hidden" name="productId" value={p.id} />
                    <MarketCategoryPicker name="category" value="" required clearable={false} size="sm" placeholder="Choisir…" className="min-w-0 flex-1 sm:w-72" />
                    <Button size="sm" variant="secondary">Classer</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">{icon}</span>
      {title}
    </h2>
  );
}

function Stat({ label, value, small = false }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={small ? "mt-1 text-sm font-semibold" : "mt-1 text-xl font-bold tabular-nums"}>{value}</dd>
    </div>
  );
}
