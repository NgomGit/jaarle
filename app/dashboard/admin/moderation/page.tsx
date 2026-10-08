import Link from "next/link";
import { EyeOff, Search, Store } from "lucide-react";
import { ActionFlash } from "@/components/admin/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDate, frDateTime } from "@/lib/admin/market";
import { MODERATION_REASONS, noticeMessage, whatsappLink } from "@/lib/admin/moderation";
import { hideProductAction, reactivateShopAction, restoreProductAction, suspendShopAction } from "../actions";
import { ModerationNotice } from "./notice";
import { NoticeButton } from "./notice-button";

// Modération : retrouver n'importe quelle boutique ou produit, le masquer (raison obligatoire),
// puis prévenir le vendeur sur WhatsApp avec un message prérempli. Produits masqués (migration
// 0044) et boutiques suspendues listés en bas, avec les demandes de vérification en premier.

export const dynamic = "force-dynamic";

const PATH = "/dashboard/admin/moderation";
const PRODUCT_STATUS: Record<string, string> = { active: "Disponible", sold_out: "Épuisé", hidden: "Masqué", draft: "Brouillon" };

type ShopLite = { id: string; name: string; slug: string; city: string | null; whatsapp: string | null; status: string; suspended_at: string | null; suspended_reason: string | null };
type ProductRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  moderated_at: string | null;
  moderated_reason: string | null;
  review_requested_at: string | null;
  updated_at: string;
  shops: ShopLite | ShopLite[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const clean = (q: string) => q.replace(/[%_,()]/g, " ").trim().slice(0, 60);

export default async function AdminModerationPage({ searchParams }: { searchParams: { q?: string; ok?: string; erreur?: string; prevenir?: string } }) {
  await requireAdmin();
  const admin = createAdminClient();
  const q = clean(searchParams.q ?? "");
  const SHOP_COLS = "id, name, slug, city, whatsapp, status, suspended_at, suspended_reason";
  const PRODUCT_COLS = `id, name, slug, status, moderated_at, moderated_reason, review_requested_at, updated_at, shops(${SHOP_COLS})`;

  const [shopHits, productHits, hiddenRes, suspendedRes] = await Promise.all([
    q.length >= 2 ? admin.from("shops").select(SHOP_COLS).or(`name.ilike.%${q}%,slug.ilike.%${q}%`).order("name").limit(15) : Promise.resolve({ data: [] }),
    q.length >= 2 ? admin.from("products").select(PRODUCT_COLS).ilike("name", `%${q}%`).order("updated_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    admin.from("products").select(PRODUCT_COLS).not("moderated_at", "is", null).order("review_requested_at", { ascending: false, nullsFirst: false }).order("moderated_at", { ascending: false }).limit(100),
    admin.from("shops").select(SHOP_COLS).eq("status", "suspended").order("suspended_at", { ascending: false }).limit(100),
  ]);
  const migrationMissing = !!hiddenRes.error;
  const shops = (shopHits.data ?? []) as ShopLite[];
  const products = (productHits.data ?? []) as ProductRow[];
  const hidden = (hiddenRes.data ?? []) as ProductRow[];
  const suspended = (suspendedRes.data ?? []) as ShopLite[];

  // Dernier « prévenu sur WhatsApp » par cible (journal admin).
  const targetIds = [...hidden.map((p) => p.id), ...suspended.map((s) => s.id)];
  const notified = new Map<string, string>();
  if (targetIds.length) {
    const { data } = await admin.from("admin_actions").select("target_id, created_at").in("action", ["product.notified", "shop.notified"]).in("target_id", targetIds).order("created_at", { ascending: true });
    for (const r of (data ?? []) as { target_id: string; created_at: string }[]) notified.set(r.target_id, r.created_at);
  }

  const from = q ? `${PATH}?q=${encodeURIComponent(q)}` : PATH;
  const reviewCount = hidden.filter((p) => p.review_requested_at).length;

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Modération</h1>
        <p className="text-sm text-muted-foreground">Masquer une boutique ou un produit indésirable, puis prévenir le vendeur sur WhatsApp (message prérempli, envoyé depuis ton numéro).</p>
      </div>

      <ActionFlash ok={searchParams.ok} error={searchParams.erreur} />
      <ModerationNotice prevenir={searchParams.prevenir} />
      {migrationMissing && (
        <p className="mb-5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Masquer un produit demande la migration <code className="font-mono">0044_product_moderation.sql</code> (à exécuter dans Supabase). La suspension de boutique marche déjà.
        </p>
      )}

      <datalist id="moderation-reasons">
        {MODERATION_REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <form action={PATH} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Nom de boutique ou de produit…"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <Button type="submit">Chercher</Button>
      </form>

      {q.length >= 2 && (
        <div className="mt-5 space-y-6">
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Store className="h-4 w-4" /> Boutiques ({shops.length})</h2>
            {shops.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune boutique trouvée.</p>
            ) : (
              <ul className="space-y-2">
                {shops.map((s) => (
                  <li key={s.id} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/boutique/${s.slug}`} target="_blank" className="font-medium hover:text-primary hover:underline">{s.name}</Link>
                        <span className="ml-2 text-xs text-muted-foreground">{s.city ?? ""}</span>
                        <span className="ml-2"><ShopStatus status={s.status} /></span>
                      </div>
                      {s.status === "suspended" && (
                        <form action={reactivateShopAction}>
                          <input type="hidden" name="shopId" value={s.id} />
                          <input type="hidden" name="from" value={from} />
                          <Button size="sm" variant="secondary">Remettre en ligne</Button>
                        </form>
                      )}
                    </div>
                    {s.status !== "suspended" && (
                      <ReasonForm action={suspendShopAction} idName="shopId" id={s.id} from={from} label="Suspendre la boutique" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><EyeOff className="h-4 w-4" /> Produits ({products.length})</h2>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun produit trouvé.</p>
            ) : (
              <ul className="space-y-2">
                {products.map((p) => {
                  const shop = one(p.shops);
                  return (
                    <li key={p.id} className="rounded-2xl border border-border bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          {shop ? (
                            <Link href={`/boutique/${shop.slug}/p/${p.slug}`} target="_blank" className="font-medium hover:text-primary hover:underline">{p.name}</Link>
                          ) : (
                            <span className="font-medium">{p.name}</span>
                          )}
                          <span className="ml-2 text-xs text-muted-foreground">{shop?.name}</span>
                          <span className="ml-2">
                            {p.moderated_at ? <Badge variant="destructive">Masqué par Jaarle</Badge> : <Badge>{PRODUCT_STATUS[p.status] ?? p.status}</Badge>}
                          </span>
                        </div>
                        {p.moderated_at && (
                          <form action={restoreProductAction}>
                            <input type="hidden" name="productId" value={p.id} />
                            <input type="hidden" name="from" value={from} />
                            <Button size="sm" variant="secondary">Remettre en ligne</Button>
                          </form>
                        )}
                      </div>
                      {!p.moderated_at && !migrationMissing && (
                        <ReasonForm action={hideProductAction} idName="productId" id={p.id} from={from} label="Masquer le produit" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {!migrationMissing && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Produits masqués par Jaarle ({hidden.length}){reviewCount > 0 && <Badge variant="warning" className="ml-2 normal-case tracking-normal">{reviewCount} à vérifier</Badge>}
          </h2>
          {hidden.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun produit masqué.</p>
          ) : (
            <ul className="space-y-2">
              {hidden.map((p) => {
                const shop = one(p.shops);
                const href = shop ? whatsappLink(shop.whatsapp, noticeMessage("product_hidden", { shopName: shop.name, productName: p.name, productId: p.id, reason: p.moderated_reason })) : null;
                return (
                  <li key={p.id} className={`rounded-2xl border bg-card p-3 ${p.review_requested_at ? "border-warning/50" : "border-border"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <p>
                          {shop ? (
                            <Link href={`/boutique/${shop.slug}/p/${p.slug}`} target="_blank" className="font-medium hover:text-primary hover:underline">{p.name}</Link>
                          ) : (
                            <span className="font-medium">{p.name}</span>
                          )}
                          <span className="ml-2 text-muted-foreground">{shop?.name}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Masqué le {frDate(p.moderated_at)}{p.moderated_reason ? ` · ${p.moderated_reason}` : ""}
                          {notified.get(p.id) ? ` · prévenu le ${frDate(notified.get(p.id))}` : " · vendeur pas encore prévenu"}
                        </p>
                        {p.review_requested_at && (
                          <p className="mt-1"><Badge variant="warning">Corrigé par le vendeur, vérification demandée le {frDateTime(p.review_requested_at)}</Badge></p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {href && <NoticeButton href={href} kind="product_hidden" targetId={p.id} sentAt={notified.get(p.id)} />}
                        <form action={restoreProductAction}>
                          <input type="hidden" name="productId" value={p.id} />
                          <input type="hidden" name="from" value={from} />
                          <Button size="sm" variant="secondary">Remettre en ligne</Button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Boutiques suspendues ({suspended.length})</h2>
        {suspended.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune boutique suspendue.</p>
        ) : (
          <ul className="space-y-2">
            {suspended.map((s) => {
              const href = whatsappLink(s.whatsapp, noticeMessage("shop_suspended", { shopName: s.name, reason: s.suspended_reason }));
              return (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{s.name} <span className="font-normal text-muted-foreground">{s.city ?? ""}</span></p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Depuis le {frDate(s.suspended_at)}{s.suspended_reason ? ` · ${s.suspended_reason}` : ""}
                      {notified.get(s.id) ? ` · prévenu le ${frDate(notified.get(s.id))}` : " · vendeur pas encore prévenu"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {href && <NoticeButton href={href} kind="shop_suspended" targetId={s.id} sentAt={notified.get(s.id)} />}
                    <form action={reactivateShopAction}>
                      <input type="hidden" name="shopId" value={s.id} />
                      <input type="hidden" name="from" value={from} />
                      <Button size="sm" variant="secondary">Remettre en ligne</Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ShopStatus({ status }: { status: string }) {
  if (status === "suspended") return <Badge variant="destructive">Suspendue</Badge>;
  if (status === "published") return <Badge variant="success">En ligne</Badge>;
  return <Badge>Brouillon</Badge>;
}

/** Formulaire repliable : raison (suggestions) + bouton. La raison est envoyée au vendeur. */
function ReasonForm({ action, idName, id, from, label }: { action: (fd: FormData) => Promise<void>; idName: string; id: string; from: string; label: string }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-destructive">{label}…</summary>
      <form action={action} className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name={idName} value={id} />
        <input type="hidden" name="from" value={from} />
        <input
          name="reason"
          required
          maxLength={500}
          list="moderation-reasons"
          placeholder="Raison (envoyée au vendeur)"
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <Button size="sm" variant="destructive">{label}</Button>
      </form>
    </details>
  );
}
