import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { frDate, frDateTime } from "@/lib/admin/market";
import { formatSenegalPhone } from "@/lib/shops/format";
import { JAARLE_STATUS_NUMBER_DISPLAY } from "@/lib/whatsapp/contact";
import { ContactButton } from "./contact-button";
import { FilterTabs, SegmentPills, type FilterKey } from "./segments";

// « WhatsApp non vérifié » : boutiques (hors suspendues) dont le numéro WhatsApp n'a pas encore été
// vérifié (migration 0049, shops.whatsapp_verified_at). Les publiées d'abord : ce sont elles que les
// clients voient. Relance notée dans admin_actions (shop.contacted, reason = wa_unverified).

type Row = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  status: string;
  whatsapp: string;
  city: string | null;
  category_label: string | null;
  created_at: string;
  products: { count: number }[] | null;
};

function message(firstName: string | null, shopName: string): string {
  const hello = firstName ? `Bonjour ${firstName}` : "Bonjour";
  return (
    `${hello}, c'est l'équipe Jaarle 👋\n` +
    `Tu peux maintenant faire vérifier le WhatsApp de ta boutique « ${shopName} » : tes clients verront le badge ✅ « WhatsApp vérifié » à côté de ton nom, et ça rassure avant de commander.\n` +
    `C'est 30 secondes : Jaarle → Ma boutique → « Vérifier sur WhatsApp », puis envoie le message qui s'ouvre.\n` +
    `Et enregistre aussi le ${JAARLE_STATUS_NUMBER_DISPLAY} (Jaarle) dans tes contacts pour voir nos statuts : astuces de vente et nouveautés.`
  );
}

export async function ShopsWithoutWhatsappVerification({ filter }: { filter: FilterKey }) {
  const admin = createAdminClient();
  const [{ data, error }, verified] = await Promise.all([
    admin
      .from("shops")
      .select("id, owner_id, name, slug, status, whatsapp, city, category_label, created_at, products(count)")
      .neq("status", "suspended")
      .is("whatsapp_verified_at", null)
      .order("created_at", { ascending: false })
      .limit(2000),
    admin.from("shops").select("id", { count: "exact", head: true }).not("whatsapp_verified_at", "is", null),
  ]);
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Boutiques indisponibles : {error.message}. La migration 0049 (vérification WhatsApp) est-elle appliquée ?
      </p>
    );
  }
  const rows = (data ?? []) as Row[];

  const lastContact = new Map<string, string>();
  if (rows.length) {
    const { data: logs } = await admin
      .from("admin_actions")
      .select("target_id, created_at")
      .eq("action", "shop.contacted")
      .eq("details->>reason", "wa_unverified")
      .in("target_id", rows.map((r) => r.id))
      .order("created_at", { ascending: false });
    for (const l of (logs ?? []) as { target_id: string; created_at: string }[]) {
      if (!lastContact.has(l.target_id)) lastContact.set(l.target_id, l.created_at);
    }
  }

  const productCount = (r: Row) => r.products?.[0]?.count ?? 0;
  const list = rows
    .filter((r) => filter === "toutes" || !lastContact.has(r.id))
    // En ligne d'abord, puis les catalogues les plus fournis.
    .sort((a, b) => Number(b.status === "published") - Number(a.status === "published") || productCount(b) - productCount(a))
    .slice(0, 150);

  const owners = new Map<string, { name: string | null; lastSignIn: string | null }>();
  await Promise.all(
    [...new Set(list.map((r) => r.owner_id))].map(async (id) => {
      const { data: u } = await admin.auth.admin.getUserById(id);
      const name = typeof u.user?.user_metadata?.full_name === "string" ? u.user.user_metadata.full_name.trim() : null;
      owners.set(id, { name: name || null, lastSignIn: u.user?.last_sign_in_at ?? null });
    })
  );
  const notContacted = rows.filter((r) => !lastContact.has(r.id)).length;

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Boutiques à relancer</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} boutique{rows.length > 1 ? "s" : ""} sans WhatsApp vérifié · {verified.count ?? 0} vérifiée
            {(verified.count ?? 0) > 1 ? "s" : ""} · {notContacted} pas encore relancée{notContacted > 1 ? "s" : ""}.
          </p>
        </div>
        <FilterTabs segment="whatsapp" filter={filter} />
      </div>
      <SegmentPills segment="whatsapp" filter={filter} />

      {/* Contacts des vendeurs → carnet du téléphone Jaarle (pour qu'ils voient les statuts). */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-semibold">Contacts des vendeurs pour tes statuts WhatsApp</p>
          <p className="text-muted-foreground">
            Fichier .vcf de toutes les boutiques, à ouvrir sur le téléphone du {JAARLE_STATUS_NUMBER_DISPLAY} pour les ajouter aux contacts. Les
            vendeurs voient tes statuts s&apos;ils ont aussi enregistré ce numéro (rappelé dans la relance).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="secondary" asChild>
            <a href="/api/admin/contacts?periode=30">
              <Download className="h-4 w-4" /> 30 derniers jours
            </a>
          </Button>
          <Button size="sm" asChild>
            <a href="/api/admin/contacts">
              <Download className="h-4 w-4" /> Tous les vendeurs
            </a>
          </Button>
        </div>
      </div>

      {list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {filter === "a-relancer" ? "Toutes les boutiques non vérifiées ont déjà été relancées." : "Toutes les boutiques ont vérifié leur WhatsApp."}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {list.map((r) => {
          const owner = owners.get(r.owner_id);
          const contactedAt = lastContact.get(r.id);
          const n = productCount(r);
          const href = `https://wa.me/${r.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message(owner?.name?.split(/\s+/)[0] ?? null, r.name))}`;
          return (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {r.name}
                  <Badge variant={r.status === "published" ? "neutral" : "warning"}>{r.status === "published" ? "En ligne" : "Brouillon"}</Badge>
                  <Badge variant="accent">
                    {n} produit{n > 1 ? "s" : ""}
                  </Badge>
                  {contactedAt && <Badge variant="success">Relancée le {frDate(contactedAt)}</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {owner?.name ?? "Vendeur"} · <span className="tabular-nums">{formatSenegalPhone(r.whatsapp)}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[r.category_label, r.city].filter(Boolean).join(" · ")}
                  {(r.category_label || r.city) && " · "}
                  Boutique créée le {frDate(r.created_at)}
                  {owner?.lastSignIn ? ` · dernière connexion ${frDateTime(owner.lastSignIn)}` : ""}
                </p>
              </div>
              <div className="shrink-0">
                <ContactButton shopId={r.id} href={href} reason="wa_unverified" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
