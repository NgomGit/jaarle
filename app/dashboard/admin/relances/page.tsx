import Link from "next/link";
import { ChevronDown, ImageOff, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDate, frDateTime } from "@/lib/admin/market";
import { formatPrice, formatSenegalPhone } from "@/lib/shops/format";
import { shopMediaThumbUrl } from "@/lib/shops/media";
import { cn } from "@/lib/utils";
import { ContactButton } from "./contact-button";

// Boutiques à relancer, en deux listes :
//  • « Produits, pas en ligne » : boutiques en BROUILLON qui ont déjà au moins un produit
//    (l'admin voit leurs produits, non publics tant que la boutique est en brouillon) ;
//  • « Sans produit » : boutiques créées (brouillon ou publiées, hors suspendues) sans aucun produit.
// L'admin les relance sur WhatsApp ; chaque relance est notée dans admin_actions.

export const dynamic = "force-dynamic";

const PATH = "/dashboard/admin/relances";
const SEGMENTS = [
  { key: "produits", label: "Produits, pas en ligne", reason: "draft_with_products" },
  { key: "sans-produit", label: "Sans produit", reason: "no_products" },
] as const;

const FILTERS = [
  { key: "a-relancer", label: "Pas encore relancées" },
  { key: "toutes", label: "Toutes" },
] as const;

const STATUS_LABEL: Record<string, string> = { active: "Disponible", sold_out: "Épuisé", hidden: "Masqué", draft: "Brouillon" };

type ProductRow = {
  id: string;
  name: string;
  price: number | null;
  status: string;
  subject_type: string;
  created_at: string;
  updated_at: string;
  product_images: { path: string; position: number }[] | null;
};
type ShopRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  city: string | null;
  district: string | null;
  whatsapp: string;
  status: string;
  category_label: string | null;
  created_at: string;
  products: ProductRow[] | null;
};

function relanceMessage(firstName: string | null, shopName: string, count: number): string {
  const hello = firstName ? `Bonjour ${firstName}` : "Bonjour";
  if (count === 0) {
    return (
      `${hello}, c'est l'équipe Jaarle 👋\n` +
      `Ta boutique « ${shopName} » est créée, il ne manque plus que tes produits !\n` +
      `C'est rapide : Jaarle → Produits → « Ajouter un produit », prends une photo et Jaarle remplit la fiche pour toi, tu n'as plus qu'à mettre le prix.\n` +
      `Tu veux qu'on t'aide à ajouter tes premiers produits ?`
    );
  }
  return (
    `${hello}, c'est l'équipe Jaarle 👋\n` +
    `Tu as déjà ajouté ${count} produit${count > 1 ? "s" : ""} dans ta boutique « ${shopName} », bravo ! ` +
    `Elle n'est pas encore en ligne : tes clients ne peuvent pas encore la voir.\n` +
    `Pour la publier : Jaarle → Ma boutique → « Publier ma boutique ». ` +
    `Tu veux qu'on t'aide à la mettre en ligne ?`
  );
}

export default async function AdminRelancesPage({ searchParams }: { searchParams: { filtre?: string; type?: string } }) {
  await requireAdmin();
  const segment = SEGMENTS.find((s) => s.key === searchParams.type) ?? SEGMENTS[0];
  const empty = segment.key === "sans-produit";
  const filter = FILTERS.find((f) => f.key === searchParams.filtre) ?? FILTERS[0];
  const admin = createAdminClient();

  const base = admin
    .from("shops")
    .select(
      "id, owner_id, name, slug, status, city, district, whatsapp, category_label, created_at, products(id, name, price, status, subject_type, created_at, updated_at, product_images(path, position))"
    );
  const { data, error } = await (empty ? base.neq("status", "suspended") : base.eq("status", "draft"))
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return <p className="text-sm text-destructive">Boutiques indisponibles : {error.message}</p>;

  const withProducts = ((data ?? []) as ShopRow[])
    .map((s) => ({ ...s, products: [...(s.products ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)) }))
    .filter((s) => (empty ? s.products.length === 0 : s.products.length > 0));

  // Dernière relance de chaque boutique (journal admin_actions, 0026).
  const lastContact = new Map<string, string>();
  if (withProducts.length) {
    const { data: logs } = await admin
      .from("admin_actions")
      .select("target_id, created_at")
      .eq("action", "shop.contacted")
      .in("target_id", withProducts.map((s) => s.id))
      .order("created_at", { ascending: false });
    for (const l of (logs ?? []) as { target_id: string; created_at: string }[]) {
      if (!lastContact.has(l.target_id)) lastContact.set(l.target_id, l.created_at);
    }
  }

  const shops = withProducts
    .filter((s) => filter.key === "toutes" || !lastContact.has(s.id))
    // Avec produits : les plus avancées d'abord, puis la dernière activité. Sans produit : les plus récentes.
    .sort((a, b) =>
      empty
        ? b.created_at.localeCompare(a.created_at)
        : b.products.length - a.products.length || b.products[0].updated_at.localeCompare(a.products[0].updated_at)
    )
    .slice(0, 150);

  // Prénom du vendeur (pour un message personnel).
  const owners = new Map<string, { name: string | null; lastSignIn: string | null }>();
  await Promise.all(
    [...new Set(shops.map((s) => s.owner_id))].map(async (id) => {
      const { data: u } = await admin.auth.admin.getUserById(id);
      const name = typeof u.user?.user_metadata?.full_name === "string" ? u.user.user_metadata.full_name.trim() : null;
      owners.set(id, { name: name || null, lastSignIn: u.user?.last_sign_in_at ?? null });
    })
  );

  const notContacted = withProducts.filter((s) => !lastContact.has(s.id)).length;

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Boutiques à relancer</h1>
          <p className="text-sm text-muted-foreground">
            {withProducts.length} boutique{withProducts.length > 1 ? "s" : ""}{" "}
            {empty ? "créée(s) sans aucun produit" : "en brouillon avec des produits"} · {notContacted} pas encore relancée
            {notContacted > 1 ? "s" : ""}.
          </p>
        </div>
        <nav className="inline-flex rounded-xl border border-border bg-muted p-1" aria-label="Filtre">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`${PATH}?type=${segment.key}&filtre=${f.key}`}
              aria-current={f.key === filter.key ? "page" : undefined}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium",
                f.key === filter.key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      <nav className="mb-5 flex gap-2" aria-label="Type de relance">
        {SEGMENTS.map((sg) => (
          <Link
            key={sg.key}
            href={`${PATH}?type=${sg.key}&filtre=${filter.key}`}
            aria-current={sg.key === segment.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium",
              sg.key === segment.key ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {sg.label}
          </Link>
        ))}
      </nav>

      {shops.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {filter.key === "a-relancer"
            ? "Toutes les boutiques concernées ont déjà été relancées."
            : empty
              ? "Aucune boutique sans produit."
              : "Aucune boutique en brouillon avec des produits."}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {shops.map((s) => {
          const owner = owners.get(s.owner_id);
          const firstName = owner?.name?.split(/\s+/)[0] ?? null;
          const contactedAt = lastContact.get(s.id);
          const wa = `https://wa.me/${s.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(relanceMessage(firstName, s.name, s.products.length))}`;
          const location = [s.district, s.city].filter(Boolean).join(", ");
          return (
            <li key={s.id} className="rounded-2xl border border-border bg-card">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {s.name}
                    <Badge variant={s.products.length ? "accent" : "warning"}>
                      {s.products.length ? `${s.products.length} produit${s.products.length > 1 ? "s" : ""}` : "Aucun produit"}
                    </Badge>
                    {s.status === "published" && <Badge variant="neutral">En ligne</Badge>}
                    {contactedAt && <Badge variant="success">Relancée le {frDate(contactedAt)}</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {owner?.name ?? "Vendeur"} · <span className="tabular-nums">{formatSenegalPhone(s.whatsapp)}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[s.category_label, location].filter(Boolean).join(" · ")}
                    {(s.category_label || location) && " · "}
                    Boutique créée le {frDate(s.created_at)}
                    {s.products[0] ? ` · dernier produit modifié le ${frDate(s.products[0].updated_at)}` : ""}
                    {owner?.lastSignIn ? ` · dernière connexion ${frDateTime(owner.lastSignIn)}` : ""}
                  </p>
                </div>
                <div className="shrink-0">
                  <ContactButton shopId={s.id} href={wa} reason={segment.reason} />
                </div>
              </div>

              {/* Produits (non publics tant que la boutique est en brouillon) */}
              {s.products.length > 0 && (
              <details className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
                  <Package className="h-4 w-4" />
                  Voir les produits
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4 lg:grid-cols-6">
                  {s.products.map((p) => {
                    const main = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.path;
                    const thumb = shopMediaThumbUrl(main);
                    return (
                      <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-background">
                        <div className="relative aspect-square bg-muted">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-muted-foreground">
                              <ImageOff className="h-5 w-5" />
                            </span>
                          )}
                          {p.status !== "active" && (
                            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              {STATUS_LABEL[p.status] ?? p.status}
                            </span>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-2 text-xs font-medium leading-snug">{p.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {p.subject_type === "service" && p.price != null ? "À partir de " : ""}
                            {formatPrice(p.price)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
