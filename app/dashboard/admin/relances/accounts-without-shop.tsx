import type { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { frDate, frDateTime } from "@/lib/admin/market";
import { formatSenegalPhone } from "@/lib/shops/format";
import { ContactButton } from "./contact-button";
import { FilterTabs, SegmentPills, type FilterKey } from "./segments";

// « Compte sans boutique » : comptes créés qui n'ont jamais créé de boutique (la plus grosse
// perte du parcours vendeur). Comptes lus via l'API d'administration Supabase Auth ; les
// comptes admin sont exclus. Relance notée dans admin_actions (user.contacted).

const PER_PAGE = 1000;
const MAX_PAGES = 20;

async function allUsers(): Promise<User[]> {
  const admin = createAdminClient();
  const users: User[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error || !data) break;
    users.push(...data.users);
    if (data.users.length < PER_PAGE) break;
  }
  return users;
}

/** Numéro WhatsApp donné à l'inscription, sinon le numéro de connexion (E.164 sans « + »). */
function whatsappDigits(u: User): string {
  const wa = typeof u.user_metadata?.whatsapp_number === "string" ? u.user_metadata.whatsapp_number : "";
  return (wa || u.phone || "").replace(/\D/g, "");
}

function message(firstName: string | null, posters: number): string {
  const hello = firstName ? `Bonjour ${firstName}` : "Bonjour";
  const intro =
    posters > 0
      ? `Merci d'utiliser Jaarle pour tes affiches ! Savais-tu que tu peux aussi avoir ta boutique en ligne, gratuitement ?`
      : `Ton compte Jaarle est prêt, mais ta boutique n'est pas encore créée.`;
  return (
    `${hello}, c'est l'équipe Jaarle 👋\n` +
    `${intro}\n` +
    `En 2 minutes : Jaarle → Ma boutique → crée ta boutique (nom, WhatsApp, logo). Tu auras ton lien et ton QR code à partager, et tes clients commandent directement sur WhatsApp.\n` +
    `Tu veux qu'on t'aide à la créer ?`
  );
}

export async function AccountsWithoutShop({ filter }: { filter: FilterKey }) {
  const admin = createAdminClient();
  const [users, shopsRes, adminsRes] = await Promise.all([
    allUsers(),
    admin.from("shops").select("owner_id").limit(20000),
    admin.from("account_profiles").select("user_id").eq("is_admin", true),
  ]);
  if (shopsRes.error) return <p className="text-sm text-destructive">Boutiques indisponibles : {shopsRes.error.message}</p>;

  const withShop = new Set(((shopsRes.data ?? []) as { owner_id: string }[]).map((r) => r.owner_id));
  const admins = new Set(((adminsRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const noShop = users.filter((u) => !withShop.has(u.id) && !admins.has(u.id) && whatsappDigits(u));

  const ids = noShop.map((u) => u.id);
  const lastContact = new Map<string, string>();
  const posters = new Map<string, number>();
  if (ids.length) {
    const [logs, creations] = await Promise.all([
      admin.from("admin_actions").select("target_id, created_at").eq("action", "user.contacted").in("target_id", ids).order("created_at", { ascending: false }),
      // Affiches déjà créées : ces comptes utilisent Jaarle autrement (message adapté).
      admin.from("creations").select("user_id").in("user_id", ids).limit(10000),
    ]);
    for (const l of (logs.data ?? []) as { target_id: string; created_at: string }[]) {
      if (!lastContact.has(l.target_id)) lastContact.set(l.target_id, l.created_at);
    }
    for (const c of (creations.data ?? []) as { user_id: string }[]) posters.set(c.user_id, (posters.get(c.user_id) ?? 0) + 1);
  }

  const list = noShop
    .filter((u) => filter === "toutes" || !lastContact.has(u.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 150);
  const notContacted = noShop.filter((u) => !lastContact.has(u.id)).length;

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Boutiques à relancer</h1>
          <p className="text-sm text-muted-foreground">
            {noShop.length} compte{noShop.length > 1 ? "s" : ""} sans boutique · {notContacted} pas encore relancé{notContacted > 1 ? "s" : ""}.
          </p>
        </div>
        <FilterTabs segment="sans-boutique" filter={filter} />
      </div>
      <SegmentPills segment="sans-boutique" filter={filter} />

      {list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {filter === "a-relancer" ? "Tous les comptes sans boutique ont déjà été relancés." : "Aucun compte sans boutique."}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {list.map((u) => {
          const name = typeof u.user_metadata?.full_name === "string" ? u.user_metadata.full_name.trim() || null : null;
          const digits = whatsappDigits(u);
          const count = posters.get(u.id) ?? 0;
          const contactedAt = lastContact.get(u.id);
          const href = `https://wa.me/${digits}?text=${encodeURIComponent(message(name?.split(/\s+/)[0] ?? null, count))}`;
          return (
            <li key={u.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {name ?? "Sans nom"}
                  {count > 0 && (
                    <Badge variant="accent">
                      {count} affiche{count > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {contactedAt && <Badge variant="success">Relancé le {frDate(contactedAt)}</Badge>}
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">WhatsApp {formatSenegalPhone(`+${digits}`)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inscrit le {frDate(u.created_at)}
                  {u.last_sign_in_at ? ` · dernière connexion ${frDateTime(u.last_sign_in_at)}` : " · jamais connecté"}
                </p>
              </div>
              <div className="shrink-0">
                <ContactButton shopId={u.id} href={href} reason="no_shop" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
